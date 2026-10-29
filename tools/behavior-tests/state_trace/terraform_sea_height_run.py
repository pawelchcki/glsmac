"""Explicit outer execution of one prepared Sea browser command (Linux/POSIX).

This process can witness Popen/wait, not its own caller's tool session/chunk.
No automatic retry, complete-browser credit or fabricated historical schema.
"""
if not __debug__:
    raise RuntimeError('Sea outer runner refuses optimized Python: assertion checking is required')

import argparse
import ctypes
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

import terraform_sea_height_prepare as preparation


class OwnershipPrelaunchUnavailable(RuntimeError):
    """Ownership setup failed before Popen or a successful subreaper change."""


def probe_identity(pid):
    """Definite ENOENT is distinct from unreadable/invalid proc identity."""
    if type(pid) is not int or pid <= 0: return 'unknown', None
    try:
        text = (Path('/proc') / str(pid) / 'stat').read_text()
        fields = text[text.rfind(')') + 2:].split()
        return 'present', {'pid': pid, 'start_ticks': int(fields[19]),
                           'parent': int(fields[1]), 'group': int(fields[2]), 'session': int(fields[3])}
    except (FileNotFoundError, ProcessLookupError): return 'absent', None
    except (OSError, ValueError, IndexError): return 'unknown', None


def process_table():
    result = {}
    try: paths = list(Path('/proc').iterdir())
    except OSError: return result
    for path in paths:
        if not path.name.isdecimal(): continue
        state, row = probe_identity(int(path.name))
        if state == 'present': result[row['pid']] = row
    return result


def task_count():
    try: return len(list(Path('/proc/self/task').iterdir()))
    except OSError: return None


def direct_children():
    # Missing observation is not an empty child set and grants no kill authority.
    result = set()
    try:
        for task in Path('/proc/self/task').iterdir():
            result.update(int(value) for value in (task / 'children').read_text().split())
    except OSError: return None
    return result


def new_ownership():
    table = process_table(); owner = os.getpid(); foreign = {}; parents = {owner}
    children = direct_children()
    if children is None or task_count() != 1:
        raise RuntimeError('Standalone child observation unavailable before launch')
    while True:
        added = {pid for pid, row in table.items() if row['parent'] in parents}
        if added <= parents: break
        parents |= added
    for pid in parents - {owner}: foreign[pid] = table[pid]['start_ticks']
    # Standalone CLI launches only this one Popen child. With prior unrelated
    # children, an unseen orphan could instead be from their tree: fail closed
    # unless its owned ancestry was actually observed before adoption.
    return {'owner': owner, 'known': {}, 'foreign': foreign, 'provenance': {}, 'sessions': {},
            'adoption_allowed': not foreign and not children,
            'unsupported': set(), 'unresolved': [], 'waited_adopted': []}


