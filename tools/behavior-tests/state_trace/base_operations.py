#!/usr/bin/env python3
"""Bounded Base Operations UI replay; full world/motion/number parity is unsupported."""
import argparse
from copy import deepcopy
import hashlib
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import compare as behavior
from fast import create_snapshot, parse_output
from protocol import ProtocolError, canonical, fingerprint, load_request, probe_request, validate_response, write_response

ROOT = Path(__file__).resolve().parents[3]
DIRECTORY = Path(__file__).resolve().parent
EVIDENCE = DIRECTORY.parent / 'ui/reference-drafts'
BINDINGS = DIRECTORY / 'base-operations-source-bindings-v1.json'
ALGORITHM = 'ui.base_operations_navigation_semantics.v1'
EXPECTED_FILES = {
 'unit-motion-base-report-cases.json': 'ffe07b92b9a8199b3e39714b74ea1b65c8e0ce1065796cbe356a0dc525797c52',
 'unit-motion-base-report-observations.json': 'c88b42c467631426922daec6aa5a7c7bd0b5182e9f383485982517620aeb937d',
 'base-report-visual-observations-v1.json': 'b008517d963407839f5f5653138e4363528f85f1481b93fcb91c3dc9b776d0f3',
 'unit-motion-base-report-contract.md': 'c2e3c5cdf19202a19fb9ad693abef4507bbc65cf6ddff0f606f792c7101aa05d',
 'base-report-ui-semantics-v1.json': 'ad49b8ce8986d47932bcd044d83a1df9acce6f0f1cf062eddfa15599a63c60ba',
}
NATIVE_IDS = ('base-flow-before', 'base-flow-menu', 'base-flow-hq', 'base-flow-report-stable',
 'base-flow-selected-row', 'base-flow-panel-stable', 'base-flow-return-stable', 'base-flow-escape-close')
CHECK_IDS = ('report-open', 'single-click-row', 'double-click-row', 'escape-city-panel', 'escape-report')
INPUT = {'profile': 'source-equivalent-seven-owner-report-world', 'dimensions': [16, 16], 'actions': ['menu', 'hq-source-7',
 'single-click-row', 'double-click-row', 'escape-city-panel', 'escape-report']}
UNSUPPORTED = ('Original unit-motion prelude and initial world/coordinates/inventory equivalence',
 'Numeric progress/prices/turns and signed food/resource semantics', 'Exact report pixels/artwork/audio/timing',
 'City-panel title/project typography and casing (raw original/candidate strings retained separately)',
 'Non-Production tabs, F4 and keyboard row navigation', 'Datalinks/Close/governor effects and multi-city ordering',
 'Original report-label source precedence')


def validate_observed(value, include_city_typography=False):
 keys = {'checkpoints', 'visible_buttons', 'all_seven_native_arrays_unchanged', 'native_checkpoint_ids', 'native_turn_unchanged'}
 if type(value) is not dict or set(value) != keys or type(value['checkpoints']) is not list or len(value['checkpoints']) != 5:
  raise ProtocolError('Base Operations requires all five bounded UI checkpoints')
 if value['native_checkpoint_ids'] != list(NATIVE_IDS) or type(value['visible_buttons']) is not list or len(value['visible_buttons']) != 2 or any(type(x) is not str or not x for x in value['visible_buttons']):
  raise ProtocolError('Base Operations native fences/buttons malformed')
 if any(type(value[k]) is not bool for k in ('all_seven_native_arrays_unchanged', 'native_turn_unchanged')):
  raise ProtocolError('Base Operations native invariant flags must be booleans')
 for index, point in enumerate(value['checkpoints']):
  if type(point) is not dict or point.get('id') != CHECK_IDS[index]:
   raise ProtocolError('Base Operations checkpoint missing/duplicate/reordered')
  screen = point.get('screen')
  if screen == 'map': allowed = {'id', 'screen'}
  elif screen == 'city-panel': allowed = {'id', 'screen'} | ({'title', 'project'} if include_city_typography else set())
  elif screen == 'base-operations':
   allowed = {'id', 'screen', 'title', 'row'} | ({'tabs', 'selected_tab'} if index == 0 else set())
   row = point.get('row')
   if type(row) is not dict or set(row) != {'city', 'project', 'selected'} or type(row['selected']) is not bool or any(type(row[k]) is not str or not row[k] for k in ('city', 'project')):
    raise ProtocolError('Base Operations complete live row required')
   if index == 0 and (type(point.get('tabs')) is not list or len(point['tabs']) != 3 or any(type(x) is not str or not x for x in point['tabs']) or type(point.get('selected_tab')) is not str):
    raise ProtocolError('Base Operations tab observation malformed')
  else: raise ProtocolError('Unknown Base Operations screen')
  if set(point) != allowed or any(type(point[k]) is not str or not point[k] for k in ('title', 'project') if k in point):
   raise ProtocolError('Base Operations UI observation fields differ')
 return value


