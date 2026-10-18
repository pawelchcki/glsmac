#!/usr/bin/env python3
"""Run display-free production GSE behavior tests in isolated parallel workers."""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

from protocol import ProtocolError, canonical, decode_json


DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[1]
DEFAULT_CATALOG = DIRECTORY / "catalog.json"


def load_catalog(path):
    value = decode_json(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict) or type(value.get("version")) is not int or value["version"] != 1 or not isinstance(value.get("suites"), list) or not value["suites"]:
        raise ProtocolError("catalog requires a nonempty suites array and version 1")
    seen = set()
    scripts = set()
    for suite in value["suites"]:
        if not isinstance(suite, dict) or set(suite) != {"id", "script", "domains", "evidence"}:
            raise ProtocolError("invalid suite fields")
        if not isinstance(suite["id"], str) or not re.fullmatch(r"[a-z][a-z0-9-]*", suite["id"]) or suite["id"] in seen:
            raise ProtocolError("invalid or duplicate suite id")
        seen.add(suite["id"])
        script = suite["script"]
        if not isinstance(script, str) or not re.fullmatch(r"GLSMAC_data/tests/_?[a-z][a-z0-9_]*\.gls\.js", script):
            raise ProtocolError("suite must name a direct behavior test script")
        if script in scripts:
            raise ProtocolError("duplicate suite script")
        scripts.add(script)
        if not isinstance(suite["domains"], list) or not suite["domains"] or any(
            domain not in {"gameplay", "economy", "decision-logic", "ui", "ux"} for domain in suite["domains"]
        ):
            raise ProtocolError("invalid suite domains")
        if suite["evidence"] != "glsmac-regression":
            raise ProtocolError("GSE suites must be labeled glsmac-regression, not original parity")
    return value


def create_snapshot(root=ROOT):
    snapshot = {}
    for directory in (root / "GLSMAC_data/default", root / "GLSMAC_data/tests"):
        for script in sorted(directory.rglob("*.gls.js")):
            snapshot[script.relative_to(root).as_posix()] = script.read_text(encoding="utf-8")
    return snapshot


def parse_output(text):
    if "TEST FAILED" in text or "Testing complete, passed:" in text:
        raise ProtocolError("GSE reported a test failure")
    if not re.search(r"^All tests passed\.$", text, re.MULTILINE):
        raise ProtocolError("missing GSE success marker")
    summaries = re.findall(r"BEHAVIOR_SUMMARY (\d+) (\d+)\s*$", text, re.MULTILINE)
    if len(summaries) != 1:
        raise ProtocolError("expected exactly one completed behavior summary")
    scenarios, assertions = map(int, summaries[0])
    if scenarios < 1 or assertions < 1:
        raise ProtocolError("a passing suite must execute scenarios and assertions")
    started = re.findall(r"BEHAVIOR_BEGIN (.+)$", text, re.MULTILINE)
    finished = re.findall(r"BEHAVIOR_PASS (.+)$", text, re.MULTILINE)
    if started != finished or len(set(started)) != len(started):
        raise ProtocolError("incomplete or duplicate named scenarios")
    if started and scenarios != len(started):
        raise ProtocolError("scenario count does not match completion markers")
    return {"scenarios": scenarios, "assertions": assertions, "scenario_names": finished}