def members(group, ownership):
    table = process_table()
    known, foreign = ownership['known'], ownership['foreign']
    unresolved = []
    for pid, start in known.items():
        row = table.get(pid)
        if row is None:
            state, row = probe_identity(pid)
            if state == 'present': table[pid] = row
            elif state == 'unknown':
                ownership['unsupported'].add('known-owned-identity-unreadable')
                unresolved.append({'pid': pid, 'start_ticks': start})
        if row and row['start_ticks'] != start:
            ownership['unsupported'].add('owned-pid-start-reused')
            unresolved.append({'pid': pid, 'start_ticks': start})
    owned = {pid for pid, start in known.items() if pid in table and table[pid]['start_ticks'] == start}
    # Track old unrelated branches too; never adopt/reap their known children.
    for mapping, selected, reason in ((foreign, set(foreign), 'foreign'), (known, owned, 'observed-descendant')):
        while True:
            added = {pid for pid, row in table.items() if row['parent'] in selected and
                     row['parent'] in table and table[row['parent']]['start_ticks'] == mapping[row['parent']] and
                     (pid not in mapping or mapping[pid] == row['start_ticks']) and
                     (reason == 'foreign' or pid not in foreign or foreign[pid] != row['start_ticks'])}
            if added <= selected: break
            for pid in added:
                mapping.setdefault(pid, table[pid]['start_ticks'])
                if reason != 'foreign': ownership['provenance'].setdefault(pid, reason)
            selected |= added
    if task_count() != 1:
        ownership['adoption_allowed'] = False
        ownership['unsupported'].add('concurrent-caller-tasks')
    children = direct_children()
    if children is None:
        ownership['unsupported'].add('direct-child-observation-unavailable')
        unresolved.append({'pid': None, 'start_ticks': None})
        children = set()
    children |= {pid for pid, row in table.items() if row['parent'] == ownership['owner']}
    for pid in children:
        row = table.get(pid)
        # Adoption can happen after the process-table scan. Refresh a newly
        # listed child before declaring its identity unavailable; the fresh
        # parent must still prove that it belongs to this outer process.
        if row is None and pid not in known:
            state, observed = probe_identity(pid)
            if state == 'present' and observed['parent'] == ownership['owner']:
                row = observed; table[pid] = row
        if pid in known:
            if row is None:
                # A positive child-list entry contradicts absence, and an
                # unreadable known child cannot silently disappear from scope.
                ownership['unsupported'].add('listed-known-child-identity-unavailable')
                entry = {'pid': pid, 'start_ticks': known[pid]}
                if entry not in unresolved: unresolved.append(entry)
            continue
        if row and pid in foreign and row['start_ticks'] == foreign[pid]: continue
        # New direct children are orphan adoptees only in the exclusive,
        # initially-childless standalone scope; concurrent callers are outside it.
        if row and ownership['adoption_allowed'] and row['start_ticks'] >= ownership['root_start']:
            known[pid] = row['start_ticks']; owned.add(pid)
            ownership['provenance'][pid] = 'new-subreaper-adoptee'
        else:
            ownership['unsupported'].add('unproven-or-unreadable-adopted-child')
            unresolved.append({'pid': pid, 'start_ticks': row['start_ticks'] if row else None})
    ownership['unresolved'] = unresolved
    rows = []
    for pid in sorted(owned):
        row = table[pid]; ownership['sessions'].setdefault(pid, set()).add(row['session'])
        rows.append({'pid': pid, 'start_ticks': row['start_ticks']})
    return rows


def reap(group, ownership):
    # Only positively observed immutable identities, never waitpid(-1).
    for row in members(group, ownership):
        if row not in members(group, ownership): continue
        try:
            waited, status = os.waitpid(row['pid'], os.WNOHANG)
            if waited and ownership is not None:
                ownership['waited_adopted'].append(dict(row, wait_status=status))
        except ChildProcessError: pass


def signal_members(session, kill_signal, ownership):
    for row in members(session, ownership):
        if row not in members(session, ownership): continue
        try: os.kill(row['pid'], kill_signal)
        except ProcessLookupError: pass


def group_absent(group):
    try: os.killpg(group, 0); return False
    except ProcessLookupError: return True
    except PermissionError: return None


def wait_owned(process, ownership, timeout):
    deadline = time.monotonic() + timeout
    while True:
        members(process.pid, ownership)
        remaining = deadline - time.monotonic()
        if remaining <= 0: raise subprocess.TimeoutExpired(process.args, timeout)
        try: return process.wait(timeout=min(.01, remaining))
        except subprocess.TimeoutExpired: pass


