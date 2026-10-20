#!/usr/bin/env python3
"""Validate or replay recorded bounded original economy observations."""

import argparse
from pathlib import Path
import shlex
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import audit
import compare
from economy.headless import DEFAULT_RUNTIME
from protocol import ProtocolError


DIRECTORY = Path(__file__).resolve().parent


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--suite", action="append")
    parser.add_argument("--case", action="append")
    parser.add_argument("--runtime", type=Path, default=DEFAULT_RUNTIME)
    parser.add_argument("--jobs", type=int, default=2)
    parser.add_argument("--timeout", type=float, default=120)
    parser.add_argument("--report", type=Path, default=DIRECTORY.parent / ".build/economy/parity.json")
    args = parser.parse_args(argv)
    if not 1 <= args.jobs <= 4 or not 0 < args.timeout <= 300:
        raise ProtocolError("invalid economy worker count or timeout")
    references = audit.load_references(DIRECTORY / "catalog.json")
    if args.suite:
        unknown = set(args.suite) - {reference["id"] for reference in references}
        if unknown:
            raise ProtocolError(f"unknown economy suites: {sorted(unknown)}")
        references = [reference for reference in references if reference["id"] in args.suite]
    if args.case and len(references) != 1:
        raise ProtocolError("--case requires exactly one selected economy suite")
    def command_for(reference):
        if args.validate_only:
            return None
        adapter = 'worker_resources_headless.py' if reference['id'] == 'land-worker-resources' else 'headless.py'
        return shlex.join([sys.executable, str(DIRECTORY / adapter), '--runtime', str(args.runtime.resolve()),
                           '--jobs', str(args.jobs)])
    started = time.perf_counter()
    results = [audit.check_reference(reference, command_for(reference), args.timeout, directory=DIRECTORY, case_ids=args.case)
               for reference in references]
    summary = {"reference_cases": sum(row["cases"] for row in results), "candidate_executed": not args.validate_only}
    if not args.validate_only:
        for status in ("matched", "mismatched", "unsupported", "errors"):
            summary[status] = sum(row["comparison"]["summary"][status] for row in results)
    compare.write_json(args.report, {
        "version": 1, "kind": "original-economy-evidence-validation" if args.validate_only else "original-economy-parity",
        "scope": "Bounded base-square and non-base land-worker NUTRIENTS/MINERALS/ENERGY; not complete terrain or base economy",
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 2), "summary": summary, "results": results,
    }, overwrite=True)
    print(summary)
    return 0 if args.validate_only else 2 if summary["errors"] else int(summary["mismatched"] > 0 or summary["unsupported"] > 0)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ProtocolError) as error:
        print(f"Economy replay failed: {error}", file=sys.stderr)
        sys.exit(2)
