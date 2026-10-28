#!/usr/bin/env python3
"""Prepare a fail-closed Stable coverage plan; never execute or certify tests."""
import argparse
import hashlib
import ast
from fnmatch import fnmatchcase
import re
from pathlib import Path
import subprocess
import sys

import lanes
from protocol import ProtocolError, canonical, decode_json, fingerprint

DIRECTORY = Path(__file__).resolve().parent
PROFILE = DIRECTORY / 'stable-selection-plan-v1.json'
SHA = re.compile(r'[0-9a-f]{40}')
KINDS = lanes.RELEASE_KINDS


def require(condition, message):
    if not condition:
        raise ProtocolError(message)


def fields(value, names, label):
    require(isinstance(value, dict) and set(value) == set(names), 'Invalid ' + label + ' fields')


def path(value):
    # Reject ambiguous spelling instead of normalizing an attack into a match.
    require(isinstance(value, str) and bool(value) and value.isascii(), 'Invalid changed path')
    require(all(32 < ord(c) < 127 for c in value) and '\\' not in value and ':' not in value,
            'Unsafe changed path')
    require(not value.startswith('/') and all(p not in ('', '.', '..') for p in value.split('/')),
            'Unsafe changed path components')
    require(not any(c in value for c in '*?[]'), 'Changed path contains pattern syntax')
    return value


def changes(value):
    require(isinstance(value, list), 'Changed paths must be an explicit list')
    result = []
    seen = set()
    for row in value:
        require(isinstance(row, dict), 'Invalid change record')
        status = row.get('status')
        require(status in ('A', 'M', 'D', 'T', 'R', 'C'), 'Unknown change status')
        fields(row, ('status', 'path', 'old_path') if status in ('R', 'C') else ('status', 'path'), 'change')
        clean = {'status': status, 'path': path(row['path'])}
        if status in ('R', 'C'):
            clean['old_path'] = path(row['old_path'])
            require(clean['old_path'] != clean['path'], 'Rename/copy has identical paths')
        key = canonical(clean)
        require(key not in seen, 'Duplicate change record')
        seen.add(key)
        result.append(clean)
    return sorted(result, key=canonical)


def diff_records(raw):
    """Parse Git's NUL-delimited name-status format without shell/path guessing."""
    try:
        tokens = raw.decode('utf-8').split('\0')
    except UnicodeDecodeError as error:
        raise ProtocolError('Non-UTF8 Git path') from error
    require(tokens[-1] == '', 'Truncated Git diff')
    tokens.pop()
    rows = []
    while tokens:
        status = tokens.pop(0)
        require(bool(re.fullmatch(r'[AMDT]|[RC](?:100|0[0-9]{2}|[0-9]{1,2})', status)), 'Invalid Git diff status')
        count = 2 if status[0] in 'RC' else 1
        require(len(tokens) >= count, 'Truncated Git change')
        names, tokens = tokens[:count], tokens[count:]
        rows.append(dict(status=status[0], path=names[-1], **({'old_path': names[0]} if count == 2 else {})))
    return changes(rows)


def inventory(root=DIRECTORY):
    """Reuse catalog validation; read synthetic case inputs, never observations."""
    manifest = lanes.load_manifest(root / 'lanes.json', root)
    known = lanes.inventory(manifest, root)
    cases = {}
    for kind, rows in known.items():
        if kind == 'regression':
            continue
        prefix = 'ui' if kind in ('ui', 'pending-ui') else 'economy' if kind == 'economy' else ''
        for row in rows:
            relative = str(Path(prefix) / row['cases']) if kind != 'gaps' else row['cases']
            # Catalog paths are treated as untrusted inputs here as well.
            path(relative)
            cases[relative] = lanes.read(root / relative)
    source = root / 'state_trace/terraform_actions.py'
    constants = {}
    for node in ast.parse(source.read_text()).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            if node.targets[0].id in ('PRIMITIVES', 'SEA', 'COMMANDS'):
                constants[node.targets[0].id] = ast.literal_eval(node.value)
    require(set(constants) == {'PRIMITIVES', 'SEA', 'COMMANDS'}, 'Missing action inventory')
    action_ids = []
    for domain, key in [('land', 'PRIMITIVES'), ('sea', 'SEA'), ('command', 'COMMANDS')]:
        values = constants[key]
        require(isinstance(values, tuple) and all(isinstance(v, str) and re.fullmatch(r'[a-z][a-z_]*', v) for v in values),
                'Invalid action inventory')
        action_ids += [domain + ':' + v for v in values]
    require(len(action_ids) == len(set(action_ids)), 'Duplicate action inventory')
    startup = []
    for name in ('core', 'source'):
        relative = f'ui/cases/initial-production-controls-{name}.json'
        case = lanes.read(root / relative)
        cases[relative] = case
        startup += [row['id'] for row in case['cases']]
    script_root = root.parents[1] / 'GLSMAC_data/tests'
    regression_sources = {str(name.relative_to(root.parents[1])): hashlib.sha256(name.read_bytes()).hexdigest()
                          for name in sorted(script_root.rglob('*.gls.js'))}
    require(bool(regression_sources), 'Missing regression script inputs')
    payload = dict(manifest=manifest, catalogs=known, case_inputs=cases, regression_sources=regression_sources, action_ids=sorted(action_ids),
                   startup_projection_ids=sorted(startup))
    return dict(sha256=fingerprint(payload), manifest=manifest,
                ids={kind: sorted(row['id'] for row in known[kind]) for kind in KINDS},
                action_ids=sorted(action_ids), startup_projection_ids=sorted(startup))


