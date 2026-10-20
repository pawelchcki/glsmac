#!/usr/bin/env python3
"""Replay current faction controls without rendering or original assets."""
import argparse
from concurrent.futures import ThreadPoolExecutor
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
from ui.faction_setup_candidate import parse_candidate
from ui.faction_setup_contract import ALGORITHM, validate_input

DIRECTORY = Path(__file__).resolve().parent


def sources():
    snapshot = create_snapshot()
    snapshot['GLSMAC_data/tests/_headless_display.gls.js'] = (DIRECTORY / '_faction_display.gls.js').read_text()
    template = (DIRECTORY / '_headless.gls.js').read_text() + (DIRECTORY / '_faction_setup.gls.js').read_text()
    return snapshot, template


def batch(cases, runtime, *, scripts, template):
    snapshot = dict(scripts)
    source_digest = hashlib.sha256(json.dumps([snapshot, template], sort_keys=True).encode()).hexdigest()
    script = 'GLSMAC_data/tests/faction_setup_probe.gls.js'
    inputs = [dict(case['input'], id=case['id']) for case in cases]
    snapshot[script] = ('const headless_inputs = [];\nconst faction_inputs = ' + gse_literal(inputs) + ';\n'
                        + template)
    digest = hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest()
    hashes = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in (runtime, runtime.with_suffix('.wasm'))}
    with tempfile.TemporaryDirectory(prefix='glsmac-faction-') as temporary:
        source = Path(temporary) / 'scripts.json'
        source.write_text(json.dumps(snapshot))
        request = {'runtime': str(runtime), 'snapshot': str(source), 'script': script, 'prefix': temporary}
        result = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')], input=json.dumps(request),
                                text=True, capture_output=True, timeout=240)
    if result.returncode:
        raise ProtocolError('faction worker failed: ' + (result.stdout + result.stderr)[-3000:])
    if any(hashlib.sha256(path.read_bytes()).hexdigest() != value for path, value in hashes.items()):
        raise ProtocolError('faction runtime changed during replay')
    rows = parse_candidate(result.stdout, cases)
    return {'name': 'glsmac-faction-setup', 'kind': 'candidate', 'target': 'wasm-gse', 'rendering': False,
            'scripts_sha256': digest, 'source_sha256': source_digest,
            'loader_sha256': hashes[runtime], 'runtime_sha256': hashes[runtime.with_suffix('.wasm')],
            'mocked': ['native display', 'audio', 'timer delivery', 'equivalent synthetic text',
                       'faction artwork and base-name loading', 'configured faction-list boundary', 'pre-world lifecycle']}, rows


def headless(cases, runtime, jobs=2):
    # Each native fixture owns its graph until the interpreter exits. Bound
    # memory with fresh processes instead of relaxing WASM's allocation limit.
    if not cases or jobs not in (1, 2):
        raise ProtocolError('faction replay needs cases and one or two workers')
    snapshot, template = sources()
    chunks = [cases[offset:offset + 2] for offset in range(0, len(cases), 2)]
    run = lambda chunk: batch(chunk, runtime, scripts=snapshot, template=template)
    metadata, rows, hashes = None, [], []
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        for current, actual in pool.map(run, chunks):
            hashes.append(current.pop('scripts_sha256'))
            if metadata is not None and current != metadata:
                raise ProtocolError('faction batches executed different runtime versions')
            metadata = current
            rows.extend(actual)
    metadata['batch_scripts_sha256'] = hashes
    metadata['scripts_sha256'] = hashlib.sha256(json.dumps(hashes).encode()).hexdigest()
    metadata['batch_size'] = 2
    metadata['workers'] = min(jobs, len(chunks))
    return metadata, rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=ROOT / 'build/wasm/bin/GLSMAC.js')
    parser.add_argument('--jobs', type=int, choices=(1, 2), default=2)
    args = parser.parse_args()
    cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported:
        validate_input(case['input'])
    metadata, rows = ({'name': 'faction-setup-headless', 'kind': 'adapter'}, [])
    if supported:
        metadata, rows = headless(supported, args.runtime.resolve(), args.jobs)
    iterator = iter(rows)
    write_response(metadata, [next(iterator) if case['algorithm'] == ALGORITHM else
                             {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown faction contract'} for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print(f'Faction replay failed: {error}', file=sys.stderr)
        sys.exit(1)
