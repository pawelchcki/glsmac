#!/usr/bin/env python3
"""Replay production startup and inspect actual native inventory without pixels."""
import argparse
from pathlib import Path
import re
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fast import create_snapshot
from protocol import ProtocolError, load_request, write_response
from ui import faction_setup_headless as runner
from ui.startup_inventory_contract import ALGORITHM, validate_input, validate_output

DIRECTORY = Path(__file__).resolve().parent


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('native startup worker did not complete: ' + text[-2500:])
    rows, current, units, complete = [], None, {}, False
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(INVENTORY_[A-Z]+(?:\|.*)?)$', line)
        if not match:
            continue
        if complete:
            raise ProtocolError('late startup inventory marker')
        tag, separator, body = match[1].partition('|')
        if tag == 'INVENTORY_CASE':
            if not separator or current is not None or len(rows) >= len(cases) or body != cases[len(rows)]['id']:
                raise ProtocolError('unknown, duplicate or reordered inventory case')
            current, units = body, {}
        elif tag in ('INVENTORY_ACTIVE', 'INVENTORY_PRODUCTION'):
            if current is None or not separator or not body or '|' in body:
                raise ProtocolError('orphan or invalid native inventory row')
            row = units.setdefault(body, {'name': body, 'active': 0, 'production': 0, 'lost': 0})
            row['active' if tag == 'INVENTORY_ACTIVE' else 'production'] += 1
        elif tag == 'INVENTORY_END':
            if separator or current is None:
                raise ProtocolError('invalid inventory case completion')
            output = {'units': [units[name] for name in sorted(units)]}; validate_output(output)
            rows.append({'id': current, 'status': 'ok', 'output': output}); current = None
        elif tag == 'INVENTORY_DONE':
            if not separator or current is not None or body != str(len(cases)) or len(rows) != len(cases):
                raise ProtocolError('invalid inventory batch completion')
            complete = True
        else:
            raise ProtocolError('unknown inventory marker')
    if not complete:
        raise ProtocolError('missing native inventory batch completion')
    return rows


def sources():
    return create_snapshot(), (DIRECTORY / '_startup_inventory.gls.js').read_text()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=runner.ROOT / 'build/wasm/bin/GLSMAC.js')
    parser.add_argument('--jobs', type=int, choices=(1, 2), default=2)
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported:
        validate_input(case['input'])
    metadata, rows = ({'name': 'startup-inventory-headless', 'kind': 'adapter'}, [])
    if supported:
        runner.sources, runner.parse_candidate = sources, parse_candidate
        metadata, rows = runner.headless(supported, args.runtime.resolve(), args.jobs)
        metadata.update(name='glsmac-native-startup-inventory',
                        executed=['production world startup callback', 'production unit definitions and event handlers',
                                  'native unit/base/player managers and production state'],
                        mocked=['4x4 land terrain and coordinate draws', 'one synthetic selected faction/owner',
                                'facility artwork', 'frontend notifications and base initialization callbacks'])
    iterator = iter(rows)
    write_response(metadata, [next(iterator) if case['algorithm'] == ALGORITHM else
                             {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown startup inventory contract'} for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native startup inventory replay failed: ' + str(error), file=sys.stderr); sys.exit(1)