def validate_profile(profile, current):
    fields(profile, ('version', 'inventory_sha256', 'hot_regression', 'moved_regression',
                     'hot_actions', 'all_actions', 'areas', 'dependencies_reviewed'), 'profile')
    require(type(profile['version']) is int and profile['version'] == 1, 'Unknown profile version')
    # v1 intentionally cannot authorize narrowed dependency selection.
    require(profile['dependencies_reviewed'] is False, 'v1 dependencies are not independently reviewed')
    require(profile['inventory_sha256'] == current['sha256'], 'Profile inventory is stale; refresh and review required')
    old = current['manifest']['kinds']
    keep = lanes.ids(profile['hot_regression'], 'profile Hot')
    moved = lanes.ids(profile['moved_regression'], 'profile moved')
    require(not keep & moved and keep | moved == set(old['regression']['hot']), 'Changed Hot coverage union')
    require(set(current['ids']['regression']) == keep | moved | set(old['regression']['stable']), 'Lost regression coverage')
    for name in ('hot_actions', 'all_actions'):
        values = profile[name]
        require(isinstance(values, list) and all(isinstance(v, str) for v in values)
                and len(values) == len(set(values)), 'Invalid action selection')
    require(set(profile['all_actions']) == set(current['action_ids']), 'Changed complete action inventory')
    require(bool(profile['hot_actions']) and set(profile['hot_actions']) <= set(current['action_ids']), 'Unknown Hot action')
    require(isinstance(profile['areas'], dict) and bool(profile['areas']), 'Missing area map')
    lanes.ids(list(profile['areas']), 'area IDs')
    for patterns in profile['areas'].values():
        require(isinstance(patterns, list) and bool(patterns) and len(patterns) == len(set(patterns)), 'Invalid area patterns')
        for pattern in patterns:
            require(isinstance(pattern, str), 'Invalid area pattern')
            path(pattern.replace('*', 'x').replace('?', 'x'))
    return profile


def select(profile, current, request, actual_head, actual_changes):
    """Verify caller bindings against independently collected Git state."""
    validate_profile(profile, current)
    fields(request, ('version', 'base_sha', 'head_sha', 'inventory_sha256', 'changes'), 'request')
    require(type(request['version']) is int and request['version'] == 1, 'Unknown request version')
    for key in ('base_sha', 'head_sha'):
        require(isinstance(request[key], str) and SHA.fullmatch(request[key]), 'Expected exact commit SHA')
    require(request['head_sha'] == actual_head, 'Stale head')
    require(request['inventory_sha256'] == current['sha256'], 'Stale request inventory')
    declared, actual = changes(request['changes']), changes(actual_changes)
    require(declared == actual, 'Declared changed paths differ from actual Git diff')
    reasons, areas = [], set()
    for change in actual:
        for name in ('old_path', 'path'):
            if name not in change:
                continue
            changed = change[name]
            matches = sorted(area for area, patterns in profile['areas'].items()
                             if any(fnmatchcase(changed, pattern) for pattern in patterns))
            areas.update(matches)
            reasons.append(dict(path=changed, side=name, areas=matches,
                                reason='unreviewed-dependencies' if matches else 'unmapped-path'))
    if not actual:
        reasons.append(dict(reason='empty-diff-does-not-authorize-empty-coverage'))
    old = current['manifest']['kinds']
    hot = {kind: sorted(profile['hot_regression'] if kind == 'regression' else old[kind]['hot']) for kind in KINDS}
    stable = {kind: sorted(old[kind]['stable'] + (profile['moved_regression'] if kind == 'regression' else [])) for kind in KINDS}
    for kind in KINDS:
        require(not set(hot[kind]) & set(stable[kind]) and set(hot[kind] + stable[kind]) == set(current['ids'][kind]),
                'Changed coverage union: ' + kind)
    return dict(version=1, kind='stable-selection-plan', candidate_executed=False,
                gate_satisfied=False, execution_required_before_merge=True,
                scope='Preparatory plan only; public candidate coverage is not original or full-game agreement',
                base_sha=request['base_sha'], head_sha=request['head_sha'],
                inventory_sha256=current['sha256'], profile_sha256=fingerprint(profile),
                changes=actual, areas=sorted(areas), reasons=reasons,
                full_stable_fallback=True, fallback_reason='v1 dependency mapping awaits independent review',
                always_hot=hot, required_stable=stable,
                always_hot_captures=dict(terraform_actions=sorted(profile['hot_actions']),
                                         startup_native=current['startup_projection_ids'],
                                         complete_checks=['terrain-seven-player', 'identity-all-player', 'cooperation-seven-owner',
                                                          'float-json-transport', 'world-minimum-generation', 'base-operations-navigation']),
                required_stable_captures=dict(terraform_actions=current['action_ids']),
                retained_external_checks=['complete-gse-and-coverage', 'native-builds', 'wasm-graphics-platform-browser',
                                          'existing-protected-hot-and-main-health'],
                excluded_from_passing_totals=['pending-ui', 'gaps', 'archives', 'private-reference-and-installed-asset-checks'])


