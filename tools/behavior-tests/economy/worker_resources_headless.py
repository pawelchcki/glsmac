#!/usr/bin/env python3
"""Execute shipped GSE land-resource policy without pixels or original assets."""
import argparse
from pathlib import Path
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from economy import headless
from economy.worker_resources_contract import ALGORITHM, validate_input
from protocol import ProtocolError, load_request, write_response


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=headless.DEFAULT_RUNTIME)
    parser.add_argument('--jobs', type=int, default=2)
    args = parser.parse_args()
    metadata, rows = headless.replay(load_request()['cases'], args.runtime, args.jobs,
                                     algorithm=ALGORITHM, input_validator=validate_input,
                                     template_path=Path(__file__).with_name('_worker_resources.gls.js'))
    metadata.update(name='glsmac-headless-land-worker-resources', contract=ALGORITHM,
                    mocked=['tile-manager registration', 'tile/player/faction descriptors', 'equivalent installed rule inputs'],
                    executed=['native installed-text parser', 'production land resource rule consumer',
                              'production resources.configure get_tile_resources handler', 'production land improvement policy'])
    write_response(metadata, rows)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Headless land-worker replay failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