def validate_native(snapshot):
 if type(snapshot) is not dict or set(snapshot) != {'bases', 'map', 'players', 'turn', 'units'}:
  raise ProtocolError('Original report lacks complete native arrays')
 players = snapshot['players']
 if type(players) is not list or [p.get('id') for p in players if type(p) is dict] != list(range(1, 8)):
  raise ProtocolError('Original report requires all seven ordered owners')
 if any(type(p['id']) is not int or type(p.get('is_human')) is not bool for p in players):
  raise ProtocolError('Original report native player fields malformed')
 for domain in ('bases', 'units'):
  rows = snapshot[domain]
  if type(rows) is not list or not rows: raise ProtocolError('Original report native entities omitted')
  ids = []
  for row in rows:
   if type(row) is not dict or type(row.get('owner')) is not int or row['owner'] not in range(1, 8) or type(row.get('runtime_id')) is not int:
    raise ProtocolError('Original report native entity owner/identity malformed')
   ids.append(row['runtime_id'])
  if len(ids) != len(set(ids)): raise ProtocolError('Original report duplicate native entity')
 return snapshot


def reference_projection():
 manifest = behavior.read_json(BINDINGS)
 if manifest.get('files') != EXPECTED_FILES: raise ProtocolError('Original report manifest binding changed')
 for name, digest in EXPECTED_FILES.items():
  if hashlib.sha256((EVIDENCE / name).read_bytes()).hexdigest() != digest:
   raise ProtocolError('Original report artifact changed: ' + name)
 source_suite = behavior.read_json(EVIDENCE / 'unit-motion-base-report-cases.json')
 source_record = behavior.read_json(EVIDENCE / 'unit-motion-base-report-observations.json')
 sources = behavior.validate_observations(source_record, source_suite)
 semantic = behavior.read_json(EVIDENCE / 'base-report-ui-semantics-v1.json')
 binding = semantic['derived_from']
 if binding['protocol_sha256'] != EXPECTED_FILES['unit-motion-base-report-observations.json'] or binding['visual_sha256'] != EXPECTED_FILES['base-report-visual-observations-v1.json'] or binding['repeat'] != 2:
  raise ProtocolError('Original report semantic provenance differs')
 controls = sources[binding['case_id']]['base_report']['controls']
 if [point['id'] for point in controls] != list(NATIVE_IDS): raise ProtocolError('Original native report fences omitted')
 baseline = validate_native(controls[0]['native']['all_players'])
 if any(canonical(validate_native(point['native']['all_players'])) != canonical(baseline) for point in controls):
  raise ProtocolError('Original report native arrays changed; cannot claim read-only behavior')
 observed = validate_observed(deepcopy(semantic['observed']), include_city_typography=True)
 if not observed['all_seven_native_arrays_unchanged'] or not observed['native_turn_unchanged']:
  raise ProtocolError('Original report invariants incomplete')
 city = observed['checkpoints'][2]
 original_city_typography = {key:city.pop(key) for key in ('title', 'project')}
 validate_observed(observed)
 suite = {'version': 1, 'cases': [dict(id='base-operations-roundtrip', algorithm=ALGORITHM, input=deepcopy(INPUT))]}
 case = probe_request(suite)['cases'][0]
 reference = dict(source_record['reference'], projection=ALGORITHM,
  source_record_sha256=EXPECTED_FILES['unit-motion-base-report-observations.json'], visual_sha256=EXPECTED_FILES['base-report-visual-observations-v1.json'],
  semantic_sha256=EXPECTED_FILES['base-report-ui-semantics-v1.json'], source_suite_sha256=source_record['suite_sha256'],
  unsupported_city_panel_typography=original_city_typography,
  scope='Five report UI/navigation checkpoints and native preservation; city-panel typography and full original trace unsupported')
 record = dict(source_record, suite_sha256=fingerprint(probe_request(suite)), reference=reference,
  observations=[dict(id=case['id'], case_sha256=fingerprint(case), output={'observed': observed})])
 return suite, record


