#!/usr/bin/env python3
"""Replay the same native startup with controlled equivalent faction inputs."""
import argparse
from pathlib import Path
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui import faction_setup_headless as runner
from ui.startup_inventory_headless import parse_candidate, sources
from ui.startup_inventory_sources_contract import ALGORITHM, validate_input


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=runner.ROOT / 'build/wasm/bin/GLSMAC.js')
    parser.add_argument('--jobs', type=int, choices=(1, 2), default=2)
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported:
        validate_input(case['input'])
    metadata, rows = ({'name': 'startup-source-inventory-headless', 'kind': 'adapter'}, [])
    if supported:
        runner.sources, runner.parse_candidate = sources, parse_candidate
        metadata, rows = runner.headless(supported, args.runtime.resolve(), args.jobs)
        metadata.update(name='glsmac-native-startup-source-inventory',
                        executed=['production faction bonus consumer and configure callback', 'native faction technology storage',
                                  'production component consumer and unit definitions', 'native prototype cost helper',
                                  'production startup/events', 'native live unit and queued-project state'],
                        mocked=['4x4 land terrain and coordinate draws', 'one selected native owner',
                                'equivalent installed input records', 'artwork/frontend delivery', 'base population initialization'])
    iterator = iter(rows)
    write_response(metadata, [next(iterator) if case['algorithm'] == ALGORITHM else
                             {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown source inventory contract'} for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native source startup replay failed: ' + str(error), file=sys.stderr); sys.exit(1)
