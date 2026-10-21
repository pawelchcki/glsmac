#!/usr/bin/env python3
"""Record original-program observations, then compare a candidate's behavior."""

import argparse
from datetime import datetime, timezone
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys

from protocol import (
    MAX_BYTES, ProtocolError, canonical, decode_json, fingerprint, probe_request,
    validate_response,
)


ROOT = Path(__file__).resolve().parents[2]


def read_json(path):
    with Path(path).open(encoding="utf-8") as stream:
        return decode_json(stream.read(MAX_BYTES + 1))


def run_probe(command, request, timeout=60):
    try:
        argv = shlex.split(command)
        if not argv:
            raise ProtocolError("empty runner command")
        process = subprocess.run(
            argv, input=canonical(request), text=True, encoding="utf-8",
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=ROOT, timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired, ValueError) as error:
        raise ProtocolError(f"cannot run probe: {error}") from error
    if process.returncode != 0:
        raise ProtocolError(f"probe exited {process.returncode}: {process.stderr[-4000:]}")
    response = decode_json(process.stdout)
    validate_response(response, request)
    return response


def validate_reference_metadata(metadata):
    if not isinstance(metadata, dict) or metadata.get("kind") != "original-executable":
        raise ProtocolError("reference must identify itself as original-executable")
    digest = metadata.get("executable_sha256")
    if not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest):
        raise ProtocolError("reference requires the original executable's SHA-256")
    if not isinstance(metadata.get("name"), str) or not metadata["name"]:
        raise ProtocolError("reference requires an implementation name")
    if type(metadata.get("adapter_version")) is not int or metadata["adapter_version"] < 1:
        raise ProtocolError("reference requires a positive integer adapter_version")


def capture_reference(suite, command, repeat=2, timeout=60, jobs=1):
    if type(repeat) is not int or not 2 <= repeat <= 10:
        raise ProtocolError("reference capture requires 2..10 identical runs")
    if type(jobs) is not int or not 1 <= jobs <= 2:
        raise ProtocolError("reference jobs must be 1 or 2")
    request = probe_request(suite)
    if jobs == 2:
        # Each runner must isolate its fixture. Keep every independent response;
        # identical outputs AND metadata remain required before evidence exists.
        with ThreadPoolExecutor(max_workers=jobs) as pool:
            responses = list(pool.map(lambda _: run_probe(command, request, timeout), range(repeat)))
        first = responses[0]
        others = iter(responses[1:])
    else:
        first = run_probe(command, request, timeout)
        others = (run_probe(command, request, timeout) for _ in range(repeat - 1))
    validate_reference_metadata(first["implementation"])
    indexed = validate_response(first, request)
    for result in indexed.values():
        if result["status"] != "ok":
            raise ProtocolError(f"reference did not observe {result['id']}: {result['reason']}")
    for other in others:
        other_results = validate_response(other, request)
        if canonical(indexed) != canonical(other_results) or first["implementation"] != other["implementation"]:
            raise ProtocolError("reference was nondeterministic; control world state and RNG before recording")
    return {
        "version": 1,
        "suite_sha256": fingerprint(request),
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "repeat": repeat,
        "reference": first["implementation"],
        "observations": [
            {"id": case["id"], "case_sha256": fingerprint(case), "output": indexed[case["id"]]["output"]}
            for case in request["cases"]
        ],
    }


def validate_observations(record, suite):
    request = probe_request(suite)
    if not isinstance(record, dict) or set(record) != {
        "version", "suite_sha256", "captured_at", "repeat", "reference", "observations",
    }:
        raise ProtocolError("invalid observation record fields")
    if type(record["version"]) is not int or record["version"] != 1:
        raise ProtocolError("unsupported observation version")
    if record["suite_sha256"] != fingerprint(request):
        raise ProtocolError("observations belong to different inputs; capture the changed suite again")
    if type(record["repeat"]) is not int or not 2 <= record["repeat"] <= 10:
        raise ProtocolError("observations require at least two identical reference runs")
    validate_reference_metadata(record["reference"])
    if not isinstance(record["observations"], list):
        raise ProtocolError("observations must be an array")
    cases = {case["id"]: case for case in request["cases"]}
    results = {}
    for observation in record["observations"]:
        if not isinstance(observation, dict) or set(observation) != {"id", "case_sha256", "output"}:
            raise ProtocolError("invalid observation")
        case_id = observation["id"]
        if not isinstance(case_id, str) or case_id not in cases or case_id in results:
            raise ProtocolError("unexpected or duplicate observation")
        if observation["case_sha256"] != fingerprint(cases[case_id]):
            raise ProtocolError(f"observation inputs changed: {case_id}")
        if not isinstance(observation["output"], dict):
            raise ProtocolError("observation output must be an object")
        results[case_id] = observation["output"]
    if set(results) != set(cases):
        raise ProtocolError("missing observations; partial recordings cannot pass")
    canonical(record)
    return results


