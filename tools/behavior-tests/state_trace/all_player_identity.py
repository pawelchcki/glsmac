#!/usr/bin/env python3
"""Replay a bounded native-text projection of frozen all-player identity evidence.

The original package remains unchanged and unsupported as a complete UI/native
trace. Only declared per-owner native identity fields enter this comparison.
"""
import argparse
from copy import deepcopy
import hashlib
import json
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
from state_trace.candidate import ROOT, gse_literal

DIRECTORY = Path(__file__).resolve().parent
EVIDENCE = DIRECTORY / 'all-player-identity'
ALGORITHM = 'game.all_player_identity.native_text.v1'
ORIGINAL_ALGORITHM = 'game.all_player_identity.v1'
MANIFEST_SHA256 = 'db2dede186561db7d37f4007e8a88eec22cb37af736c81636207de92e8498c88'
FIELDS = ('leader_name', 'formal_name', 'noun', 'adjective', 'leader_title', 'leader_description')
EXCLUSIONS = ('all_seven_gender', 'distinct_player_display_name', 'rendered_other_player_identity',
              'before_launch_ui', 'leader_prompt_ui', 'rendered_human_planetfall', 'native_turn_counter',
              'cross_engine_rng_equivalence')
SOURCE_FIXTURES = ('_dimension_text_fixture.gls.js', '_faction_text_fixture.gls.js',
    '_faction_ratings_fixture.gls.js', '_startup_faction_sources_fixture.gls.js',
    '_natural_startup_mechanics.gls.js')


def validate_input(value):
    wanted = dict(map='flat-arid-native40x80', text='stock', difficulty='Citizen', rules='standard',
        preset='base', roster_edits=[dict(slot=1, option=0)], mode='selected', selected_row=0,
        reference_rng_seed=1, seed_stage='immediately-before-faction-OK', checkpoint='first-post-world-Planetfall',
        identity_profile='six-verified-text-fields-v1')
    if type(value) is not dict or value.get('leader_name') not in ('Deirdre', 'Trace Commander'):
        raise ProtocolError('unsupported native identity input/name')
    wanted['leader_name'] = value['leader_name']
    if canonical(value) != canonical(wanted):
        raise ProtocolError('unsupported native identity input controls')


def validate_native(value):
    if type(value) is not dict or set(value) != {'players'} or type(value['players']) is not list or len(value['players']) != 7:
        raise ProtocolError('native identity requires all seven players')
    for owner, row in enumerate(value['players'], 1):
        if type(row) is not dict or set(row) != {'owner', 'faction_file', 'is_human', 'identity'}:
            raise ProtocolError('native identity player fields differ')
        if type(row['owner']) is not int or row['owner'] != owner:
            raise ProtocolError('native identity owner missing, duplicate or reordered')
        if type(row['faction_file']) is not str or not row['faction_file'] or type(row['is_human']) is not bool:
            raise ProtocolError('native faction/human fields malformed')
        if type(row['identity']) is not dict or set(row['identity']) != set(FIELDS) or any(type(v) is not str for v in row['identity'].values()):
            raise ProtocolError('native identity requires six exact text fields')
    return value


def parse_candidate(text):
    parse_output(text)
    rows, current, seen, began, complete = [], None, set(), False, False
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(ALLIDENTITY_[A-Z]+(?:\|.*)?)$', line)
        if not match: continue
        kind, _, body = match[1].partition('|')
        if complete: raise ProtocolError('late native identity marker')
        if kind == 'ALLIDENTITY_BEGIN' and not body and not began:
            began = True
        elif kind == 'ALLIDENTITY_PLAYER' and began and current is None:
            pieces = body.split('|')
            if len(pieces) != 3 or pieces[0] not in tuple(str(i) for i in range(1, 8)) or pieces[2] not in ('true', 'false'):
                raise ProtocolError('invalid native identity player marker')
            current = dict(owner=int(pieces[0]), faction_file=pieces[1], is_human=pieces[2] == 'true', identity={})
            seen = set()
        elif kind == 'ALLIDENTITY_FIELD' and current is not None:
            index, separator, value = body.partition('|')
            if not separator or index not in tuple(str(i) for i in range(6)) or index in seen:
                raise ProtocolError('missing or duplicate native identity field')
            seen.add(index); current['identity'][FIELDS[int(index)]] = value
        elif kind == 'ALLIDENTITY_ENDPLAYER' and not body and current is not None and len(seen) == 6:
            rows.append(current); current = None
        elif kind == 'ALLIDENTITY_COMPLETE' and not body and began and current is None:
            complete = True
        else: raise ProtocolError('malformed native identity marker: ' + kind)
    if not complete: raise ProtocolError('missing native identity completion')
    return validate_native(dict(players=rows))