def parse_candidate(text):
 parse_output(text)
 points, native, buttons, current, complete, raw_city = [], [], None, None, False, None
 for line in text.splitlines():
  match = re.search(r'(?:^|\] )(BASEOPS_[A-Z]+(?:\|.*)?)$', line)
  if not match: continue
  kind, _, body = match[1].partition('|')
  if complete: raise ProtocolError('Late Base Operations observation')
  fields = body.split('|')
  if kind == 'BASEOPS_NATIVE' and len(fields) == 5:
   native.append(dict(id=fields[0], turn=int(fields[1]), players=int(fields[2]), units=int(fields[3]), bases=int(fields[4])))
  elif kind == 'BASEOPS_CHECK' and current is None and len(fields) == 2:
   current = dict(id=fields[0], screen=fields[1])
  elif kind == 'BASEOPS_TITLE' and current is not None and 'title' not in current: current['title'] = body
  elif kind == 'BASEOPS_PROJECT' and current is not None and 'project' not in current: current['project'] = body
  elif kind == 'BASEOPS_TABS' and current is not None and 'tabs' not in current and len(fields) == 3: current['tabs'] = fields
  elif kind == 'BASEOPS_SELECTEDTAB' and current is not None and 'selected_tab' not in current: current['selected_tab'] = body
  elif kind == 'BASEOPS_BUTTONS' and current is not None and buttons is None and len(fields) == 2: buttons = fields
  elif kind == 'BASEOPS_ROW' and current is not None and 'row' not in current and len(fields) == 3 and fields[2] in ('true', 'false'):
   current['row'] = dict(city=fields[0], project=fields[1], selected=fields[2] == 'true')
  elif kind == 'BASEOPS_ENDCHECK' and not body and current is not None:
   if current.get('screen') == 'city-panel':
    if raw_city is not None or any(type(current.get(k)) is not str or not current[k] for k in ('title', 'project')):
     raise ProtocolError('Raw candidate city-panel strings missing')
    raw_city = {key:current.pop(key) for key in ('title', 'project')}
   points.append(current); current = None
  elif kind == 'BASEOPS_COMPLETE' and not body and current is None: complete = True
  else: raise ProtocolError('Malformed Base Operations marker: ' + kind)
 if not complete or [sample['id'] for sample in native] != list(NATIVE_IDS): raise ProtocolError('Base Operations native/control observation incomplete')
 if any(s['players'] != 7 or s['bases'] != 7 or s['units'] < 7 for s in native) or any({k:v for k,v in s.items() if k != 'id'} != {k:v for k,v in native[0].items() if k != 'id'} for s in native):
  raise ProtocolError('Base Operations native participant inventory/turn changed')
 observed = validate_observed(dict(checkpoints=points, visible_buttons=buttons,
  all_seven_native_arrays_unchanged=True, native_checkpoint_ids=[s['id'] for s in native], native_turn_unchanged=True))
 return {'observed': observed}, native, raw_city


