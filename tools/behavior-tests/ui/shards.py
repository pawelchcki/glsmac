#!/usr/bin/env python3
"""Partition UI cases and require complete, successful candidate replay."""

import argparse
import hashlib
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import audit
import compare
from fast import create_snapshot
import lanes
from protocol import ProtocolError, fingerprint, probe_request

DIRECTORY = Path(__file__).resolve().parent


def parse_shard(value):
    if not isinstance(value, str) or not re.fullmatch(r'[1-9][0-9]*/[1-9][0-9]*', value):
        raise ProtocolError('shard must be INDEX/COUNT, starting at 1')
    index, count = map(int, value.split('/'))
    if not 1 <= index <= count <= 16:
        raise ProtocolError('shard requires 1 <= INDEX <= COUNT <= 16')
    return index, count


def select_cases(suite, shard):
    index, count = parse_shard(shard)
    return [case['id'] for offset, case in enumerate(suite['cases']) if offset % count == index - 1]


def aggregate(reports, lane, runtime, directory=DIRECTORY):
    references = lanes.select('ui', audit.load_references(directory / 'catalog.json'), lane)
    expected_source = fingerprint(create_snapshot())
    expected_runtime = hashlib.sha256(runtime.with_suffix('.wasm').read_bytes()).hexdigest()
    count = len(reports)
    if not 1 <= count <= 16:
        raise ProtocolError('expected 1..16 shard reports')
    seen, results = set(), []
    for report in reports:
        index, total = parse_shard(report.get('shard'))
        if total != count or index in seen:
            raise ProtocolError('missing, duplicate or inconsistent shard reports')
        seen.add(index)
        if (report.get('version') != 1 or report.get('lane') != lane
                or report.get('kind') != 'original-ui-parity' or report.get('pending_transfer') is not False
                or report.get('source_snapshot_sha256') != expected_source):
            raise ProtocolError('shard report is not current-source candidate replay')
        expected = []
        for reference in references:
            suite = compare.read_json(directory / reference['cases'])
            ids = select_cases(suite, report['shard'])
            if ids:
                expected.append((reference, suite, ids))
        actual = report.get('results')
        if not isinstance(actual, list) or [row.get('id') for row in actual] != [row['id'] for row, _, _ in expected]:
            raise ProtocolError('missing, extra or reordered reference results')
        matched = 0
        for row, (reference, suite, ids) in zip(actual, expected):
            evidence = compare.read_json(directory / reference['observations'])
            compare.validate_observations(evidence, suite)
            subset, observations = compare.select_cases(suite, evidence, ids)
            comparison = row.get('comparison', {})
            candidate = comparison.get('candidate', {})
            if (row.get('observations_validated') is not True or row.get('candidate_executed') is not True
                    or row.get('cases') != len(ids) or row.get('selected_case_ids') != ids
                    or row.get('source_suite_sha256') != evidence['suite_sha256']
                    or row.get('executable_sha256') != evidence['reference']['executable_sha256']
                    or comparison.get('suite_sha256') != fingerprint(probe_request(subset))
                    or comparison.get('reference') != observations['reference']
                    or candidate.get('kind') != 'candidate' or candidate.get('rendering') is not False
                    or candidate.get('wasm_sha256', candidate.get('runtime_sha256')) != expected_runtime
                    or comparison.get('results') != [dict(id=case, status='matched') for case in ids]
                    or comparison.get('summary') != dict(matched=len(ids), mismatched=0, unsupported=0, errors=0)):
                raise ProtocolError('incomplete, failing or stale candidate results: ' + reference['id'])
            matched += len(ids)
            results.append(row)
        summary = dict(reference_cases=matched, candidate_executed=bool(expected))
        if expected:
            summary.update(matched=matched, mismatched=0, unsupported=0, errors=0)
        if report.get('summary') != summary:
            raise ProtocolError('shard summary disagrees with its candidate results')
    return dict(version=1, lane=lane, kind='original-ui-shard-aggregate', shards=count,
                source_snapshot_sha256=expected_source, runtime_sha256=expected_runtime,
                summary=dict(reference_cases=sum(row['cases'] for row in results), candidate_executed=bool(results),
                             matched=sum(row['cases'] for row in results), mismatched=0, unsupported=0, errors=0))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reports', type=Path, required=True)
    parser.add_argument('--count', type=int, required=True)
    parser.add_argument('--lane', choices=lanes.LANES, required=True)
    parser.add_argument('--runtime', type=Path, default=DIRECTORY.parents[2] / 'build/wasm/bin/GLSMAC.js')
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args(argv)
    paths = sorted(args.reports.glob('ui-*.json'))
    if len(paths) != args.count:
        raise ProtocolError('expected exactly the configured number of shard files')
    result = aggregate([compare.read_json(path) for path in paths], args.lane, args.runtime)
    compare.write_json(args.report, result, overwrite=True)
    print(result['summary'])
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, ProtocolError) as error:
        print('UI shard aggregation failed: ' + str(error), file=sys.stderr)
        sys.exit(2)
