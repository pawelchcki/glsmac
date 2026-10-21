#!/usr/bin/env python3
"""Observe actual owners after shared native single-player setup and startup."""
import argparse
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fast import create_snapshot
from protocol import ProtocolError, canonical, load_request, write_response
from ui.world_base_ownership_contract import ALGORITHM, parse_candidate, validate_input

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def gse_literal(value):
    if isinstance(value, str):
        return "'" + value.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n').replace('\r', '\\r') + "'"
    if isinstance(value, dict) and all(re.fullmatch('[a-z_]+', key) for key in value):
        return '{' + ','.join(key + ':' + gse_literal(item) for key, item in value.items()) + '}'
    if type(value) is int and value >= 0:
        return str(value)
    raise ProtocolError('unsupported ownership fixture value')


def headless(cases, runtime, node='node'):
    snapshot = create_snapshot()
    template = (DIRECTORY / '_world_base_ownership_headless.gls.js').read_text()
    source_hash = hashlib.sha256(canonical([snapshot, template]).encode()).hexdigest()
    hashes = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in (runtime, runtime.with_suffix('.wasm'))}
    rows, script_hashes = [], []
    for case in cases:
        scripts = dict(snapshot)
        script = 'GLSMAC_data/tests/world_base_ownership_probe.gls.js'
        scripts[script] = ('const world_case_id = ' + gse_literal(case['id']) + ';\n'
                           + 'const world_input = ' + gse_literal(case['input']) + ';\n' + template)
        script_hashes.append(hashlib.sha256(canonical(scripts).encode()).hexdigest())
        with tempfile.TemporaryDirectory(prefix='glsmac-world-ownership-') as temporary:
            source = Path(temporary) / 'scripts.json'
            source.write_text(canonical(scripts))
            request = {'runtime': str(runtime), 'snapshot': str(source), 'script': script, 'prefix': temporary}
            result = subprocess.run([node, str(DIRECTORY.parent / 'gse-worker.cjs')], input=canonical(request),
                                    text=True, capture_output=True, timeout=240, cwd=ROOT)
        if result.returncode:
            raise ProtocolError('ownership worker failed: ' + (result.stdout + result.stderr)[-3500:])
        rows.append(parse_candidate(result.stdout + result.stderr, case))
    if any(hashlib.sha256(path.read_bytes()).hexdigest() != value for path, value in hashes.items()):
        raise ProtocolError('ownership runtime changed during replay')
    return {'name': 'glsmac-world-base-ownership', 'kind': 'candidate', 'target': 'wasm-gse', 'rendering': False,
            'source_sha256': source_hash, 'batch_scripts_sha256': script_hashes,
            'loader_sha256': hashes[runtime], 'runtime_sha256': hashes[runtime.with_suffix('.wasm')],
            'executed': ['production faction configuration and native faction manager',
                         'shared production State single-player initializer', 'native game.get_players',
                         'shipped world/default and registered startup handlers', 'native host event queue',
                         'actual native base identities and owners'],
            'mocked': ['declared flat actual 40x80 grid', 'synthetic equivalent faction/component input records',
                       'faction colors and base names', 'graphics/frontend delivery and pre-world lifecycle',
                       'direct native initialization of declared human Doctor/stores',
                       'declared stacked Former/Colony companions'],
            'scope': 'Owners with bases only; no full roster, opponent identity/composition, AI decisions or later turns'}, rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--node', default=os.environ.get('NODE', 'node'))
    args = parser.parse_args()
    cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported:
        validate_input(case['input'])
    metadata, rows = {'name': 'glsmac-world-base-ownership', 'kind': 'candidate'}, []
    if supported:
        metadata, rows = headless(supported, args.runtime.resolve(), args.node)
    iterator = iter(rows)
    write_response(metadata, [next(iterator) if case['algorithm'] == ALGORITHM else
                             {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown world ownership contract'}
                             for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native ownership replay failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
