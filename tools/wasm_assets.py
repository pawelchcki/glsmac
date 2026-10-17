"""Manifest and path handling shared by the WASM asset tools."""

import hashlib
import json
import os
from pathlib import Path
import stat
import tempfile


class AssetError(ValueError):
    pass


def asset_root(directory):
    root = Path(directory).resolve(strict=True)
    if not root.is_dir():
        raise AssetError(f"Asset path is not a directory: {directory}")
    return root


def validate_path(path):
    """Accept portable relative POSIX paths, including spaces and Unicode."""
    if not isinstance(path, str) or not path or "\\" in path:
        raise AssetError(f"Invalid asset path: {path!r}")
    if any(part in ("", ".", "..") for part in path.split("/")):
        raise AssetError(f"Invalid asset path: {path!r}")
    if any(ord(char) < 32 or ord(char) == 127 for char in path):
        raise AssetError(f"Control character in asset path: {path!r}")
    return path


def checked_path(root, path):
    """Reject traversal and symlinks, also when files changed after indexing."""
    validate_path(path)
    candidate = root
    for part in path.split("/"):
        candidate /= part
        if candidate.is_symlink():
            raise AssetError(f"Symlinks are not supported in assets: {path}")
    resolved = candidate.resolve(strict=True)
    if not resolved.is_relative_to(root):
        raise AssetError(f"Asset path escapes its directory: {path}")
    return resolved


def open_asset(root, path):
    """Open a regular file without following symlinks in any path component."""
    validate_path(path)
    # Directory-relative opens close the check/open race on platforms that
    # provide O_NOFOLLOW. Keep a checked fallback for other Python platforms.
    if not hasattr(os, "O_NOFOLLOW") or os.open not in os.supports_dir_fd:
        target = checked_path(root, path)
        handle = target.open("rb")
        if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
            handle.close()
            raise AssetError(f"Asset is not a regular file: {path}")
        return handle
    directory_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        parts = path.split("/")
        for part in parts[:-1]:
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                              dir_fd=directory_fd)
            os.close(directory_fd)
            directory_fd = next_fd
        file_fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                          dir_fd=directory_fd)
        if not stat.S_ISREG(os.fstat(file_fd).st_mode):
            os.close(file_fd)
            raise AssetError(f"Asset is not a regular file: {path}")
        return os.fdopen(file_fd, "rb")
    finally:
        os.close(directory_fd)


def manifest_bytes(manifest):
    return (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def build_manifest(directory, exclude=()):
    root = asset_root(directory)
    # A previously generated default manifest must never index itself.
    excluded = {root / "manifest.json", *(Path(path).absolute() for path in exclude)}
    files = []

    def scan_error(error):
        raise error

    for parent, directories, names in os.walk(root, followlinks=False, onerror=scan_error):
        for name in directories + names:
            candidate = Path(parent) / name
            if candidate.is_symlink():
                raise AssetError(f"Symlinks are not supported in assets: {candidate}")
        for name in names:
            candidate = Path(parent) / name
            if candidate in excluded:
                continue
            path = validate_path(candidate.relative_to(root).as_posix())
            digest = hashlib.sha256()
            with open_asset(root, path) as handle:
                before = os.fstat(handle.fileno())
                for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                    digest.update(chunk)
                after = os.fstat(handle.fileno())
            if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                raise AssetError(f"Asset changed while hashing: {path}; try again")
            files.append({"path": path, "size": after.st_size, "sha256": digest.hexdigest()})
    if not files:
        raise AssetError(f"No asset files found in {root}")
    files.sort(key=lambda entry: entry["path"])
    canonical = json.dumps(files, ensure_ascii=False, sort_keys=True,
                           separators=(",", ":")).encode("utf-8")
    return {"version": 1, "id": hashlib.sha256(canonical).hexdigest(), "files": files}


def write_manifest(directory, output, force=False):
    output = Path(output).absolute()
    if output.is_symlink():
        raise AssetError(f"Manifest output must not be a symlink: {output}")
    if output.exists() and not force:
        raise FileExistsError(f"Refusing to overwrite {output}; use --force to replace it")
    manifest = build_manifest(directory, exclude=(output,))
    data = manifest_bytes(manifest)
    # O_EXCL prevents an accidental overwrite if the target appears while hashing.
    if not force:
        with output.open("xb") as handle:
            handle.write(data)
    else:
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=output.parent, prefix=".manifest-",
                                             suffix=".tmp", delete=False) as handle:
                temporary = Path(handle.name)
                handle.write(data)
            os.replace(temporary, output)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    return manifest
