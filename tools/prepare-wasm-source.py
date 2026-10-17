#!/usr/bin/env python3
"""Package the corresponding app sources, excluding local data and credentials."""

import argparse
import gzip
import io
from pathlib import Path, PurePosixPath
import subprocess
import tarfile


ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIRS = {'src', 'cmake', 'dependencies', 'resource', 'tools', 'web'}
SOURCE_FILES = {'CMakeLists.txt', 'CMakePresets.json', 'LICENSE', 'README.md',
                'CHANGELOG.md', '.gitignore', '.clang-format'}


def source_paths():
    if (ROOT / '.git').exists():
        names = subprocess.check_output(
            ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT,
        ).decode().split('\0')
    else:
        names = (ROOT / 'SOURCE_MANIFEST').read_text().splitlines()
    result = []
    for name in sorted(set(names) - {''}):
        path = PurePosixPath(name)
        allowed = (name in SOURCE_FILES or path.parts[0] in SOURCE_DIRS
                   or path.parts[:2] in {('GLSMAC_data', 'default'), ('GLSMAC_data', 'tests')})
        if not allowed:
            continue
        if path.is_absolute() or '..' in path.parts:
            raise ValueError(f'Unsafe source path: {name}')
        file = ROOT / name
        if file.is_symlink() or any(parent.is_symlink() for parent in file.parents if parent != ROOT):
            raise ValueError(f'Source symlinks are not packaged: {name}')
        if file.is_file():
            result.append((name, file))
    return result


def package(output):
    if (ROOT / '.git').exists():
        version = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT).strip() + b'\n'
    else:
        version = (ROOT / 'SOURCE_VERSION').read_bytes()
    sources = source_paths()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + '.tmp')
    try:
        with temporary.open('wb') as raw, gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w|', format=tarfile.PAX_FORMAT) as archive:
                for name, path in sources:
                    data = path.read_bytes()
                    entry = tarfile.TarInfo(f'GLSMAC-source/{name}')
                    entry.size = len(data)
                    entry.mode = 0o755 if path.stat().st_mode & 0o111 else 0o644
                    archive.addfile(entry, io.BytesIO(data))
                for name, data in [('SOURCE_VERSION', version), ('SOURCE_MANIFEST',
                                    ''.join(f'{name}\n' for name, _ in sources).encode())]:
                    entry = tarfile.TarInfo(f'GLSMAC-source/{name}')
                    entry.size = len(data)
                    entry.mode = 0o644
                    archive.addfile(entry, io.BytesIO(data))
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    package(parser.parse_args().output.resolve())