def run_suite(suite, runtime, snapshot, temporary, timeout, node="node", worker=None):
    start = time.perf_counter()
    worker = Path(worker) if worker else DIRECTORY / "gse-worker.cjs"
    request = {
        "runtime": str(runtime), "snapshot": str(snapshot), "script": suite["script"],
        "prefix": f"/tmp/glsmac-fast/{Path(temporary).name}/{suite['id']}",
    }
    result = {"id": suite["id"], "script": suite["script"], "domains": suite["domains"],
              "evidence": suite["evidence"], "status": "failed"}
    output = ""
    try:
        process = subprocess.run(
            [node, str(worker)], input=canonical(request), text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=ROOT, timeout=timeout,
        )
        output = process.stdout + process.stderr
        if process.returncode != 0:
            raise ProtocolError(f"worker exited {process.returncode}")
        result.update(parse_output(output), status="passed")
    except subprocess.TimeoutExpired as error:
        output = (error.stdout or b"").decode("utf-8", errors="replace") if isinstance(error.stdout, bytes) else (error.stdout or "")
        result["reason"] = f"timeout after {timeout} seconds"
    except (OSError, ProtocolError) as error:
        result["reason"] = str(error)
    result["elapsed_ms"] = round((time.perf_counter() - start) * 1000, 2)
    log = Path(temporary) / f"{suite['id']}.log"
    log.write_text(output, encoding="utf-8")
    result["log"] = output if result["status"] != "passed" else ""
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--runtime", type=Path, default=Path(os.environ.get("WASM_APP_DIR", ROOT / "build/wasm/bin")) / "GLSMAC.js")
    parser.add_argument("--jobs", type=int, default=min(os.cpu_count() or 1, 4))
    parser.add_argument("--suite", action="append", help="select suite id (repeatable)")
    parser.add_argument("--domain", choices=("gameplay", "economy", "decision-logic", "ui", "ux"))
    parser.add_argument("--timeout", type=float, default=30)
    parser.add_argument("--node", default="node")
    parser.add_argument("--report", type=Path, default=DIRECTORY / ".build/fast-report.json")
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args(argv)
    try:
        if not 1 <= args.jobs <= 32 or not 0 < args.timeout <= 300:
            raise ProtocolError("jobs must be 1..32 and timeout in (0, 300]")
        suites = load_catalog(args.catalog)["suites"]
        if args.suite:
            unknown = set(args.suite) - {suite["id"] for suite in suites}
            if unknown:
                raise ProtocolError(f"unknown suites: {sorted(unknown)}")
            suites = [suite for suite in suites if suite["id"] in args.suite]
        if args.domain:
            suites = [suite for suite in suites if args.domain in suite["domains"]]
        if not suites:
            raise ProtocolError("selection contains no suites")
        if args.list:
            for suite in suites:
                print(f"{suite['id']}: {', '.join(suite['domains'])} ({suite['evidence']})")
            return 0
        runtime = args.runtime.resolve()
        wasm = runtime.with_suffix(".wasm")
        if not runtime.is_file() or not wasm.is_file():
            raise ProtocolError("build the FastDebug WASM app once; GLSMAC.js and GLSMAC.wasm are required")
        snapshot = create_snapshot()
        for suite in suites:
            if suite["script"] not in snapshot:
                raise ProtocolError(f"test script is missing: {suite['script']}")
        started = time.perf_counter()
        runtime_hash = hashlib.sha256(runtime.read_bytes()).hexdigest()
        wasm_hash = hashlib.sha256(wasm.read_bytes()).hexdigest()
        args.report.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="glsmac-fast-") as temporary:
            snapshot_path = Path(temporary) / "scripts.json"
            snapshot_json = canonical(snapshot)
            snapshot_path.write_text(snapshot_json, encoding="utf-8")
            results = []
            with ThreadPoolExecutor(max_workers=args.jobs) as pool:
                futures = [pool.submit(run_suite, suite, runtime, snapshot_path, temporary, args.timeout, args.node) for suite in suites]
                for future in as_completed(futures):
                    result = future.result()
                    results.append(result)
                    if result["status"] == "passed":
                        print(f"PASS {result['id']}: {result['scenarios']} scenarios, {result['assertions']} assertions ({result['elapsed_ms']} ms)")
                    else:
                        print(f"FAIL {result['id']}: {result['reason']}\n{result['log']}", file=sys.stderr)
        results.sort(key=lambda result: result["id"])
        if (hashlib.sha256(runtime.read_bytes()).hexdigest() != runtime_hash or
                hashlib.sha256(wasm.read_bytes()).hexdigest() != wasm_hash):
            raise ProtocolError("runtime changed during the run; finish the build before testing")
        report = {
            "version": 1, "kind": "glsmac-headless-regression", "jobs": args.jobs,
            "runtime": str(runtime), "runtime_sha256": runtime_hash,
            "wasm_sha256": wasm_hash,
            "scripts_sha256": hashlib.sha256(snapshot_json.encode("utf-8")).hexdigest(),
            "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
            "summary": {
                "passed": sum(result["status"] == "passed" for result in results),
                "failed": sum(result["status"] != "passed" for result in results),
                "scenarios": sum(result.get("scenarios", 0) for result in results),
                "assertions": sum(result.get("assertions", 0) for result in results),
            }, "results": results,
        }
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"{report['summary']['passed']}/{len(results)} suites passed; {report['summary']['scenarios']} scenarios; "
              f"{report['summary']['assertions']} assertions; {report['elapsed_ms']} ms; {args.jobs} workers")
        return int(report["summary"]["failed"] > 0)
    except (OSError, ProtocolError, ValueError) as error:
        print(f"Headless behavior tests failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
