#!/usr/bin/env python3
"""Record local delivery context without changing Git state or certifying checks."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def git(root, *args):
    return subprocess.check_output(
        ["git", "-c", "core.fsmonitor=false", "-C", str(root), *args],
        env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"}, stderr=subprocess.PIPE,
    )


def fingerprint(path):
    path = Path(path).absolute()
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
            size += len(chunk)
    return {"path": str(path), "bytes": size, "sha256": digest.hexdigest()}


def source_state(root, base_ref):
    status = git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all")
    entries = iter(status.split(b"\0")[:-1])
    dirty = []
    for entry in entries:
        code, name = entry[:2].decode("ascii"), os.fsdecode(entry[3:])
        row = {"status": code, "path": name}
        if "R" in code or "C" in code:
            row["original_path"] = os.fsdecode(next(entries))
        if code == "??":
            path = root / name
            # Hash the link itself, rather than reading an unrelated target.
            if path.is_symlink():
                row["symlink_sha256"] = hashlib.sha256(os.fsencode(os.readlink(path))).hexdigest()
            elif path.is_dir():
                row["contents"] = "untracked directory; nested repository contents not fingerprinted"
            else:
                row["sha256"] = fingerprint(path)["sha256"]
        dirty.append(row)
    return {
        "head": git(root, "rev-parse", "--verify", "HEAD^{commit}").decode().strip(),
        "branch": git(root, "branch", "--show-current").decode().strip() or None,
        "base_ref": base_ref,
        "base_head": git(root, "rev-parse", "--verify", base_ref + "^{commit}").decode().strip(),
        "base_observation": "local ref only; fetch and check remote CI before delivery",
        "dirty": dirty,
        "worktree_diff_sha256": hashlib.sha256(git(root, "diff", "--no-ext-diff", "--no-textconv", "--binary", "HEAD", "--")).hexdigest(),
        "index_diff_sha256": hashlib.sha256(git(root, "diff", "--cached", "--no-ext-diff", "--no-textconv", "--binary", "HEAD", "--")).hexdigest(),
    }


def remaining_items(root):
    roadmap = root / "ROADMAP.md"
    items = []
    current = None
    for line in roadmap.read_text(encoding="utf-8").splitlines():
        if line.startswith("- [ ] "):
            current = line[6:].strip()
            items.append(current)
        elif current is not None and line.startswith("  "):
            items[-1] += " " + line.strip()
        else:
            current = None
    lanes = json.loads((root / "tools/behavior-tests/lanes.json").read_text())
    pending = json.loads((root / "tools/behavior-tests/ui/pending-catalog.json").read_text())
    return {
        "roadmap": fingerprint(roadmap),
        "unchecked_items": items,
        "unrecorded_gaps": lanes["gaps"],
        "pending_ui_ids": [row["id"] for row in pending["references"]],
        "accounting": "pending and unsupported cases are not passing evidence",
    }


def capture(root, base_ref, owner, task, next_action, runtimes=(), reports=(), gaps=()):
    root = Path(os.fsdecode(git(root, "rev-parse", "--show-toplevel")).removesuffix("\n"))
    before = source_state(root, base_ref)
    runtime_files = []
    for value in runtimes:
        path = Path(value)
        runtime_files.append(fingerprint(path))
        if path.suffix == ".js":
            # An explicitly selected WASM loader must have its engine companion.
            runtime_files.append(fingerprint(path.with_suffix(".wasm")))
    report_files = [fingerprint(path) for path in reports]
    result = {
        "version": 1,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "worktree": str(root),
        "ownership": {"owner": owner, "task": task, "next_action": next_action},
        "source": before,
        "runtime": {
            "files": runtime_files,
            "compiled_source": "unknown; file hashes alone do not prove build provenance",
            "script_inputs": "separate from compiled runtime; regenerate the current TS package before testing",
        },
        "last_check_reports": {
            "files": report_files,
            "validation": "not revalidated; inspect each report's source/runtime binding and failures before reuse",
        },
        "remaining": remaining_items(root),
        "task_gaps": list(gaps),
    }
    if source_state(root, base_ref) != before:
        raise ValueError("Git/source state changed during capture; retry after work stops")
    for identity in runtime_files + report_files:
        if fingerprint(identity["path"]) != identity:
            raise ValueError("Runtime/report changed during capture: " + identity["path"])
    return result


def write_record(output, record):
    output = Path(output).absolute()
    # Resolve the parent so aliases and '..' cannot hide an in-checkout target.
    # Preserve the final component: os.replace replaces a symlink, not its target.
    output = output.parent.resolve() / output.name
    root = Path(record["worktree"]).resolve()
    if output.is_relative_to(root):
        # Never replace product sources or create a self-dirtying record.
        relative = output.relative_to(root).as_posix()
        git(root, "check-ignore", "--", relative)
        if git(root, "ls-files", "--", relative):
            raise ValueError("Handoff output must not be a tracked file")
    inputs = [row["path"] for row in record["runtime"]["files"] + record["last_check_reports"]["files"]]
    if output.resolve() in [Path(path).resolve() for path in inputs]:
        raise ValueError("Handoff output must not replace an input")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent, delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(record, stream, indent=2)
            stream.write("\n")
        os.replace(temporary, output)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--base-ref", default="refs/remotes/wasmsmac/main")
    parser.add_argument("--owner", required=True)
    parser.add_argument("--task", required=True)
    parser.add_argument("--next", dest="next_action", required=True)
    parser.add_argument("--runtime", type=Path, action="append", default=[])
    parser.add_argument("--check-report", type=Path, action="append", default=[])
    parser.add_argument("--gap", action="append", default=[])
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        record = capture(args.root, args.base_ref, args.owner, args.task, args.next_action,
                         args.runtime, args.check_report, args.gap)
        output = args.output or Path(record["worktree"]) / "build/handoff.json"
        write_record(output, record)
        print(output)
        return 0
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        print("Handoff capture failed: " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
