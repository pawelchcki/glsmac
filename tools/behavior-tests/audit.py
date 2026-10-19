#!/usr/bin/env python3
"""Validate recorded original evidence, or expose all candidate parity gaps."""

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import shlex
import sys
import time

import compare
from protocol import ProtocolError, probe_request


DIRECTORY = Path(__file__).resolve().parent


def load_references(catalog):
    value = compare.read_json(catalog)
    if not isinstance(value, dict) or type(value.get("version")) is not int or value["version"] != 1:
        raise ProtocolError("invalid reference catalog version")
    references = value.get("references")
    if not isinstance(references, list) or not references:
        raise ProtocolError("catalog requires a nonempty references array")
    ids = set()
    files = set()
    for reference in references:
        if not isinstance(reference, dict) or set(reference) != {"id", "cases", "observations"}:
            raise ProtocolError("invalid reference entry")
        if not isinstance(reference["id"], str) or not re.fullmatch(r"[a-z][a-z0-9-]*", reference["id"]) or reference["id"] in ids:
            raise ProtocolError("invalid or duplicate reference id")
        ids.add(reference["id"])
        for field, prefix in (("cases", "cases"), ("observations", "observations")):
            path = reference[field]
            if not isinstance(path, str) or not re.fullmatch(prefix + r"/[a-z0-9.-]+\.json", path) or path in files:
                raise ProtocolError("invalid or reused reference file")
            files.add(path)
    return references


def check_reference(reference, command=None, timeout=60, directory=DIRECTORY, case_ids=None):
    suite = compare.read_json(directory / reference["cases"])
    evidence = compare.read_json(directory / reference["observations"])
    compare.validate_observations(evidence, suite)
    source_hash = evidence["suite_sha256"]
    if case_ids is not None:
        suite, evidence = compare.select_cases(suite, evidence, case_ids)
    result = {
        "id": reference["id"], "cases": len(suite["cases"]),
        "algorithms": dict(sorted(Counter(case["algorithm"] for case in suite["cases"]).items())),
        "executable_sha256": evidence["reference"]["executable_sha256"],
        "observations_validated": True, "candidate_executed": command is not None,
    }
    if case_ids is not None:
        result["source_suite_sha256"] = source_hash
        result["selected_case_ids"] = [case["id"] for case in suite["cases"]]
    if command is not None:
        candidate = compare.run_probe(command, probe_request(suite), timeout)
        comparison = compare.compare(suite, evidence, candidate)
        result["comparison"] = comparison
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=DIRECTORY / "catalog.json")
    parser.add_argument("--suite", action="append")
    parser.add_argument("--target", choices=("native", "wasm"), default="native")
    parser.add_argument("--validate-only", action="store_true", help="check evidence integrity without claiming candidate agreement")
    parser.add_argument("--jobs", type=int, default=3)
    parser.add_argument("--timeout", type=float, default=60)
    parser.add_argument("--report", type=Path, default=DIRECTORY / ".build/parity-audit.json")
    args = parser.parse_args(argv)
    try:
        if not 1 <= args.jobs <= 16 or not 0 < args.timeout <= 300:
            raise ProtocolError("invalid worker count or timeout")
        references = load_references(args.catalog)
        if args.suite:
            unknown = set(args.suite) - {reference["id"] for reference in references}
            if unknown:
                raise ProtocolError(f"unknown reference suites: {sorted(unknown)}")
            references = [reference for reference in references if reference["id"] in args.suite]
        command = None if args.validate_only else shlex.join([
            sys.executable, str(DIRECTORY / "glsmac.py"), "--target", args.target,
        ])
        started = time.perf_counter()
        with ThreadPoolExecutor(max_workers=args.jobs) as pool:
            results = list(pool.map(lambda reference: check_reference(reference, command, args.timeout), references))
        summary = {"reference_cases": sum(result["cases"] for result in results),
                   "candidate_executed": command is not None}
        if command is not None:
            for status in ("matched", "mismatched", "unsupported", "errors"):
                summary[status] = sum(result["comparison"]["summary"][status] for result in results)
        report = {"version": 1, "kind": "original-evidence-validation" if args.validate_only else "original-parity-audit",
                  "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
                  "summary": summary, "results": results}
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        for result in results:
            if command is None:
                print(f"VALIDATED {result['id']}: {result['cases']} original observations; candidate not executed")
            else:
                print(result["id"] + ": " + ", ".join(f"{count} {status}" for status, count in result["comparison"]["summary"].items()))
        if command is None:
            print(f"Validated {summary['reference_cases']} original observations; no parity result requested")
            return 0
        if summary["errors"]:
            return 2
        return int(summary["mismatched"] > 0 or summary["unsupported"] > 0)
    except (OSError, ProtocolError, ValueError) as error:
        print(f"Reference audit failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
