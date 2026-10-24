#!/usr/bin/env python3
"""Strict native/project-price projection of eight immutable first-city records.

This executes native startup and recipe prices. It does not execute the original
Operations, allocation or Social UI; the full v2 UI contract remains pending.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import compare
from fast import create_snapshot, parse_output
from protocol import ProtocolError, canonical
from ui.natural_first_city_headless import gse_literal
from ui.production_controls_contract import validate_input, validate_output

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]
FIELDS = ('project', 'minerals', 'price', 'turn', 'population', 'workers', 'doctors', 'worked_tiles', 'nutrients', 'mineral_intake', 'mineral_consumption')


def project_reference(output):
    validate_output(output)
    phase = output['first_city_before_panels']
    return dict(project=output['operations']['project'], minerals=phase['raw_mineral_field'],
                price=output['operations']['pair'][1], turn=phase['turn'], **phase['city'],
                mineral_intake=output['panel']['mineral_intake'], mineral_consumption=output['panel']['mineral_consumption'])


def parse_candidate(output):
    parse_output(output)
    rows = re.findall(r'(?:^|\] )PRODUCTION_NATIVE\|([^\r\n]+)', output, re.MULTILINE)
    if len(rows) != 1 or len(rows[0].split('|')) != len(FIELDS):
        raise ProtocolError('missing, duplicate or malformed native production observation')
    values = rows[0].split('|')
    return dict(zip(FIELDS, [values[0]] + [int(value) for value in values[1:]]))


def snapshot(production_ref=None, shared_unit_source_parser=False):
    scripts = create_snapshot(ROOT)
    if production_ref:
        # Explicit baseline selection is recorded in the report. Test helpers
        # stay current, while every production script comes from this commit.
        names = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', production_ref, 'GLSMAC_data/default'], cwd=ROOT, text=True).splitlines()
        for name in names:
            if name.endswith('.gls.js'):
                scripts[name] = subprocess.check_output(['git', 'show', production_ref + ':' + name], cwd=ROOT, text=True)
    if shared_unit_source_parser:
        name = 'GLSMAC_data/default/game/unit_rules.gls.js'
        scripts[name] = (ROOT / name).read_text()
    return scripts


def replay(case, runtime, scripts, log_dir=None, execution=None):
    validate_input(case['input'])
    probe = 'GLSMAC_data/tests/production_controls_native_probe.gls.js'
    current = dict(scripts)
    current[probe] = ('const production_input = ' + gse_literal(case['input']) + ';\n'
                      + (DIRECTORY / '_production_controls_native.gls.js').read_text())
    with tempfile.TemporaryDirectory(prefix='glsmac-production-native-') as temporary:
        source = Path(temporary) / 'scripts.json'; source.write_text(canonical(current))
        request = dict(runtime=str(runtime), snapshot=str(source), script=probe, prefix=temporary)
        try:
            process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')], cwd=ROOT,
                                     input=canonical(request), text=True, capture_output=True, timeout=120)
        except subprocess.TimeoutExpired:
            if execution is not None:
                execution['candidate_executed'] = True
            raise
        if execution is not None:
            execution['candidate_executed'] = True
    output = process.stdout + process.stderr
    if log_dir:
        log_dir.mkdir(parents=True, exist_ok=True); (log_dir / (case['id'] + '.log')).write_text(output)
    if process.returncode:
        raise ProtocolError('native production worker failed: ' + output[-2500:])
    return parse_candidate(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', required=True, type=Path)
    parser.add_argument('--production-ref', help='explicit git production-source baseline; default current source')
    parser.add_argument('--shared-unit-source-parser', action='store_true',
                        help='use the same current declared-unit source consumer on baseline and candidate; record its hash')
    parser.add_argument('--report', required=True, type=Path)
    parser.add_argument('--logs', type=Path)
    args = parser.parse_args()
    args.report.unlink(missing_ok=True)
    runtime = args.runtime.resolve()
    hashes = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in (runtime, runtime.with_suffix('.wasm'))}
    scripts = snapshot(args.production_ref, args.shared_unit_source_parser)
    results = []; bindings = {}
    for name in ('core', 'source'):
        cases_path = DIRECTORY / f'cases/initial-production-controls-{name}.json'
        reference_path = DIRECTORY / f'observations/initial-production-controls-{name}.json'
        suite = compare.read_json(cases_path); reference = compare.read_json(reference_path)
        compare.validate_observations(reference, suite)
        bindings[str(reference_path.relative_to(ROOT))] = hashlib.sha256(reference_path.read_bytes()).hexdigest()
        expected = {row['id']: project_reference(row['output']) for row in reference['observations']}
        for case in suite['cases']:
            row = dict(id=case['id'], candidate_executed=False, expected=expected[case['id']])
            try:
                row['actual'] = replay(case, runtime, scripts, args.logs, row)
                row['status'] = 'matched' if row['actual'] == row['expected'] else 'mismatched'
            except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
                row.update(status='error', error=str(error))
            results.append(row)
    if any(hashlib.sha256(Path(path).read_bytes()).hexdigest() != value for path, value in hashes.items()):
        raise ProtocolError('runtime changed during replay')
    summary = {status: sum(row['status'] == status for row in results) for status in ('matched', 'mismatched', 'error')}
    native_source_hash = hashlib.sha256(canonical({str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted((ROOT / 'src').rglob('*')) if path.is_file() and path.suffix in {'.cpp', '.h'}}).encode()).hexdigest()
    report = dict(version=1, candidate_executed=any(row['candidate_executed'] for row in results), target='wasm-native-startup', production_ref=args.production_ref,
                  shared_unit_source_parser_sha256=(hashlib.sha256(scripts['GLSMAC_data/default/game/unit_rules.gls.js'].encode()).hexdigest() if args.shared_unit_source_parser else None),
                  projection=list(FIELDS), full_v2_ui_contract='pending; Operations/allocation/Social controls not executed',
                  checkout_head=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                  checkout_native_source_sha256=native_source_hash,
                  runtime_sha256=hashes, scripts_sha256=hashlib.sha256(canonical(scripts).encode()).hexdigest(),
                  references_sha256=bindings, summary=summary, results=results)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(canonical(summary))
    return int(summary['mismatched'] > 0 or summary['error'] > 0)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr); sys.exit(2)