def replay(case, runtime, *, execution_log=None):
    execution = dict(case_id=case['id'], candidate_executed=False)
    if execution_log is not None: execution_log.append(execution)
    validate_input(case['input'])
    snapshot = create_snapshot(ROOT)
    production_hash = fingerprint(snapshot)
    fixture_hashes = {name: hashlib.sha256(snapshot['GLSMAC_data/tests/' + name].encode()).hexdigest() for name in SOURCE_FIXTURES}
    template = (DIRECTORY / '_all_player_identity_candidate.gls.js').read_text()
    script = 'GLSMAC_data/tests/all_player_identity_probe.gls.js'
    snapshot[script] = 'const identity_input = ' + gse_literal(case['input']) + ';\n' + template
    sources_hash = fingerprint(snapshot)
    runtime = Path(runtime).resolve()
    artifacts = (runtime, runtime.with_suffix('.wasm'), DIRECTORY.parent / 'gse-worker.cjs',
                 Path(__file__).resolve(), DIRECTORY / '_all_player_identity_candidate.gls.js')
    hashes = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in artifacts}
    execution.update(
        runtime_js_sha256=hashes[str(runtime)], runtime_wasm_sha256=hashes[str(runtime.with_suffix('.wasm'))],
        scripts_sha256=sources_hash, production_scripts_sha256=production_hash,
        source_fixture_sha256=fixture_hashes,
        worker_sha256=hashes[str(artifacts[2])], adapter_sha256=hashes[str(artifacts[3])],
        template_sha256=hashes[str(artifacts[4])])
    started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix='all-player-identity-') as temporary:
        scripts = Path(temporary) / 'scripts.json'; scripts.write_text(canonical(snapshot))
        request = canonical(dict(runtime=str(runtime), snapshot=str(scripts), script=script, prefix=temporary))
        with subprocess.Popen(['node', str(artifacts[2])], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, text=True, cwd=ROOT) as process:
            execution['candidate_executed'] = True
            try:
                stdout, stderr = process.communicate(request, timeout=180)
            except subprocess.TimeoutExpired:
                process.kill(); process.communicate()
                execution.update(status='timeout', duration_s=round(time.perf_counter()-started, 6))
                raise
    execution.update(status='completed', duration_s=round(time.perf_counter()-started, 6))
    if any(hashlib.sha256(Path(path).read_bytes()).hexdigest() != digest for path, digest in hashes.items()):
        raise ProtocolError('native identity runtime changed during replay')
    text = stdout + stderr
    if process.returncode:
        execution['status'] = 'worker-failed'
        raise ProtocolError('native identity worker failed: ' + text[-3000:])
    return dict(name='glsmac-all-player-native-identity', kind='candidate', target='wasm-gse',
        runtime_js_sha256=hashes[str(runtime)], runtime_wasm_sha256=hashes[str(runtime.with_suffix('.wasm'))],
        worker_sha256=hashes[str(artifacts[2])], scripts_sha256=sources_hash,
        adapter_sha256=hashes[str(artifacts[3])], template_sha256=hashes[str(artifacts[4])],
        production_scripts_sha256=production_hash, source_fixture_sha256=fixture_hashes,
        candidate_executed=True, duration_s=round(time.perf_counter()-started, 6),
        source_profile='existing equivalent synthetic faction header/editor inputs; production parser, controls, participant creation and startup',
        unsupported=list(EXCLUSIONS)), parse_candidate(text)


def project_output(value):
    """Project only independently verified native fields, with no candidate input."""
    keys = {'after_launch', 'before_launch', 'coverage', 'leader_initial_value',
            'leader_prompt', 'leader_prompt_confirmed', 'rendered_human', 'unsupported'}
    channels = {'all_seven_faction_files', 'all_seven_human_flags', 'all_seven_six_identity_strings',
                'all_seven_gender', 'distinct_player_display_name', 'rendered_other_player_identity'}
    if type(value) is not dict or set(value) != keys:
        raise ProtocolError('reference identity package fields differ')
    coverage = value['coverage']
    if type(coverage) is not dict or set(coverage) != channels or any(type(v) is not bool for v in coverage.values()):
        raise ProtocolError('reference identity package coverage malformed')
    for channel in ('all_seven_faction_files', 'all_seven_human_flags', 'all_seven_six_identity_strings'):
        if coverage[channel] is not True: raise ProtocolError('reference native identity coverage incomplete')
    for channel in ('all_seven_gender', 'distinct_player_display_name', 'rendered_other_player_identity'):
        if coverage[channel] is not False: raise ProtocolError('reference unsupported identity coverage changed')
    excluded = value['unsupported']
    if type(excluded) is not dict or set(excluded) != {'gender', 'player_display_name', 'rendered_other_players'} or any(type(v) is not str or not v for v in excluded.values()):
        raise ProtocolError('reference unsupported identity inventory malformed')
    after = value['after_launch']
    if type(after) is not dict or set(after) != {'human_owner', 'native_turn', 'players'} or type(after['native_turn']) is not int or type(after['human_owner']) is not int:
        raise ProtocolError('reference post-world native checkpoint malformed')
    if type(after['players']) is not list:
        raise ProtocolError('reference native roster malformed')
    rows = []
    for row in after['players']:
        if type(row) is not dict or set(row) != {'owner', 'faction_file', 'is_human', 'identity', 'gender', 'player_display_name'}:
            raise ProtocolError('reference native player fields differ')
        if row['gender'] is not None or row['player_display_name'] is not None:
            raise ProtocolError('reference unsupported fields changed')
        rows.append({key: deepcopy(row[key]) for key in ('owner', 'faction_file', 'is_human', 'identity')})
    output = validate_native(dict(players=rows))
    if [row['owner'] for row in rows if row['is_human']] != [after['human_owner']]:
        raise ProtocolError('reference human mask and native player roles disagree')
    return output


