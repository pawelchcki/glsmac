#!/usr/bin/env python3
"""Replay current source consumers and native faction ratings without graphics."""
import argparse
from pathlib import Path
import re
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fast import create_snapshot
from protocol import ProtocolError, load_request, write_response
from ui import faction_setup_headless as runner
from ui.faction_ratings_contract import ALGORITHM, FIELDS, validate_input, validate_output

DIRECTORY = Path(__file__).resolve().parent


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('native rating worker did not complete: ' + text[-2500:])
    rows, complete = [], False
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(RATINGS_[A-Z]+(?:\|.*)?)$', line)
        if not match:
            continue
        if complete:
            raise ProtocolError('late rating marker')
        fields = match[1].split('|')
        if fields[0] == 'RATINGS_RESULT' and len(fields) == 6:
            if len(rows) >= len(cases) or fields[1] != cases[len(rows)]['id']:
                raise ProtocolError('unknown, duplicate or reordered rating case')
            try:
                values = list(map(int, fields[2:]))
            except ValueError as error:
                raise ProtocolError('noninteger rating observation') from error
            if fields[2:] != list(map(str, values)):
                raise ProtocolError('noncanonical rating observation')
            output = dict(zip(FIELDS, values)); validate_output(output)
            rows.append({'id': fields[1], 'status': 'ok', 'output': output})
        elif fields == ['RATINGS_DONE', str(len(cases))] and len(rows) == len(cases):
            complete = True
        else:
            raise ProtocolError('invalid rating marker')
    if not complete:
        raise ProtocolError('missing rating batch completion')
    return rows


def sources():
    return create_snapshot(), (DIRECTORY / '_faction_ratings.gls.js').read_text()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=runner.ROOT / 'build/wasm/bin/GLSMAC.js')
    parser.add_argument('--jobs', type=int, choices=(1, 2), default=2)
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported:
        validate_input(case['input'])
    metadata, rows = ({'name': 'faction-ratings-headless', 'kind': 'adapter'}, [])
    if supported:
        runner.sources, runner.parse_candidate = sources, parse_candidate
        metadata, rows = runner.headless(supported, args.runtime.resolve(), args.jobs)
        metadata['name'] = 'glsmac-initial-faction-ratings'
        metadata['executed'] = ['production faction/rule source parsers', 'production faction configure callback',
                                'native rating validation and wrappers', 'native rules setters/getters', 'faction codec']
    iterator = iter(rows)
    write_response(metadata, [next(iterator) if case['algorithm'] == ALGORITHM else
                             {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown social-rating contract'} for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print(f'Native faction rating replay failed: {error}', file=sys.stderr); sys.exit(1)
