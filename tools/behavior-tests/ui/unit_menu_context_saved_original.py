#!/usr/bin/env python3
"""Launch the archived saved-fixture recorder with explicit import paths."""
import hashlib
from pathlib import Path
import runpy
import sys

DIRECTORY = Path(__file__).resolve().parent
ARCHIVE = DIRECTORY / 'reference-archives/unit-menu-context-saved-v26'
sys.path.insert(0, str(DIRECTORY.parent))
sys.path.insert(0, str(ARCHIVE))
recorded = runpy.run_path(str(ARCHIVE / 'unit_menu_context_saved_original.py'))
base = recorded['base']
recorded_fingerprint = base.fingerprint


def fingerprint():
    return hashlib.sha256(recorded_fingerprint().encode() + Path(__file__).read_bytes()).hexdigest()


base.fingerprint = fingerprint
if __name__ == '__main__':
    base.main()