def run_owned(argv, cwd, env, output, timeout, cleanup_seconds=5):
    """Owned ancestry/adoption only; no shell, unrelated wait or pattern kill."""
    if not sys.platform.startswith('linux') or not Path('/proc/self/stat').exists():
        raise OwnershipPrelaunchUnavailable('Unsupported process ownership platform before launch')
    assert type(argv) is list and argv and all(type(value) is str for value in argv)
    assert timeout > 0 and cleanup_seconds > 0
    output = Path(output)
    # The standalone outer process adopts orphaned descendants so a killed
    # Node/browser tree can be reaped. Restore the caller's previous flag.
    try:
        ownership = new_ownership()
        libc = ctypes.CDLL(None, use_errno=True); previous = ctypes.c_int()
        if libc.prctl(37, ctypes.byref(previous), 0, 0, 0) != 0:
            raise RuntimeError('Subreaper state cannot be read before launch')
        if libc.prctl(36, 1, 0, 0, 0) != 0:
            raise RuntimeError('Subreaper state cannot be enabled before launch')
    except (OSError, RuntimeError) as error:
        raise OwnershipPrelaunchUnavailable(str(error)) from error
    start, wall = time.monotonic(), time.time()
    record = {'kind': 'terraform-sea-owned-process-completion.v1', 'command_argv': argv,
              'cwd': str(cwd), 'started_wall_time': wall, 'timeout_seconds': timeout,
              'actual_os_process_exit_code': None, 'actual_wait_returned': False, 'spawn_error': None,
              'outer_timed_out': False, 'forced_cleanup': False, 'owned_group_absent': None,
              'external_tool_receipt': {'supported': False, 'reason': 'The outer process cannot attest its caller tool session/chunk'},
              'complete_browser_cases': 0}
    process = None
    def stop_leader(kill_signal):
        # Popen owns the unreaped leader even if /proc observation is unavailable.
        if process is not None and process.poll() is None: process.send_signal(kill_signal)
    try:
        with (output / 'driver.log').open('xb') as log:
            try:
                process = subprocess.Popen(argv, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            except OSError as error:
                record['spawn_error'] = str(error)
                return record
            record.update(pid=process.pid, process_group=process.pid)
            leader = process_table().get(process.pid)
            ownership['root_start'] = leader['start_ticks'] if leader else 0
            if not leader:
                ownership['unsupported'].add('unreadable-owned-leader')
                raise RuntimeError('Owned leader identity unavailable')
            ownership['known'][process.pid] = leader['start_ticks']; ownership['provenance'][process.pid] = 'actual-Popen-leader'
            record.update(pid=process.pid, process_group=process.pid, session_id=leader['session'],
                          initial_owned_identities=members(process.pid, ownership))
            preparation.write_new(output / 'external-start.json', preparation.encoded(record))
            try:
                code = wait_owned(process, ownership, timeout)
            except subprocess.TimeoutExpired:
                record['outer_timed_out'] = True; record['forced_cleanup'] = True
                stop_leader(signal.SIGTERM); signal_members(process.pid, signal.SIGTERM, ownership)
                try: code = process.wait(timeout=cleanup_seconds)
                except subprocess.TimeoutExpired:
                    stop_leader(signal.SIGKILL); signal_members(process.pid, signal.SIGKILL, ownership)
                    code = process.wait(timeout=cleanup_seconds)
            record.update(actual_os_process_exit_code=code, actual_wait_returned=True)
        return record
    except BaseException as error:
        record['lifecycle_error'] = type(error).__name__ + ': ' + str(error)
        return record
    finally:
        if process is not None:
            if process.poll() is None:
                record['forced_cleanup'] = True
                try: stop_leader(signal.SIGTERM); signal_members(process.pid, signal.SIGTERM, ownership)
                except ProcessLookupError: pass
                try: process.wait(timeout=cleanup_seconds)
                except subprocess.TimeoutExpired:
                    try: stop_leader(signal.SIGKILL); signal_members(process.pid, signal.SIGKILL, ownership)
                    except ProcessLookupError: pass
                    try: process.wait(timeout=cleanup_seconds)
                    except subprocess.TimeoutExpired: record['lifecycle_error'] = 'Owned leader did not reap within bounded SIGKILL wait'
            # Popen.wait/poll genuinely reaped the leader, including error paths.
            record.update(actual_os_process_exit_code=process.returncode, actual_wait_returned=process.returncode is not None)
            reap(process.pid, ownership)
            alive = members(process.pid, ownership)
            for kill_signal in (signal.SIGTERM, signal.SIGKILL):
                if not alive: break
                record['forced_cleanup'] = True
                try: signal_members(process.pid, kill_signal, ownership)
                except ProcessLookupError: pass
                deadline = time.monotonic() + cleanup_seconds
                while time.monotonic() < deadline:
                    reap(process.pid, ownership); alive = members(process.pid, ownership)
                    if not alive: break
                    time.sleep(.01)
            record['remaining_owned_identities'] = alive
            record['ownership_supported'] = not ownership['unsupported']
            record['ownership_unsupported_reasons'] = sorted(ownership['unsupported'])
            record['unresolved_adopted_children'] = ownership['unresolved']
            record['known_owned_identities_absent'] = not alive and not ownership['unresolved'] and record['ownership_supported']
            record['owned_group_absent'] = group_absent(process.pid)
            current = process_table()
            record['observed_owned_session_absent'] = not any(current[row['pid']]['session'] == process.pid for row in alive if row['pid'] in current)
            record['adopted_children_actual_waits'] = ownership['waited_adopted']
            record['owned_identity_provenance'] = [dict(pid=pid, start_ticks=start,
                provenance=ownership['provenance'][pid], observed_sessions=sorted(ownership['sessions'].get(pid, set())))
                for pid, start in sorted(ownership['known'].items())]
            record['ownership_scope'] = 'Actual Popen plus immutable observed ancestry and new subreaper adoptees only when initially childless; ambiguous/unreadable identities reject completion, unrelated baselines preserved'

        record['elapsed_seconds'] = time.monotonic() - start
        # Baseline unrelated identities were never signalled or waited.
        record['subreaper_restored'] = libc.prctl(36, previous.value, 0, 0, 0) == 0


def load_preflight(path, expected_digest):
    path = Path(path).resolve(strict=True)
    assert preparation.sha(path) == expected_digest, 'Different prepared metadata'
    record = json.loads(path.read_bytes()); preparation.validate_record(record)
    assert path.parent == Path(record['config']['output'])
    assert preparation.pins(record['config']) == record['pins'], 'Inputs changed after prepare'
    for name, digest in record['prepared_files'].items():
        assert name in ('declared-map.MP', 'executed-rules.txt', 'fixture-main.gls.js', 'fixture-world.gls.js')
        assert preparation.sha(path.parent / name) == digest
    assert set(record['prepared_files']) == {'declared-map.MP', 'executed-rules.txt', 'fixture-main.gls.js', 'fixture-world.gls.js'}
    for name, digest in record['tool_sources'].items(): assert preparation.sha(name) == digest
    assert record['tool_sources'][str(Path(__file__).resolve())] == preparation.sha(__file__)
    return record


def native_report_exit(report):
    native = report.get('native_exit')
    if type(native) is dict and type(native.get('raw_code')) is int and native.get('body_state') == 'exited' and native.get('status_text') == f"GLSMAC exited ({native['raw_code']}).":
        return native['raw_code']
    return None


def report_bindings(report, preflight):
    source, inputs = preflight['pins']['source'], preflight['inputs']
    expected = {'host_head': source['head'], 'native_source_tree': source['native_tree'], 'default_tree': source['default_tree'],
                'runtime_js_sha256': preflight['pins']['runtime']['GLSMAC.js'], 'runtime_wasm_sha256': preflight['pins']['runtime']['GLSMAC.wasm'],
                'seed_requested': preflight['seed_requested'], 'map_sha256': inputs['map_sha256'],
                'driver_sha256': source['files'][preparation.DRIVER],
                'sea_input_sha256': source['files']['tools/wasm-tests/terraform-sea-height-inputs.mjs'],
                'observer_sha256': preflight['prepared_files']['fixture-main.gls.js'],
                'world_input_sha256': preflight['prepared_files']['fixture-world.gls.js']}
    bad = [key for key, value in expected.items() if report.get(key) != value]
    override = report.get('source_override', {})
    if override.get('original_sha256') != preflight['expected']['rules']: bad.append('original_rules')
    if override.get('rate_one_sha256') != inputs['executed_rules_sha256']: bad.append('executed_rules')
    if json.dumps(override.get('rows'), sort_keys=True) != json.dumps(inputs['override_table'], sort_keys=True): bad.append('override_table')
    return {'match': not bad, 'mismatched_fields': bad}


def execute(path, expected_digest):
    record = load_preflight(path, expected_digest); config = record['config']; out = Path(config['output'])
    # An atomic one-use claim makes even a failed launch a consumed attempt.
    preparation.write_new(out / 'execution-claim.json', preparation.encoded({'preflight_sha256': expected_digest, 'argv': record['argv'], 'candidate_execution_requested': True}))
    env = preparation.clean_environment()
    env['PATH'] = str(Path(config['server_python']).parent) + os.pathsep + env.get('PATH', '')
    env.update(record['environment'])
    try:
        completion = run_owned(record['argv'], config['source_root'], env, out, record['outer_timeout_seconds'])
    except OwnershipPrelaunchUnavailable as error:
        # This typed boundary is reached only before Popen and before any
        # successful subreaper mutation. Never turn a post-launch error into a
        # fabricated no-child, wait or cleanup observation.
        completion = {'kind': 'terraform-sea-owned-process-completion.v1',
                      'command_argv': record['argv'], 'cwd': config['source_root'],
                      'actual_os_process_exit_code': None, 'actual_wait_returned': False,
                      'spawn_error': None, 'prelaunch_ownership_error': str(error),
                      'child_launch_attempted': False, 'outer_timed_out': False,
                      'forced_cleanup': False, 'owned_group_absent': None,
                      'known_owned_identities_absent': False, 'ownership_supported': False,
                      'ownership_unsupported_reasons': ['prelaunch-ownership-unavailable'],
                      'remaining_owned_identities': [], 'unresolved_adopted_children': [],
                      'subreaper_restored': False, 'subreaper_state_unmodified': True,
                      'complete_browser_cases': 0,
                      'external_tool_receipt': {'supported': False, 'reason': 'No child was launched; no tool receipt is supplied'}}
    completion.update(kind='terraform-sea-portable-external-completion.v1',
                      actual_os_node_exit_code=completion['actual_os_process_exit_code'],
                      preflight_sha256=expected_digest, runner_sha256=preparation.sha(__file__),
                      source_head=record['pins']['source']['head'], native_app_exit=None, reported_native_exit=None,
                      postpins_match=False, postpins_error=None, report_input_bindings={'match': False, 'reason': 'No actual report supplied'},
                      reported_status=None, status='failed-or-unsupported')
    try: completion['postpins_match'] = preparation.pins(config) == record['pins']
    except Exception as error: completion['postpins_error'] = str(error)
    report = out / 'report.json'
    if report.exists():
        completion['report_sha256'] = preparation.sha(report)
        try:
            reported = json.loads(report.read_bytes())
            completion['report_input_bindings'] = report_bindings(reported, record)
            completion['reported_status'] = reported.get('status')
            completion['reported_native_exit'] = reported.get('native_exit')
            completion['native_app_exit'] = native_report_exit(reported)
        except (ValueError, TypeError, KeyError) as error: completion['report_read_error'] = str(error)
    for name in ('application.log', 'application-log-chunks.jsonl'):
        if (out / name).exists(): completion[name + '_sha256'] = preparation.sha(out / name)
    okay = (completion['actual_wait_returned'] and completion['actual_os_node_exit_code'] == 0 and
            completion['owned_group_absent'] is True and completion['known_owned_identities_absent'] is True and completion['ownership_supported'] is True and not completion['forced_cleanup'] and
            not completion['outer_timed_out'] and completion['postpins_match'] and completion['native_app_exit'] == 0 and completion['reported_status'] == 'passed' and
            not completion.get('lifecycle_error') and completion['subreaper_restored'] and completion['report_input_bindings']['match'])
    if okay: completion['status'] = 'process-and-reported-native-exit-zero-not-complete-browser-credit'
    preparation.write_new(out / 'portable-external-completion.json', preparation.encoded(completion))
    return completion, 0 if okay else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preflight', required=True, type=Path)
    parser.add_argument('--expected-preflight-sha256', required=True)
    parser.add_argument('--execute', action='store_true', help='Actually launch the pinned Node browser command ONCE; omitted means inspect only')
    args = parser.parse_args()
    if not args.execute:
        record = load_preflight(args.preflight, args.expected_preflight_sha256)
        print(json.dumps({'candidate_executed': False, 'argv': record['argv'], 'environment': record['environment'],
                          'phase': 'inspect-only-no-child-launch'}, indent=2)); return
    completion, code = execute(args.preflight, args.expected_preflight_sha256)
    print(json.dumps(completion, indent=2)); raise SystemExit(code)


if __name__ == '__main__': main()
