#!/usr/bin/env python3
"""Observe actual production size controls, native grids and map-file decoding."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fast import create_snapshot
from protocol import ProtocolError, load_request, write_response
from ui.drivers import ROOT
from ui.headless import gse_literal
from ui.world_dimensions_contract import ALGORITHM, parse_candidate, validate_input

DIRECTORY = Path(__file__).resolve().parent


def headless(cases, runtime):
    snapshot = create_snapshot()
    script = 'GLSMAC_data/tests/world_dimensions_probe.gls.js'
    snapshot[script] = ('const grid_inputs = ' + gse_literal([dict(case['input'], id=case['id']) for case in cases])
                        + ';\n' + (DIRECTORY / '_world_dimensions.gls.js').read_text())
    digest = hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest()
    hashes = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in (runtime, runtime.with_suffix('.wasm'))}
    with tempfile.TemporaryDirectory(prefix='glsmac-world-dimensions-') as temporary:
        source = Path(temporary) / 'scripts.json'; source.write_text(json.dumps(snapshot))
        request = {'runtime': str(runtime), 'snapshot': str(source), 'script': script, 'prefix': temporary}
        result = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')], input=json.dumps(request),
                                text=True, capture_output=True, timeout=120)
    if result.returncode:
        raise ProtocolError('native grid worker failed: ' + (result.stdout + result.stderr)[-3000:])
    if any(hashlib.sha256(path.read_bytes()).hexdigest() != value for path, value in hashes.items()):
        raise ProtocolError('grid runtime changed during replay')
    return {'name': 'glsmac-custom-grid-dimensions', 'kind': 'candidate', 'target': 'wasm-gse', 'rendering': False,
            'scripts_sha256': digest, 'loader_sha256': hashes[runtime], 'runtime_sha256': hashes[runtime.with_suffix('.wasm')],
            'mocked': ['display', 'audio', 'next setup step', 'terrain generation', 'equivalent synthetic installed text'],
            'executed': ['production size/warning controls', 'native settings', 'native Tiles construction', 'native map-file codec']}, parse_candidate(result.stdout, cases)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=ROOT / 'build/wasm/bin/GLSMAC.js')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported:
        validate_input(case['input'])
    metadata, rows = ({'name': 'world-dimensions-headless', 'kind': 'adapter'}, [])
    if supported:
        metadata, rows = headless(supported, args.runtime.resolve())
    iterator = iter(rows)
    write_response(metadata, [next(iterator) if case['algorithm'] == ALGORITHM else
                             {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown native grid contract'} for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print(f'Native world dimension replay failed: {error}', file=sys.stderr); sys.exit(1)