def reference_projection():
    manifest_path = EVIDENCE / 'manifest-v1.json'
    if hashlib.sha256(manifest_path.read_bytes()).hexdigest() != MANIFEST_SHA256:
        raise ProtocolError('frozen original identity manifest changed')
    manifest = behavior.read_json(manifest_path)
    for relative, digest in manifest['files'].items():
        path = Path(relative)
        if path.is_absolute() or '..' in path.parts or hashlib.sha256((EVIDENCE / path).read_bytes()).hexdigest() != digest:
            raise ProtocolError('frozen original identity artifact changed: ' + relative)
    suite = behavior.read_json(EVIDENCE / 'cases-v1.json')
    record = behavior.read_json(EVIDENCE / 'observations-v1.json')
    original = behavior.validate_observations(record, suite)
    projected = deepcopy(suite)
    for case in projected['cases']:
        if case['algorithm'] != ORIGINAL_ALGORITHM: raise ProtocolError('unexpected original identity algorithm')
        validate_input(case['input']); case['algorithm'] = ALGORITHM
    request = probe_request(projected)
    observations = []
    for case in request['cases']:
        output = project_output(original[case['id']])
        observations.append(dict(id=case['id'], case_sha256=fingerprint(case), output=output))
    reference = dict(record['reference'], projection_algorithm=ALGORITHM,
        source_cases_sha256=hashlib.sha256((EVIDENCE / 'cases-v1.json').read_bytes()).hexdigest(),
        source_observations_sha256=hashlib.sha256((EVIDENCE / 'observations-v1.json').read_bytes()).hexdigest(),
        source_manifest_sha256=MANIFEST_SHA256, source_suite_sha256=record['suite_sha256'],
        scope='Exact all-seven native faction/human/six-text-field projection only; zero full-package passing cases')
    return projected, dict(record, suite_sha256=fingerprint(request), observations=observations, reference=reference)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('candidate', 'compare'))
    parser.add_argument('--runtime', type=Path, default=ROOT / 'build/wasm/bin/GLSMAC.js')
    parser.add_argument('--report', type=Path)
    parser.add_argument('--case', dest='selected', action='append', default=[])
    args = parser.parse_args(argv)
    if args.action == 'candidate':
        rows, versions, executions = [], [], []
        for case in load_request()['cases']:
            if case['algorithm'] != ALGORITHM:
                rows.append(dict(id=case['id'], status='unsupported', reason='unknown native identity contract')); continue
            try:
                metadata, output = replay(case, args.runtime, execution_log=executions); versions.append(metadata)
                rows.append(dict(id=case['id'], status='ok', output=output))
            except (ProtocolError, OSError, ValueError, subprocess.SubprocessError) as error:
                rows.append(dict(id=case['id'], status='error', reason=str(error)))
        write_response(dict(name='glsmac-all-player-native-identity', kind='candidate', executions=executions, versions=versions), rows)
        return 0
    executed = False
    def mark():
        nonlocal executed
        executed = True
    try:
        if args.report and (args.report.resolve() == EVIDENCE.resolve() or EVIDENCE.resolve() in args.report.resolve().parents):
            raise ProtocolError('comparison report cannot overwrite frozen identity evidence')
        suite, record = reference_projection()
        if args.selected: suite, record = behavior.select_cases(suite, record, args.selected)
        if args.report: args.report.unlink(missing_ok=True)
        command = shlex.join([sys.executable, str(Path(__file__).resolve()), 'candidate', '--runtime', str(args.runtime)])
        actual = behavior.run_probe(command, probe_request(suite), timeout=400, on_started=mark)
        # Validate complete native field shape before the generic exact comparator.
        results = validate_response(actual, probe_request(suite))
        for row in results.values():
            if row['status'] == 'ok': validate_native(row['output'])
        report = behavior.compare(suite, record, actual)
        report.update(algorithm=ALGORITHM, candidate_executed=True, full_package_status='unsupported',
            full_package_passing_cases=0, unsupported=list(EXCLUSIONS))
        if args.report: behavior.write_json(args.report, report, overwrite=True)
        print(canonical(report))
        return 2 if report['summary']['errors'] else int(bool(report['summary']['mismatched'] or report['summary']['unsupported']))
    except (ProtocolError, OSError, ValueError, subprocess.SubprocessError) as error:
        if args.report and not (args.report.resolve() == EVIDENCE.resolve() or EVIDENCE.resolve() in args.report.resolve().parents):
            behavior.write_json(args.report, dict(algorithm=ALGORITHM, candidate_executed=executed,
                full_package_status='unsupported', full_package_passing_cases=0, unsupported=list(EXCLUSIONS), error=str(error)), overwrite=True)
        print('All-player identity comparison failed: ' + str(error), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
