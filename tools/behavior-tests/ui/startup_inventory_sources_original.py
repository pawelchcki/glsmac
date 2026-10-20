#!/usr/bin/env python3
"""Execute actual startup with controlled faction starting-technology inputs."""
import argparse
import hashlib
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui import startup_inventory_original as original
from ui.startup_inventory_sources import profiles, fingerprint_profiles
from ui.startup_inventory_sources_contract import ALGORITHM, validate_input
from ui.vision import VisionError

DIRECTORY = Path(__file__).resolve().parent


def fingerprint():
    digest = hashlib.sha256(original.fingerprint().encode())
    for name in ('startup_inventory_sources.py', 'startup_inventory_sources_contract.py', 'startup_inventory_sources_original.py'):
        digest.update((DIRECTORY / name).read_bytes())
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--wine', default='wine')
    parser.add_argument('--timeout', type=float, default=45)
    parser.add_argument('--artifacts', type=Path, default=DIRECTORY.parent / '.build/startup-inventory-sources-original')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported:
        validate_input(case['input'])
    metadata, rows = ({'name': 'startup-inventory-sources-original', 'kind': 'adapter'}, [])
    if supported:
        initial = fingerprint(); sources = profiles(args.assets)
        metadata, rows = original.capture(supported, args, source_profiles=sources)
        if fingerprint() != initial:
            raise ProtocolError('startup source observer changed during capture')
        metadata.update(contract=ALGORITHM, adapter_sha256=initial, source_profiles_sha256=fingerprint_profiles(sources),
                        controlled_inputs='One TECH value exchanged in the selected faction source; all other bonus pairs retained')
    iterator = iter(rows)
    write_response(metadata, [next(iterator) if case['algorithm'] == ALGORITHM else
                             {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown source inventory contract'} for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, VisionError, subprocess.SubprocessError) as error:
        print('Original source inventory capture failed: ' + str(error), file=sys.stderr); sys.exit(1)
