#!/usr/bin/env python3
"""Execute production source consumers and real menu handlers without pixels."""
import argparse
from pathlib import Path
import re
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui import faction_setup_headless as runner
from ui.faction_identity_contract import ALGORITHM, validate_input, validate_output


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('identity worker did not complete: ' + text[-2000:])
    rows, current, values, missing, complete = [], None, [], False, False
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(IDENTITY_[A-Z]+(?:\|.*)?)$', line)
        if not match:
            continue
        tag, separator, body = match[1].partition('|')
        if complete:
            raise ProtocolError('late identity marker')
        if tag == 'IDENTITY_CASE':
            if not separator or current is not None or len(rows) >= len(cases) or body != cases[len(rows)]['id']:
                raise ProtocolError('unknown, duplicate or reordered identity case')
            current, values, missing = body, [], False
        elif tag == 'IDENTITY_VALUE':
            if not separator or current is None or missing:
                raise ProtocolError('orphan native identity field')
            values.append(body)
        elif tag == 'IDENTITY_MISSING':
            if separator or current is None or values or missing:
                raise ProtocolError('invalid missing identity observation')
            missing = True
        elif tag == 'IDENTITY_END':
            if separator or current is None:
                raise ProtocolError('invalid identity completion')
            if missing:
                rows.append({'id': current, 'status': 'unsupported', 'reason': 'actual start request does not transfer faction identity'})
            else:
                output = {'identity': values}; validate_output(output)
                rows.append({'id': current, 'status': 'ok', 'output': output})
            current = None
        elif tag == 'IDENTITY_COMPLETE':
            if not separator or body != str(len(cases)) or current is not None or len(rows) != len(cases):
                raise ProtocolError('invalid identity batch completion')
            complete = True
        else:
            raise ProtocolError('unknown identity marker')
    if not complete or current is not None or len(rows) != len(cases):
        raise ProtocolError('missing native identity completion')
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=runner.ROOT / 'build/wasm/bin/GLSMAC.js')
    parser.add_argument('--jobs', type=int, choices=(1, 2), default=2)
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported:
        validate_input(case['input'])
    metadata, rows = ({'name': 'faction-identity-headless', 'kind': 'adapter'}, [])
    if supported:
        runner.parse_candidate = parse_candidate
        probes = [dict(case, input=dict(case['input'], handoff=1)) for case in supported]
        metadata, rows = runner.headless(probes, args.runtime.resolve(), args.jobs)
        metadata['name'] = 'glsmac-faction-identity-handoff'
        metadata['scope'] = 'production sources/menu confirmation, actual native identity validation, wrapper and codec; world startup checked separately'
    iterator = iter(rows)
    write_response(metadata, [next(iterator) if case['algorithm'] == ALGORITHM else
                             {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown identity contract'} for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print(f'Faction identity replay failed: {error}', file=sys.stderr); sys.exit(1)
