#!/usr/bin/env python3
"""Record/compare standalone presentation.trace.v1 pre-world traces."""
import argparse
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import compare as behavior
from protocol import ProtocolError, probe_request, validate_cases, validate_response
from state_trace.presentation_schema import ALGORITHM, compare_outputs, validate_input, validate_output


def check_suite(suite):
    for case in validate_cases(suite):
        if case['algorithm'] != ALGORITHM:
            raise ProtocolError('unknown presentation algorithm: ' + case['algorithm'])
        validate_input(case['input'])


def compare_suite(suite, record, candidate):
    check_suite(suite)
    behavior.validate_observations(record, suite)
    cases = probe_request(suite)
    results = validate_response(candidate, cases)
    observations = {row['id']: row['output'] for row in record['observations']}
    summary = {'matched':0, 'mismatched':0, 'unsupported':0, 'errors':0}
    rows = []
    for case in cases['cases']:
        expected = observations[case['id']]
        validate_output(expected, case['input'], reference=True)
        result = results[case['id']]
        if result['status'] == 'ok':
            row = compare_outputs(expected, result['output'], case['input'])
        else:
            row = {'status':result['status'], 'reason':result['reason']}
        summary['errors' if row['status'] == 'error' else row['status']] += 1
        rows.append({'id':case['id'], **row})
    return {'version':1, 'algorithm':ALGORITHM, 'suite_sha256':record['suite_sha256'], 'reference':record['reference'],
            'candidate':candidate['implementation'], 'summary':summary, 'results':rows}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest='action', required=True)
    record = subs.add_parser('record')
    compare = subs.add_parser('compare')
    for command in (record, compare):
        command.add_argument('--cases', type=Path, required=True)
        command.add_argument('--timeout', type=float, default=120)
    record.add_argument('--reference-command', required=True)
    record.add_argument('--repeat', type=int, default=2)
    record.add_argument('--output', type=Path, required=True)
    compare.add_argument('--reference', type=Path, required=True)
    compare.add_argument('--command', required=True)
    compare.add_argument('--report', type=Path, required=True)
    args = parser.parse_args(argv)
    started = False
    def mark_started():
        nonlocal started
        started = True
    try:
        if not 0 < args.timeout <= 600: raise ProtocolError('timeout outside (0,600] seconds')
        suite = behavior.read_json(args.cases); check_suite(suite)
        if args.action == 'record':
            if args.output.exists(): raise ProtocolError('reference output already exists')
            captured = behavior.capture_reference(suite, args.reference_command, args.repeat, args.timeout)
            outputs = {row['id']:row['output'] for row in captured['observations']}
            for case in suite['cases']: validate_output(outputs[case['id']], case['input'], reference=True)
            behavior.write_json(args.output, captured)
            return 0
        reference = behavior.read_json(args.reference)
        behavior.validate_observations(reference, suite)
        for case in suite['cases']:
            row = next(row for row in reference['observations'] if row['id'] == case['id'])
            validate_output(row['output'], case['input'], reference=True)
        args.report.unlink(missing_ok=True)
        begin = time.perf_counter()
        candidate = behavior.run_probe(args.command, probe_request(suite), args.timeout, on_started=mark_started)
        report = compare_suite(suite, reference, candidate)
        report.update(candidate_executed=True, duration_s=time.perf_counter()-begin)
        behavior.write_json(args.report, report, overwrite=True)
        print(', '.join(f'{n} {key}' for key, n in report['summary'].items()))
        return 2 if report['summary']['errors'] else int(bool(report['summary']['mismatched'] or report['summary']['unsupported']))
    except (OSError, ProtocolError, RecursionError) as error:
        if args.action == 'compare':
            behavior.write_json(args.report, {'version':1, 'algorithm':ALGORITHM, 'candidate_executed':started, 'error':str(error)}, overwrite=True)
        print('Presentation trace failed: ' + str(error), file=sys.stderr)
        return 2


if __name__ == '__main__': sys.exit(main())
