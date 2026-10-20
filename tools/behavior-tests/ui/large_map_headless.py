#!/usr/bin/env python3
"""Replay actual custom-size and warning controls without graphics or assets."""
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
from ui.large_map_contract import ALGORITHM, parse_candidate, validate_input

DIRECTORY = Path(__file__).resolve().parent


def headless(cases, runtime):
    snapshot = create_snapshot()
    snapshot['GLSMAC_data/tests/_headless_display.gls.js'] = (DIRECTORY / '_headless_display.gls.js').read_text()
    inputs = [dict(case['input'], id=case['id']) for case in cases]
    script = 'GLSMAC_data/tests/large_map_probe.gls.js'
    snapshot[script] = ('const headless_inputs = [];\nconst warning_inputs = ' + gse_literal(inputs) + ';\n'
                        + (DIRECTORY / '_headless.gls.js').read_text() + (DIRECTORY / '_large_map.gls.js').read_text())
    digest = hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest()
    hashes = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in (runtime, runtime.with_suffix('.wasm'))}
    with tempfile.TemporaryDirectory(prefix='glsmac-large-map-') as temporary:
        source = Path(temporary) / 'scripts.json'
        source.write_text(json.dumps(snapshot))
        request = {'runtime': str(runtime), 'snapshot': str(source), 'script': script, 'prefix': temporary}
        result = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')], input=json.dumps(request),
                                text=True, capture_output=True, timeout=180)
    if result.returncode:
        raise ProtocolError('warning worker failed: ' + (result.stdout + result.stderr)[-3000:])
    if any(hashlib.sha256(path.read_bytes()).hexdigest() != value for path, value in hashes.items()):
        raise ProtocolError('warning runtime changed during replay')
    rows = parse_candidate(result.stdout, cases)
    return {'name': 'glsmac-large-map-warning', 'kind': 'candidate', 'target': 'wasm-gse', 'rendering': False,
            'scripts_sha256': digest, 'loader_sha256': hashes[runtime], 'runtime_sha256': hashes[runtime.with_suffix('.wasm')],
            'mocked': ['native display', 'audio', 'timer delivery', 'equivalent synthetic text', 'pre-world lifecycle']}, rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=ROOT / 'build/wasm/bin/GLSMAC.js')
    args = parser.parse_args()
    cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported:
        validate_input(case['input'])
    metadata, rows = ({'name': 'large-map-headless', 'kind': 'adapter'}, [])
    if supported:
        metadata, rows = headless(supported, args.runtime.resolve())
    iterator = iter(rows)
    write_response(metadata, [next(iterator) if case['algorithm'] == ALGORITHM else
                             {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown warning contract'} for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print(f'Warning replay failed: {error}', file=sys.stderr)
        sys.exit(1)
