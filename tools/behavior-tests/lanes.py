#!/usr/bin/env python3
"""Select explicit hot/stable catalogs and run existing strict runners sequentially."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys

from protocol import ProtocolError, decode_json, probe_request

DIRECTORY = Path(__file__).resolve().parent
MANIFEST = DIRECTORY / 'lanes.json'
LANES = ('hot', 'stable', 'all')
CATALOGS = {
    'regression': ('catalog.json', 'suites'),
    'ui': ('ui/catalog.json', 'references'),
    'economy': ('economy/catalog.json', 'references'),
    'helper': ('catalog.json', 'references'),
    'pending-ui': ('ui/pending-catalog.json', 'references'),
}
KINDS = (*CATALOGS, 'gaps')
RELEASE_KINDS = ('regression', 'ui', 'economy', 'helper')


def read(path):
    return decode_json(Path(path).read_text())


def ids(values, label):
    if (not isinstance(values, list) or any(not isinstance(value, str) or
            not re.fullmatch(r'[a-z][a-z0-9-]*', value) for value in values)):
        raise ProtocolError('Invalid lane IDs: ' + label)
    if len(values) != len(set(values)):
        raise ProtocolError('Duplicate lane IDs: ' + label)
    return set(values)


def inventory(data, root=DIRECTORY):
    result = {}
    for kind, (path, field) in CATALOGS.items():
        rows = read(root / path).get(field)
        if not isinstance(rows, list) or any(not isinstance(row, dict) or 'id' not in row for row in rows):
            raise ProtocolError('Invalid lane catalog: ' + path)
        ids([row['id'] for row in rows], kind + ' catalog')
        result[kind] = rows
    gaps = data.get('gaps')
    if not isinstance(gaps, list):
        raise ProtocolError('Missing unrecorded gap inventory')
    for gap in gaps:
        if (not isinstance(gap, dict) or set(gap) != {'id', 'cases', 'reason'} or
                not isinstance(gap['cases'], str) or not re.fullmatch(r'ui/cases/[a-z0-9.-]+\.json', gap['cases']) or
                not isinstance(gap['reason'], str) or not gap['reason']):
            raise ProtocolError('Invalid unrecorded gap declaration')
        probe_request(read(root / gap['cases']))
    ids([row['id'] for row in gaps], 'gaps inventory')
    result['gaps'] = gaps
    # A case file cannot simultaneously be ready, pending and unrecorded.
    used = set()
    for kind in ('ui', 'pending-ui', 'gaps'):
        for row in result[kind]:
            path = row['cases'] if kind == 'gaps' else 'ui/' + row['cases']
            if path in used:
                raise ProtocolError('Case file appears in multiple readiness states: ' + path)
            used.add(path)
    return result


def validate_manifest(data, known):
    if (not isinstance(data, dict) or set(data) != {'version', 'kinds', 'gaps', 'archived'} or
            type(data['version']) is not int or data['version'] != 1 or
            not isinstance(data['kinds'], dict) or set(data['kinds']) != set(KINDS)):
        raise ProtocolError('Invalid test lane manifest shape')
    for kind in KINDS:
        lanes = data['kinds'][kind]
        if not isinstance(lanes, dict) or set(lanes) != {'hot', 'stable'}:
            raise ProtocolError('Both explicit lanes are required for ' + kind)
        hot, stable = (ids(lanes[lane], kind + '/' + lane) for lane in ('hot', 'stable'))
        if hot & stable:
            raise ProtocolError('Overlapping hot/stable IDs in ' + kind)
        actual = ids([row['id'] for row in known[kind]], kind + ' inventory')
        if hot | stable != actual:
            raise ProtocolError(f'Unclassified/unknown {kind} IDs: missing={sorted(actual - hot - stable)}, unknown={sorted((hot | stable) - actual)}')
    return data


def archived_directory(entry, root=DIRECTORY):
    metadata = read(root / entry['catalog'])
    if (not isinstance(metadata, dict) or set(metadata) not in (
            {'version', 'references'}, {'version', 'directory', 'references'}) or
            metadata.get('directory', '') not in ('', 'ui')):
        raise ProtocolError('Invalid archived evidence directory metadata')
    return root / metadata.get('directory', '')


def load_manifest(path=MANIFEST, root=DIRECTORY):
    data = read(path)
    # Check the outer shape before accessing catalog-specific declarations.
    if not isinstance(data, dict) or 'kinds' not in data:
        raise ProtocolError('Invalid test lane manifest')
    known = inventory(data, root)
    validate_manifest(data, known)
    archived = data['archived']
    if not isinstance(archived, list):
        raise ProtocolError('Invalid archived evidence metadata')
    catalogs = set()
    for entry in archived:
        if (not isinstance(entry, dict) or set(entry) != {'catalog', 'ids', 'reason'} or
                not isinstance(entry['catalog'], str) or not re.fullmatch(r'[a-z0-9-]+-catalog\.json', entry['catalog']) or
                not isinstance(entry['reason'], str) or not entry['reason'] or entry['catalog'] in catalogs):
            raise ProtocolError('Invalid archived evidence entry')
        catalogs.add(entry['catalog'])
        archived_directory(entry, root)
        declared = ids(entry['ids'], 'archived ' + entry['catalog'])
        rows = read(root / entry['catalog']).get('references', [])
        actual = ids([row['id'] for row in rows], 'archived catalog')
        if declared != actual:
            raise ProtocolError('Changed/unclassified archived evidence IDs')
    return data


def select(kind, rows, lane='all', manifest=None):
    """Filter only by membership; effects and reference comparison stay in runners."""
    if lane not in LANES or kind not in KINDS:
        raise ProtocolError('Unknown test lane or kind')
    data = load_manifest() if manifest is None else manifest
    classified = set(data['kinds'][kind]['hot']) | set(data['kinds'][kind]['stable'])
    requested = ids([row['id'] for row in rows], kind + ' selection')
    if requested - classified:
        raise ProtocolError('Unclassified selected IDs: ' + ', '.join(sorted(requested - classified)))
    chosen = classified if lane == 'all' else set(data['kinds'][kind][lane])
    return [row for row in rows if row['id'] in chosen]


def describe(kind, rows, root=DIRECTORY):
    status = 'pending-transfer' if kind == 'pending-ui' else 'not-ready' if kind == 'gaps' else 'catalogued'
    output = dict(kind=kind, readiness=status, status=status, ids=[row['id'] for row in rows], suites=len(rows), candidate_executed=False)
    if kind != 'regression':
        directory = root / 'ui' if kind in ('ui', 'pending-ui') else root / 'economy' if kind == 'economy' else root
        output['cases'] = sum(len(probe_request(read(directory / row['cases']))['cases']) for row in rows)
    return output


def command(kind, lane, jobs, report, validate_only=False, runtime=None):
    runner = {'regression': 'fast.py', 'ui': 'ui/run.py', 'pending-ui': 'ui/run.py',
              'economy': 'economy/run.py', 'helper': 'audit.py'}[kind]
    argv = [sys.executable, str(DIRECTORY / runner), '--lane', lane, '--report', str(report)]
    if kind == 'pending-ui':
        argv += ['--pending']
    if validate_only:
        argv += ['--list' if kind == 'regression' else '--validate-only']
    else:
        argv += ['--jobs', str(jobs)]
    if kind == 'regression':
        argv += ['--default-timeout', '120']
    if runtime and kind in ('regression', 'economy'):
        argv += ['--runtime', str(runtime)]
    return argv


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lane', choices=LANES, default='all')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--list', action='store_true')
    mode.add_argument('--validate-only', action='store_true', help='integrity only; no candidate agreement')
    parser.add_argument('--kind', choices=KINDS, action='append')
    parser.add_argument('--pending', action='store_true', help='explicit strict pending-ui replay only')
    parser.add_argument('--jobs', type=int, choices=(1, 2), default=1)
    parser.add_argument('--runtime', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args(argv)
    try:
        data = load_manifest()
        known = inventory(data)
        if args.pending and args.kind:
            raise ProtocolError('--pending cannot be combined with --kind')
        kinds = ('pending-ui',) if args.pending else args.kind or (KINDS if args.list or args.validate_only else RELEASE_KINDS)
        if len(kinds) != len(set(kinds)):
            raise ProtocolError('Duplicate selected kinds')
        if 'gaps' in kinds and not (args.list or args.validate_only):
            raise ProtocolError('Unrecorded gaps are not ready to execute; use --list or --validate-only')
        report_path = args.report or DIRECTORY / '.build/lanes' / (args.lane + '.json')
        groups = [describe(kind, select(kind, known[kind], args.lane, data)) for kind in kinds]
        report = dict(version=1, lane=args.lane, kind='test-lane-inventory' if args.list else
                      'test-lane-validation' if args.validate_only else 'test-lane-run',
                      scope='Selected catalogued lane only; stable and all do not establish full-game coverage',
                      candidate_executed=False, groups=groups,
                      deferred=[describe(kind, select(kind, known[kind], args.lane, data)) for kind in ('pending-ui', 'gaps')],
                      archived=[dict(entry, status='archived', candidate_executed=False) for entry in data['archived']])
        failed = False
        for group in groups:
            print(f"{args.lane}/{group['kind']}: {group['suites']} suites, {group['status']}; candidate not executed", flush=True)
            if args.list:
                for identifier in group['ids']:
                    print('  ' + identifier, flush=True)
            if args.list or not group['suites'] or group['kind'] == 'gaps':
                continue
            child_report = report_path.parent / (report_path.stem + '-' + group['kind'] + '.json')
            child_report.parent.mkdir(parents=True, exist_ok=True)
            # A failed child must never leave an older passing report in use.
            child_report.unlink(missing_ok=True)
            env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')
            if args.runtime:
                env['WASM_HEADLESS_APP_DIR'] = str(args.runtime.resolve().parent)
            process = subprocess.run(command(group['kind'], args.lane, args.jobs, child_report,
                                             args.validate_only, args.runtime), env=env, cwd=DIRECTORY.parents[1])
            group['returncode'] = process.returncode
            failed |= process.returncode != 0
            group['status'] = 'validation-failed' if args.validate_only and process.returncode else 'failed' if process.returncode else 'validated' if args.validate_only else 'completed'
            needs_report = not (args.validate_only and group['kind'] == 'regression')
            if needs_report and not child_report.exists():
                failed = True
                group['status'] = 'failed'
                group['reason'] = 'Runner did not produce a report'
            if child_report.exists():
                child = read(child_report)
                group['report'] = str(child_report)
                group['summary'] = child['summary']
                if args.validate_only and child['summary'].get('candidate_executed') is not False:
                    failed = True
                    group['status'] = 'validation-failed'
                    group['reason'] = 'Integrity validation must declare candidate_executed false'
                group['candidate_executed'] = not args.validate_only and bool(child.get('candidate_executed', child.get('summary', {}).get('candidate_executed', False)))
                report['candidate_executed'] |= group['candidate_executed']
        if args.validate_only:
            # Archived evidence remains a static integrity check, never a
            # runnable release lane or a current candidate agreement claim.
            import audit
            for entry in report['archived']:
                for reference in audit.load_references(DIRECTORY / entry['catalog']):
                    audit.check_reference(reference, directory=archived_directory(entry))
                entry['observations_validated'] = True
        report['failed'] = failed
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2) + '\n')
        print('Report:', report_path, flush=True)
        return int(failed)
    except (OSError, ProtocolError, ValueError) as error:
        print('Test lane failed:', error, file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