def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root)


def actual_changes(root, base, head):
    return diff_records(git(root, 'diff', '--name-status', '-z', '--find-renames',
                            '--find-copies', '--find-copies-harder', base, head, '--'))


def report_destination(args):
    """Validate once and use the same canonical destination for unlink/write."""
    require(not args.report.is_symlink(), 'Report final component cannot be a symlink')
    destination = args.report.resolve()
    protected = [name.resolve() for name in (args.request, args.profile) if name is not None]
    require(destination not in protected, 'Report cannot overwrite inputs')
    require(not destination.is_relative_to(DIRECTORY.parents[1].resolve()), 'Report must be outside the source checkout')
    return destination


def clear_report_after_parse_error(argv):
    # Recover each option independently: a malformed --profile must not prevent
    # identifying a valid --report. Keep every earlier input path protected even
    # when a duplicate later occurrence lacks its value. Ambiguous outputs are
    # left untouched rather than guessing which file was intended.
    values = {name: [] for name in ('--request', '--profile', '--report')}
    for index, token in enumerate(argv):
        if token == '--': break
        name, separator, value = token.partition('=')
        if name not in values: continue
        if not separator:
            if index + 1 >= len(argv) or argv[index + 1].startswith('-'): continue
            value = argv[index + 1]
        if value: values[name].append(Path(value))
    try:
        reports = set(values['--report'])
        if len(reports) != 1: return
        args = argparse.Namespace(report=reports.pop(), request=None, profile=PROFILE)
        destination = report_destination(args)
        protected = {PROFILE.resolve(), *(path.resolve() for name in ('--request', '--profile') for path in values[name])}
        require(destination not in protected, 'Report cannot overwrite inputs')
        destination.unlink(missing_ok=True)
    except (OSError, ValueError):
        pass


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--request', type=Path, required=True, help='Exact SHAs, inventory hash and expected changed paths')
    parser.add_argument('--profile', type=Path, default=PROFILE)
    parser.add_argument('--report', type=Path, required=True)
    argv = list(sys.argv[1:] if argv is None else argv)
    try:
        args = parser.parse_args(argv)
    except SystemExit as error:
        if error.code: clear_report_after_parse_error(argv)
        raise
    # Do not leave an earlier successful planning artifact on any failure.
    try:
        root = DIRECTORY.parents[1]
        args.report = report_destination(args)
        args.report.unlink(missing_ok=True)
        request = decode_json(args.request.read_text())
        fields(request, ('version', 'base_sha', 'head_sha', 'inventory_sha256', 'changes'), 'request')
        for key in ('base_sha', 'head_sha'):
            require(isinstance(request[key], str) and SHA.fullmatch(request[key]), 'Expected exact commit SHA')
            require(git(root, 'rev-parse', '--verify', request[key] + '^{commit}').decode().strip() == request[key], 'Unknown commit')
        require(not git(root, 'status', '--porcelain', '--untracked-files=no'), 'Tracked source modifications require a committed head')
        require(git(root, 'merge-base', request['base_sha'], request['head_sha']).decode().strip() == request['base_sha'],
                'Base must be the current chosen merge base')
        actual = actual_changes(root, request['base_sha'], request['head_sha'])
        result = select(decode_json(args.profile.read_text()), inventory(), request,
                        git(root, 'rev-parse', 'HEAD').decode().strip(), actual)
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(canonical(result) + '\n')
        return 0
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print('Stable selection failed: ' + str(error), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
