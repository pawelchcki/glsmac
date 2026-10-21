#!/usr/bin/env python3
"""Combine complete, disjoint repeated captures without changing any answers."""
from argparse import ArgumentParser
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import sys

from compare import read_json, validate_observations, write_json
from protocol import ProtocolError, fingerprint, probe_request


def combine(suite, partitions):
    request = probe_request(suite)
    if len(partitions) < 2:
        raise ProtocolError('Combination requires at least two recorded partitions')
    cases = {case['id']: case for case in request['cases']}
    observations = {}
    reference = repeat = None
    provenance = []
    for part_suite, record in partitions:
        validate_observations(record, part_suite)
        part_request = probe_request(part_suite)
        if reference is None:
            reference, repeat = record['reference'], record['repeat']
            if 'recording_partitions' in reference:
                raise ProtocolError('Nested combined recordings are unsupported')
        elif record['reference'] != reference or record['repeat'] != repeat:
            raise ProtocolError('Partitions require identical original metadata and repeat counts')
        for case in part_request['cases']:
            if case['id'] not in cases or fingerprint(case) != fingerprint(cases[case['id']]):
                raise ProtocolError('Partition differs from declared full input: ' + case['id'])
            if case['id'] in observations:
                raise ProtocolError('Overlapping partition case: ' + case['id'])
            observations[case['id']] = next(row for row in record['observations'] if row['id'] == case['id'])
        provenance.append(dict(suite_sha256=record['suite_sha256'], record_sha256=fingerprint(record),
                               captured_at=record['captured_at'], repeat=record['repeat'],
                               cases=len(part_request['cases'])))
    if set(observations) != set(cases):
        raise ProtocolError('Incomplete partition coverage: ' + ', '.join(sorted(set(cases) - set(observations))))
    result = dict(version=1, suite_sha256=fingerprint(request),
                  captured_at=datetime.now(timezone.utc).isoformat(), repeat=repeat,
                  reference=deepcopy(reference),
                  observations=[deepcopy(observations[case['id']]) for case in request['cases']])
    result['reference']['recording_partitions'] = provenance
    validate_observations(result, suite)
    return result


def main(argv=None):
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--cases', type=Path, required=True)
    parser.add_argument('--part', nargs=2, action='append', required=True, metavar=('CASES', 'OBSERVATIONS'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        result = combine(read_json(args.cases), [(read_json(cases), read_json(record)) for cases, record in args.part])
        write_json(args.output, result)
        print(f"Combined {len(result['observations'])} original cases; every partition repeated {result['repeat']} times")
        return 0
    except (OSError, ProtocolError) as error:
        print('Cannot combine original observations: ' + str(error), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