def replay(runtime, executions):
 execution = {'candidate_executed': False}; executions.append(execution)
 runtime = Path(runtime).resolve(); script = 'GLSMAC_data/tests/base_operations_probe.gls.js'
 snapshot = create_snapshot(ROOT)
 snapshot[script] = (DIRECTORY / '_base_operations_candidate.gls.js').read_text()
 files = (runtime, runtime.with_suffix('.wasm'), DIRECTORY.parent / 'gse-worker.cjs', Path(__file__).resolve(), DIRECTORY / '_base_operations_candidate.gls.js')
 digests = {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
 execution.update(runtime_js_sha256=digests[str(runtime)], runtime_wasm_sha256=digests[str(runtime.with_suffix('.wasm'))],
  adapter_sha256=digests[str(files[3])], probe_sha256=digests[str(files[4])], scripts_sha256=fingerprint(snapshot),
  fixture='Independent equivalent-source native world; initial unit prelude/focus controlled; no original post-state supplied')
 started = time.perf_counter()
 with tempfile.TemporaryDirectory(prefix='base-operations-') as temporary:
  source = Path(temporary) / 'scripts.json'; source.write_text(canonical(snapshot))
  request = canonical(dict(runtime=str(runtime), snapshot=str(source), script=script, prefix=temporary))
  with subprocess.Popen(['node', str(files[2])], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=ROOT) as process:
   execution['candidate_executed'] = True
   try: stdout, stderr = process.communicate(request, timeout=180)
   except subprocess.TimeoutExpired:
    process.kill(); process.communicate(); execution['status'] = 'timeout'; raise
 execution['duration_s'] = round(time.perf_counter()-started, 6)
 if any(hashlib.sha256(Path(p).read_bytes()).hexdigest() != h for p,h in digests.items()): raise ProtocolError('Base Operations immutable runtime/source changed')
 if process.returncode: raise ProtocolError('Base Operations worker failed: ' + (stdout+stderr)[-3000:])
 output, samples, raw_city = parse_candidate(stdout+stderr)
 execution.update(status='ok', native_samples=samples, unsupported_city_panel_typography=raw_city)
 return output


def main(argv=None):
 parser = argparse.ArgumentParser(description=__doc__)
 parser.add_argument('action', choices=('candidate', 'compare'))
 parser.add_argument('--runtime', type=Path, default=ROOT / 'build/wasm/bin/GLSMAC.js')
 parser.add_argument('--report', type=Path)
 args = parser.parse_args(argv)
 if args.action == 'candidate':
  rows, executions = [], []
  for case in load_request()['cases']:
   if case['algorithm'] != ALGORITHM or canonical(case['input']) != canonical(INPUT):
    rows.append(dict(id=case['id'], status='unsupported', reason='unknown bounded Base Operations input')); continue
   try: rows.append(dict(id=case['id'], status='ok', output=replay(args.runtime, executions)))
   except (ProtocolError, OSError, ValueError, subprocess.SubprocessError) as error: rows.append(dict(id=case['id'], status='error', reason=str(error)))
  write_response(dict(name='glsmac-base-operations-projection', kind='candidate', executions=executions), rows); return 0
 executed = False
 native_executed = False
 def mark():
  nonlocal executed, native_executed
  executed = True
  native_executed = None  # Adapter started; native launch is unknown until its response.
 protected = args.report and (args.report.resolve() == EVIDENCE.resolve() or EVIDENCE.resolve() in args.report.resolve().parents)
 try:
  if protected: raise ProtocolError('Base Operations report cannot overwrite original evidence')
  suite, record = reference_projection()
  if args.report: args.report.unlink(missing_ok=True)
  command = shlex.join([sys.executable, str(Path(__file__).resolve()), 'candidate', '--runtime', str(args.runtime)])
  candidate = behavior.run_probe(command, probe_request(suite), timeout=200, on_started=mark)
  executions = candidate.get('implementation', {}).get('executions')
  if type(executions) is not list or any(type(e) is not dict or type(e.get('candidate_executed')) is not bool for e in executions):
   raise ProtocolError('Base Operations native execution accounting missing')
  native_executed = any(e['candidate_executed'] for e in executions)
  rows = validate_response(candidate, probe_request(suite))
  for row in rows.values():
   if row['status'] == 'ok':
    if set(row['output']) != {'observed'}: raise ProtocolError('Unexpected Base Operations output domain')
    validate_observed(row['output']['observed'])
  report = behavior.compare(suite, record, candidate)
  report.update(algorithm=ALGORITHM, adapter_executed=executed, candidate_executed=native_executed, native_execution_known=True,
   full_trace_status='unsupported', full_trace_passing_cases=0, unsupported=list(UNSUPPORTED))
  if args.report: behavior.write_json(args.report, report, overwrite=True)
  print(canonical(report)); return 2 if report['summary']['errors'] else int(bool(report['summary']['mismatched'] or report['summary']['unsupported']))
 except (ProtocolError, OSError, ValueError, subprocess.SubprocessError) as error:
  if args.report and not protected: behavior.write_json(args.report, dict(algorithm=ALGORITHM, adapter_executed=executed, candidate_executed=native_executed,
   native_execution_known=native_executed is not None, full_trace_status='unsupported', full_trace_passing_cases=0, unsupported=list(UNSUPPORTED), error=str(error)), overwrite=True)
  print('Base Operations replay failed: '+str(error), file=sys.stderr); return 2


if __name__ == '__main__': sys.exit(main())
