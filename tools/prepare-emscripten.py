#!/usr/bin/env python3
"""Apply the verified upstream proxy-completion fix to our pinned SDK."""

import argparse
import hashlib
import os
from pathlib import Path
import shutil
import sys
import tempfile


VERSION = '4.0.22'
UPSTREAM = 'f3fef05bf5d63df33ed21eb067b86d827c546bfa'
ORIGINAL_SHA256 = 'cbae5a9736353234d3991e19ca74ce5779fe0f7eb45a35e10f7cc2b2622b8c00'
PATCHED_SHA256 = '848d2f47c840a48d583734bc7fef9565599187cd63fa61ab1b0c6529edb2a01c'
BEFORE = b'    pthread_mutex_unlock(&ctx->sync.mutex);\n    pthread_cond_signal(&ctx->sync.cond);'
AFTER = b'    pthread_cond_signal(&ctx->sync.cond);\n    pthread_mutex_unlock(&ctx->sync.mutex);'


def validated_source(root):
    version = (root / 'emscripten-version.txt').read_text().strip().strip('"')
    if version != VERSION:
        raise ValueError(f'Expected Emscripten {VERSION}, found {version}; reassess the backport before upgrading')
    source = root / 'system/lib/pthread/proxying.c'
    data = source.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest not in (ORIGINAL_SHA256, PATCHED_SHA256):
        raise ValueError(f'Unrecognized SDK source {source}: {digest}')
    return source, data, digest


def apply_backport(root, cache):
    cache.ensure_setup()
    with cache.lock('GLSMAC proxy completion backport'):
        source, data, digest = validated_source(root)
        if digest == PATCHED_SHA256:
            return False
        patched = data.replace(BEFORE, AFTER)
        if data.count(BEFORE) != 2 or hashlib.sha256(patched).hexdigest() != PATCHED_SHA256:
            raise ValueError('Unexpected SDK backport result')
        # Erase first: interruption before publishing the source cannot leave
        # patched source alongside libraries built from the old implementation.
        # Use the SDK's own configured cache and its reentrant build lock.
        cache.erase()
        descriptor, temporary = tempfile.mkstemp(prefix='.proxying-', dir=source.parent)
        try:
            with os.fdopen(descriptor, 'wb') as stream:
                stream.write(patched)
                os.fchmod(stream.fileno(), source.stat().st_mode & 0o777)
            os.replace(temporary, source)
        finally:
            Path(temporary).unlink(missing_ok=True)
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--emcc', default=os.environ.get('EMCC') or shutil.which('emcc'),
                        help='emcc executable from the pinned SDK (default: EMCC or PATH)')
    args = parser.parse_args()
    if not args.emcc:
        parser.error('Activate emsdk_env.sh or pass --emcc')
    root = Path(args.emcc).resolve().parent
    try:
        validated_source(root)
        sys.path.insert(0, str(root))
        from tools import cache  # The pinned SDK owns cache configuration and locking.
        changed = apply_backport(root, cache)
    except (OSError, ValueError) as error:
        parser.exit(1, f'{error}\n')
    print(f'Emscripten {VERSION}: upstream {UPSTREAM} ' +
          ('applied; SDK cache cleared; relink existing applications' if changed else 'already applied'))


if __name__ == '__main__':
    main()
