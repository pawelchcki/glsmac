#!/usr/bin/env python3
"""Observe natural city state after production post-map startup and first turn."""
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
from ui.natural_first_city_contract import ALGORITHM, parse_candidate, validate_input

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def gse_literal(value):
    if isinstance(value, str):
        return "'" + value.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n').replace('\r', '\\r') + "'"
    if isinstance(value, dict) and all(re.fullmatch('[a-z_]+', key) for key in value):
        return '{' + ','.join(key + ':' + gse_literal(item) for key, item in value.items()) + '}'
    if type(value) is bool:
        return 'true' if value else 'false'
    if type(value) is int and value >= 0:
        return str(value)
    raise ProtocolError('unsupported natural city fixture value')


def headless(cases, runtime, node='node'):
    snapshot = create_snapshot()
    template = (DIRECTORY / '_natural_first_city_headless.gls.js').read_text()
    source_hash = hashlib.sha256(canonical([snapshot, template]).encode()).hexdigest()
    hashes = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in (runtime, runtime.with_suffix('.wasm'))}
    rows, script_hashes = [], []
    for case in cases:
        scripts = dict(snapshot)
        script = 'GLSMAC_data/tests/natural_first_city_probe.gls.js'
        scripts[script] = ('const city_case_id = ' + gse_literal(case['id']) + ';\n'
                           + 'const city_input = ' + gse_literal(case['input']) + ';\n' + template)
        script_hashes.append(hashlib.sha256(canonical(scripts).encode()).hexdigest())
        with tempfile.TemporaryDirectory(prefix='glsmac-natural-first-city-') as temporary:
            source = Path(temporary) / 'scripts.json'
            source.write_text(canonical(scripts))
            request = {'runtime': str(runtime), 'snapshot': str(source), 'script': script, 'prefix': temporary}
            result = subprocess.run([node, str(DIRECTORY.parent / 'gse-worker.cjs')], input=canonical(request),
                                    text=True, capture_output=True, timeout=240, cwd=ROOT)
            if os.environ.get('NATURAL_CITY_ARTIFACTS'):
                logs = Path(os.environ['NATURAL_CITY_ARTIFACTS']); logs.mkdir(parents=True, exist_ok=True)
                (logs / (case['id'] + '.log')).write_text(result.stdout + result.stderr)
        if result.returncode:
            raise ProtocolError('natural city worker failed: ' + (result.stdout + result.stderr)[-3500:])
        rows.append(parse_candidate(result.stdout + result.stderr, case))
    if any(hashlib.sha256(path.read_bytes()).hexdigest() != value for path, value in hashes.items()):
        raise ProtocolError('natural city runtime changed during replay')
    return {'name': 'glsmac-natural-first-city', 'kind': 'candidate', 'target': 'wasm-gse', 'rendering': False,
            'source_sha256': source_hash, 'batch_scripts_sha256': script_hashes,
            'loader_sha256': hashes[runtime], 'runtime_sha256': hashes[runtime.with_suffix('.wasm')],
            'executed': ['production faction parser and native manager', 'shared State single-player initializer with actual native State/Player difficulty',
                         'native configure, create_world, InitComplete and FirstTurn',
                         'all shipped mechanical startup modules and event handlers',
                         'native host queue including first-turn production/growth/population events',
                         'actual native population, worked squares, nutrient custom store and mineral production store'],
            'mocked': ['declared uniform actual 40x80 flat-arid land, native lowland elevation 200',
                       'synthetic stock-equivalent faction/component/resource/terraforming input records',
                       'shared fixture initializer supplies default MT_RANDOM map type and preset2; original pricing-context equivalence unverified',
                       'faction colors and base names', 'constructor bypasses graphics/frontend and pre-world lifecycle',
                       'map generation, unused artwork/audio animation definitions and frontend notifications'],
            'year_normalization': 'actual settled native turn minus first playable epoch 1 from Game::FirstTurn',
            'scope': 'First human city only; original map-kind/size-kind pricing context, exact altitude/contour conversion, raw-resource general semantics, founding controls, research UI, AI and later turns unobserved'}, rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--node', default=os.environ.get('NODE', 'node'))
    args = parser.parse_args()
    cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported:
        validate_input(case['input'])
    metadata, rows = {'name': 'glsmac-natural-first-city', 'kind': 'candidate'}, []
    if supported:
        metadata, rows = headless(supported, args.runtime.resolve(), args.node)
    iterator = iter(rows)
    write_response(metadata, [next(iterator) if case['algorithm'] == ALGORITHM else
                             {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown natural first-city contract'}
                             for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native natural city replay failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
