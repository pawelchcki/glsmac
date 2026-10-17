#!/usr/bin/env python3
"""Index an original SMAC asset directory for browser streaming; never copy it."""

import argparse
from pathlib import Path

from wasm_assets import AssetError, write_manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="original game asset directory")
    parser.add_argument("--output", required=True, type=Path,
                        help="manifest file; host it beside the indexed asset files")
    parser.add_argument("--force", action="store_true", help="replace an existing manifest")
    args = parser.parse_args()
    try:
        manifest = write_manifest(args.directory, args.output, force=args.force)
    except (AssetError, OSError) as error:
        parser.error(str(error))
    total = sum(entry["size"] for entry in manifest["files"])
    print(f"Indexed {len(manifest['files'])} files ({total:,} bytes)")
    print(f"Revision: {manifest['id']}")
    print(f"Manifest: {args.output}")


if __name__ == "__main__":
    main()
