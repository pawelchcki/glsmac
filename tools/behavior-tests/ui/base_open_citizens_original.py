"""Fresh original executions, projecting citizen opening separately from raw food.

The full signed-counter observation remains immutable in its own contract.
This observer never reads either contract's recorded answers.
"""
import argparse
import hashlib
from pathlib import Path
import shlex
import subprocess
import sys

DIRECTORY = Path(__file__).resolve().parent
sys.path.insert(0, str(DIRECTORY.parent))
from compare import run_probe
from protocol import ProtocolError, load_request, write_response
from ui.base_open_contract import validate_input

ALGORITHM = 'ui.base_open_citizens.v1'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--wine', required=True)
    parser.add_argument('--artifacts', type=Path, required=True)
    args = parser.parse_args()
    request = load_request()
    own_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    for case in request['cases']:
        if case['algorithm'] != ALGORITHM:
            raise ProtocolError('Unknown citizen-opening contract')
        validate_input(case['input'])
    delegated = {'version': 1, 'cases': [
        dict(case, algorithm='ui.base_open_city_recalc.v1') for case in request['cases']
    ]}
    command = shlex.join([sys.executable, str(DIRECTORY / 'base_open_original.py'),
                          '--assets', str(args.assets.resolve()), '--wine', args.wine,
                          '--artifacts', str(args.artifacts.resolve())])
    response = run_probe(command, delegated, timeout=600)
    for row in response['results']:
        if row['status'] != 'ok':
            raise ProtocolError('Original base-opening execution was incomplete')
        for state in row['output']['trace']:
            del state['base']['nutrients']
    if hashlib.sha256(Path(__file__).read_bytes()).hexdigest() != own_hash:
        raise ProtocolError('Citizen-opening observer changed during capture')
    metadata = response['implementation'].copy()
    metadata['full_observer_sha256'] = metadata['adapter_sha256']
    metadata['adapter_sha256'] = hashlib.sha256((metadata['adapter_sha256'] + own_hash).encode()).hexdigest()
    metadata['contract'] = ALGORITHM
    metadata['projection'] = 'All actual base-opening observations except signed native nutrient counter; fresh original execution for every case and recorder repeat'
    metadata['boundaries'] += '; excludes nutrient-counter semantics and equivalence to reproduction stored food; full counter contract remains separately pending'
    write_response(metadata, response['results'])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Original citizen opening failed:', error, file=sys.stderr)
        sys.exit(1)
