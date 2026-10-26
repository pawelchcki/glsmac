#!/usr/bin/env python3
"""Replay four frozen minimum-size controls through actual native generation.

Only grid dimensions are original observations. Terrain and session preservation
checks are application invariants, not claims of original terrain agreement.
"""
import argparse
import hashlib
from pathlib import Path
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import compare as behavior
from fast import create_snapshot, parse_output
from protocol import ProtocolError, canonical, fingerprint
from state_trace.candidate import ROOT, gse_literal
from ui.world_dimensions_contract import ALGORITHM, parse_candidate, validate_input

DIRECTORY = Path(__file__).resolve().parent
EVIDENCE = DIRECTORY / 'setup-controls'
MANIFEST_SHA256 = 'fb863b7120863b98fe7879a9fa71639f135da8f9ecba6ad30370a171cbff7abd'
SOURCES = ('custom-grid-minimum-2x2-v1', 'custom-grid-minimum-axes-v1')
UNSUPPORTED = ['terrain contents', 'cross-engine RNG equivalence', 'rendering/audio/timing',
               'all-player/city state', 'other four setup-controls roster cases']


def references():
    if hashlib.sha256((EVIDENCE / 'manifest-v1.json').read_bytes()).hexdigest() != MANIFEST_SHA256:
        raise ProtocolError('frozen setup-controls manifest changed')
    manifest = behavior.read_json(EVIDENCE / 'manifest-v1.json')
    for relative, digest in manifest['files'].items():
        path = Path(relative)
        if path.is_absolute() or '..' in path.parts or hashlib.sha256((EVIDENCE / path).read_bytes()).hexdigest() != digest:
            raise ProtocolError('frozen setup-controls artifact changed: ' + relative)
    pairs = []
    for source in SOURCES:
        suite = behavior.read_json(EVIDENCE / 'cases' / (source + '.json'))
        record = behavior.read_json(EVIDENCE / 'observations' / (source + '.json'))
        behavior.validate_observations(record, suite)
        for case in suite['cases']:
            if case['algorithm'] != ALGORITHM: raise ProtocolError('unexpected grid algorithm')
            validate_input(case['input'])
        pairs.append((suite, record))
    return pairs


def replay(cases, runtime, execution):
    # Inputs only enter the worker; recorded outputs are never in its snapshot.
    snapshot = create_snapshot(ROOT)
    production_hash = fingerprint(snapshot)
    template = DIRECTORY / '_world_minimum_generation.gls.js'
    script = 'GLSMAC_data/tests/world_minimum_generation_probe.gls.js'
    snapshot[script] = 'const grid_inputs = ' + gse_literal([
        dict(case['input'], id=case['id']) for case in cases]) + ';\n' + template.read_text()
    runtime = Path(runtime).resolve()
    artifacts = (runtime, runtime.with_suffix('.wasm'), DIRECTORY.parent / 'gse-worker.cjs', template, Path(__file__).resolve())
    hashes = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in artifacts}
    execution.update(artifacts_sha256=hashes, scripts_sha256=fingerprint(snapshot),
                     production_scripts_sha256=production_hash,
                     native_probe_source_sha256=hashlib.sha256(
                         (ROOT / 'src/gse/tests/mocks/ProductionFixture.cpp').read_bytes()).hexdigest())
    with tempfile.TemporaryDirectory(prefix='world-minimum-generation-') as temporary:
        scripts = Path(temporary) / 'scripts.json'; scripts.write_text(canonical(snapshot))
        request = canonical(dict(runtime=str(runtime), snapshot=str(scripts), script=script, prefix=temporary))
        with subprocess.Popen(['node', str(artifacts[2])], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, text=True, cwd=ROOT) as process:
            execution['candidate_executed'] = True
            try:
                stdout, stderr = process.communicate(request, timeout=180)
            except subprocess.TimeoutExpired:
                process.kill(); process.communicate(); raise
    if any(hashlib.sha256(Path(path).read_bytes()).hexdigest() != digest for path, digest in hashes.items()):
        raise ProtocolError('generation replay artifact changed during execution')
    execution['successful_generation_observations'] = sum(
        'GRID_RESULT|' in line for line in stdout.splitlines())
    if process.returncode: raise ProtocolError('generation worker failed: ' + (stdout + stderr)[-3000:])
    try:
        execution['checks'] = parse_output(stdout + stderr)  # Exactly one completed behavior lifecycle.
    except ProtocolError as error:
        raise ProtocolError(str(error) + ': ' + (stdout + stderr)[-3000:]) from error
    return parse_candidate(stdout + stderr, cases)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=ROOT / 'build/wasm/bin/GLSMAC.js')
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args(argv)
    destination = args.report.resolve()
    if destination == EVIDENCE.resolve() or EVIDENCE.resolve() in destination.parents:
        parser.error('report cannot overwrite frozen setup-controls evidence')
    execution = dict(candidate_executed=False)
    try:
        args.report.unlink(missing_ok=True)
        pairs = references()
        cases = [case for suite, _ in pairs for case in suite['cases']]
        rows = replay(cases, args.runtime, execution)
        reports = []
        for suite, record in pairs:
            ids = {case['id'] for case in suite['cases']}
            candidate = dict(version=1, implementation=dict(name='native-minimum-grid-generation',
                kind='candidate', **execution), results=[row for row in rows if row['id'] in ids])
            reports.append(behavior.compare(suite, record, candidate))
        summary = {key: sum(report['summary'][key] for report in reports)
                   for key in ('matched', 'mismatched', 'unsupported', 'errors')}
        report = dict(version=1, algorithm=ALGORITHM, manifest_sha256=MANIFEST_SHA256,
            scope='four minimum-axis grid observations after production controls and real native generation',
            summary=summary, comparisons=reports, execution=execution, unsupported=UNSUPPORTED,
            complete_setup_package_status='unsupported', complete_setup_package_passing_cases=0)
        code = int(any(summary[key] for key in ('mismatched', 'unsupported', 'errors')))
    except (ProtocolError, OSError, ValueError, subprocess.SubprocessError) as error:
        report = dict(version=1, execution=execution, error=str(error), unsupported=UNSUPPORTED,
            complete_setup_package_status='unsupported', complete_setup_package_passing_cases=0)
        code = 2
    behavior.write_json(args.report, report, overwrite=True)
    print(canonical(report))
    return code


if __name__ == '__main__':
    sys.exit(main())