def select_cases(suite, record, case_ids):
    """Project validated original evidence without changing any observation."""
    validate_observations(record, suite)
    wanted = set(case_ids)
    known = {case["id"] for case in suite["cases"]}
    if not wanted or wanted - known:
        raise ProtocolError(f"empty or unknown case selection: {sorted(wanted - known)}")
    selected = deepcopy(suite)
    selected["cases"] = [case for case in selected["cases"] if case["id"] in wanted]
    evidence = deepcopy(record)
    evidence["suite_sha256"] = fingerprint(probe_request(selected))
    evidence["observations"] = [row for row in evidence["observations"] if row["id"] in wanted]
    validate_observations(evidence, selected)
    return selected, evidence


def differences(expected, actual, path="$", limit=50):
    """Exact structural comparison; no coercion, ignored fields or tolerances."""
    found = []

    def visit(left, right, location):
        if len(found) >= limit:
            return
        if type(left) is not type(right):
            found.append({"path": location, "expected": left, "actual": right})
        elif isinstance(left, dict):
            for key in sorted(set(left) | set(right)):
                child = f"{location}[{json.dumps(key)}]"
                if key not in left:
                    found.append({"path": child, "expected_missing": True, "actual": right[key]})
                elif key not in right:
                    found.append({"path": child, "expected": left[key], "actual_missing": True})
                else:
                    visit(left[key], right[key], child)
                if len(found) >= limit:
                    break
        elif isinstance(left, list):
            if len(left) != len(right):
                found.append({"path": location + ".length", "expected": len(left), "actual": len(right)})
            for index, (left_item, right_item) in enumerate(zip(left, right)):
                visit(left_item, right_item, f"{location}[{index}]")
        elif left != right:
            found.append({"path": location, "expected": left, "actual": right})

    visit(expected, actual, path)
    return found


def compare(suite, record, candidate):
    expected = validate_observations(record, suite)
    actual = validate_response(candidate, probe_request(suite))
    counts = {"matched": 0, "mismatched": 0, "unsupported": 0, "errors": 0}
    results = []
    for case in probe_request(suite)["cases"]:
        case_id = case["id"]
        response = actual[case_id]
        result = {"id": case_id}
        if response["status"] in ("unsupported", "error"):
            status = "errors" if response["status"] == "error" else "unsupported"
            result.update(status=status, reason=response["reason"])
        else:
            delta = differences(expected[case_id], response["output"])
            status = "mismatched" if delta else "matched"
            result.update(status=status)
            if delta:
                result["differences"] = delta
        counts[status] += 1
        results.append(result)
    return {
        "version": 1, "suite_sha256": record["suite_sha256"],
        "reference": record["reference"], "candidate": candidate["implementation"],
        "summary": counts, "results": results,
    }


def write_json(path, value, overwrite=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation protects existing reference evidence unless --force is explicit.
    with path.open("w" if overwrite else "x", encoding="utf-8") as stream:
        stream.write(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="action", required=True)
    record_parser = subcommands.add_parser("record", help="capture repeated original-executable observations")
    compare_parser = subcommands.add_parser("compare", help="compare actual candidate outputs with original observations")
    for command in (record_parser, compare_parser):
        command.add_argument("--cases", type=Path, required=True)
        command.add_argument("--timeout", type=float, default=60)
    record_parser.add_argument("--command", required=True, help="runner argv, parsed without a shell")
    record_parser.add_argument("--output", type=Path, required=True)
    record_parser.add_argument("--repeat", type=int, default=2)
    record_parser.add_argument("--jobs", type=int, default=1, help="independent reference workers, 1 or 2; parallel runners must isolate fixture state")
    record_parser.add_argument("--force", action="store_true")
    references = compare_parser.add_mutually_exclusive_group(required=True)
    references.add_argument("--reference", type=Path, help="recorded original observations")
    references.add_argument("--reference-command", help="run the original now (twice)")
    compare_parser.add_argument("--command", required=True, help="candidate runner argv, parsed without a shell")
    compare_parser.add_argument("--report", type=Path)
    args = parser.parse_args(argv)
    try:
        if not 0 < args.timeout <= 600:
            raise ProtocolError("timeout must be in (0, 600] seconds")
        suite = read_json(args.cases)
        request = probe_request(suite)
        if args.action == "record":
            if args.output.exists() and not args.force:
                raise ProtocolError("observation file already exists; choose a new path or use --force")
            observations = capture_reference(suite, args.command, args.repeat, args.timeout, jobs=args.jobs)
            write_json(args.output, observations, args.force)
            print(f"Recorded {len(request['cases'])} cases from {observations['reference']['executable_sha256']}")
            return 0
        observations = read_json(args.reference) if args.reference else capture_reference(
            suite, args.reference_command, timeout=args.timeout,
        )
        # Validate evidence before spending time building or running the candidate.
        validate_observations(observations, suite)
        candidate = run_probe(args.command, request, args.timeout)
        report = compare(suite, observations, candidate)
        if args.report:
            write_json(args.report, report, overwrite=True)
        print(", ".join(f"{count} {status}" for status, count in report["summary"].items()))
        for result in report["results"]:
            if result["status"] != "matched":
                print(canonical(result))
        if report["summary"]["errors"]:
            return 2
        return int(any(report["summary"][status] for status in ("mismatched", "unsupported")))
    except (ProtocolError, OSError, RecursionError) as error:
        print(f"Behavior comparison failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
