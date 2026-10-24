#!/usr/bin/env python3
"""Record and compare game.state_trace.v1 scenario traces.

Candidate and reference runners speak the protocol.py stdin/stdout JSON
protocol; commands are parsed with shlex (no shell).
"""

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import compare as behavior
from protocol import ProtocolError, canonical, probe_request, validate_cases
from state_trace.compare import compare_suite
from state_trace.compare import select_cases  # noqa: F401 (re-exported)
from state_trace.schema import ALGORITHM, validate_input, validate_reference_output


def read_json(path):
    return behavior.read_json(path)


def check_suite(suite):
    """Validate the suite envelope, algorithm and every case input.

    Unknown algorithms are rejected here, before any recording or
    comparison, so they are never stored as reference evidence.
    """
    cases = validate_cases(suite)
    for case in cases:
        if case["algorithm"] != ALGORITHM:
            raise ProtocolError(f"case {case['id']} uses {case['algorithm']}, not {ALGORITHM}")
        validate_input(case["input"])


def record_observations(suite, command, repeat, timeout, jobs):
    record = behavior.capture_reference(suite, command, repeat, timeout, jobs=jobs)
    inputs = {case["id"]: case["input"] for case in probe_request(suite)["cases"]}
    observed = {row["id"]: row["output"] for row in record["observations"]}
    for case_id, case_input in inputs.items():
        try:
            validate_reference_output(observed[case_id], case_input)
        except ProtocolError as error:
            raise ProtocolError(f"reference trace malformed for {case_id}: {error}") from error
    return record


def write_error_report(path, executed, error):
    """Replace any stale report with honest error evidence (exit 2)."""
    if path is None:
        return
    behavior.write_json(path, {
        "version": 1,
        "algorithm": ALGORITHM,
        "candidate_executed": executed,
        "error": str(error),
    }, overwrite=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="action", required=True)
    record_parser = subcommands.add_parser("record", help="capture repeated reference traces")
    compare_parser = subcommands.add_parser("compare", help="compare a candidate trace with recorded evidence")
    for command in (record_parser, compare_parser):
        command.add_argument("--cases", type=Path, required=True)
        command.add_argument("--timeout", type=float, default=60)
    record_parser.add_argument("--reference-command", required=True, help="reference runner argv, parsed without a shell")
    record_parser.add_argument("--output", type=Path, required=True)
    record_parser.add_argument("--repeat", type=int, default=2)
    record_parser.add_argument("--jobs", type=int, default=1)
    record_parser.add_argument("--force", action="store_true")
    compare_parser.add_argument("--reference", type=Path, required=True, help="recorded reference observations")
    compare_parser.add_argument("--command", required=True, help="candidate runner argv, parsed without a shell")
    compare_parser.add_argument("--case", dest="selected", action="append", default=[],
                                help="scenario id to compare; repeatable, preserves evidence binding")
    compare_parser.add_argument("--report", type=Path)
    args = parser.parse_args(argv)
    probe_started = False

    def mark_probe_started():
        nonlocal probe_started
        probe_started = True

    try:
        if not 0 < args.timeout <= 600:
            raise ProtocolError("timeout must be in (0, 600] seconds")
        suite = read_json(args.cases)
        check_suite(suite)
        if args.action == "record":
            if args.output.exists() and not args.force:
                raise ProtocolError("observation file already exists; choose a new path or use --force")
            record = record_observations(suite, args.reference_command, args.repeat, args.timeout, args.jobs)
            behavior.write_json(args.output, record, args.force)
            print(f"Recorded {len(record['observations'])} traces from "
                  f"{record['reference']['executable_sha256']}")
            return 0
        observations = read_json(args.reference)
        if args.selected:
            suite, observations = behavior.select_cases(suite, observations, args.selected)
        else:
            behavior.validate_observations(observations, suite)
        request = probe_request(suite)
        if args.report:
            # Invalidate any stale report before the probe attempt so a
            # crash or timeout can never leave an old pass behind.
            args.report.unlink(missing_ok=True)
        started = time.perf_counter()
        candidate = behavior.run_probe(args.command, request, args.timeout,
                                       on_started=mark_probe_started)
        duration_s = time.perf_counter() - started
        report = compare_suite(suite, observations, candidate)
        # A valid response requires a process that actually started.
        report["candidate_executed"] = True
        report["duration_s"] = duration_s
        if args.report:
            behavior.write_json(args.report, report, overwrite=True)
        print(", ".join(f"{count} {status}" for status, count in report["summary"].items()))
        for result in report["results"]:
            if result["status"] != "matched":
                print(canonical(result))
        if report["summary"]["errors"]:
            return 2
        return int(any(report["summary"][status] for status in ("mismatched", "unsupported")))
    except (ProtocolError, OSError, RecursionError) as error:
        if args.action == "compare":
            # Never leave a stale pass: invalid inputs report
            # candidate_executed false, a started-but-failed probe true.
            try:
                write_error_report(args.report, probe_started, error)
            except OSError:
                pass
        print(f"State-trace comparison failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
