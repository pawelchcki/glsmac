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

import lanes
from protocol import ProtocolError, canonical, decode_json


DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[1]
DEFAULT_CATALOG = DIRECTORY / "catalog.json"
SCRIPT_PATTERN = r"GLSMAC_data/tests/_?[a-z][a-z0-9_]*\.gls\.js"


def load_catalog(path):
    value = decode_json(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict) or type(value.get("version")) is not int or value["version"] != 1 or not isinstance(value.get("suites"), list) or not value["suites"]:
        raise ProtocolError("catalog requires a nonempty suites array and version 1")
    seen = set()
    scripts = set()
    for suite in value["suites"]:
        required = {"id", "script", "domains", "evidence"}
        if not isinstance(suite, dict) or not required <= set(suite) or set(suite) - required - {"packets", "scheduling", "execution_timeout"}:
            raise ProtocolError("invalid suite fields")
        if not isinstance(suite["id"], str) or not re.fullmatch(r"[a-z][a-z0-9-]*", suite["id"]) or suite["id"] in seen:
            raise ProtocolError("invalid or duplicate suite id")
        seen.add(suite["id"])
        script = suite["script"]
        if not isinstance(script, str) or not re.fullmatch(SCRIPT_PATTERN, script):
            raise ProtocolError("suite must name a direct behavior test script")
        if script in scripts:
            raise ProtocolError("duplicate suite script")
        scripts.add(script)
        if "execution_timeout" in suite:
            budget = suite["execution_timeout"]
            if (not isinstance(budget, dict) or set(budget) != {"seconds", "reason"} or
                    type(budget["seconds"]) is not int or not 1 <= budget["seconds"] <= 300 or
                    not isinstance(budget["reason"], str) or not budget["reason"].strip()):
                raise ProtocolError("invalid declared execution timeout")
        if "scheduling" in suite:
            scheduling = suite["scheduling"]
            if (not isinstance(scheduling, dict) or set(scheduling) != {"mode", "reason"} or
                    scheduling["mode"] != "exclusive" or not isinstance(scheduling["reason"], str) or
                    not scheduling["reason"].strip()):
                raise ProtocolError("invalid exclusive scheduling declaration")
        if "packets" in suite:
            packets = suite["packets"]
            if (not isinstance(packets, dict) or set(packets) != {"parts", "assertions"} or
                    type(packets["assertions"]) is not int or packets["assertions"] < 1 or
                    not isinstance(packets["parts"], list) or len(packets["parts"]) < 2):
                raise ProtocolError("invalid packet contract")
            names = set()
            for part in packets["parts"]:
                if not isinstance(part, dict) or set(part) != {"script", "scenario_names"}:
                    raise ProtocolError("invalid packet fields")
                path, declared = part["script"], part["scenario_names"]
                if not isinstance(path, str) or not re.fullmatch(SCRIPT_PATTERN, path) or path in scripts:
                    raise ProtocolError("invalid or duplicate packet script")
                scripts.add(path)
                if (not isinstance(declared, list) or not declared or
                        any(not isinstance(name, str) or not name or "\n" in name or "\r" in name
                            or name in names for name in declared) or len(set(declared)) != len(declared)):
                    raise ProtocolError("invalid or duplicate packet scenario inventory")
                names.update(declared)
        if not isinstance(suite["domains"], list) or not suite["domains"] or any(
            domain not in {"gameplay", "economy", "decision-logic", "ui", "ux"} for domain in suite["domains"]
        ):
            raise ProtocolError("invalid suite domains")
        if suite["evidence"] != "glsmac-regression":
            raise ProtocolError("GSE suites must be labeled glsmac-regression, not original parity")
    return value


def create_snapshot(root=ROOT):
    root = Path(root)
    snapshot = {}
    for directory in (root / "GLSMAC_data/default", root / "GLSMAC_data/tests"):
        for script in sorted(directory.rglob("*.gls.js")):
            snapshot[script.relative_to(root).as_posix()] = script.read_text(encoding="utf-8")
    if (root / "scripts").is_dir():
        package = subprocess.run(
            [os.environ.get("NODE", "node"), str(ROOT / "tools/scripts/snapshot.mjs"), str(root)],
            check=True, capture_output=True, text=True, timeout=30,
        )
        snapshot.update(decode_json(package.stdout))
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


def suite_scripts(suite):
    return [suite["script"], *[part["script"] for part in suite.get("packets", {}).get("parts", [])]]


def run_packets(suite, runtime, snapshot, temporary, timeout, node, worker):
    """One logical suite passes only after every declared isolated packet passes."""
    started = time.perf_counter()
    result = {key: suite[key] for key in ("id", "script", "domains", "evidence")}
    result.update(status="failed", packets=[], per_packet_timeout_s=timeout,
                  worker_timeout_budget_s=timeout * len(suite["packets"]["parts"]))
    logs = []
    try:
        paths = {"runtime_js_sha256": Path(runtime), "runtime_wasm_sha256": Path(runtime).with_suffix(".wasm"),
                 "worker_sha256": Path(worker), "scripts_sha256": Path(snapshot)}
        binding = {key: hashlib.sha256(path.read_bytes()).hexdigest() for key, path in paths.items()}
        sources = decode_json(Path(snapshot).read_text(encoding="utf-8"))
        if not isinstance(sources, dict):
            raise ProtocolError("invalid frozen packet source snapshot")
        packet_directory = Path(tempfile.mkdtemp(prefix=suite["id"] + "--packets-", dir=temporary))
        names, assertions = [], 0
        for index, part in enumerate(suite["packets"]["parts"], 1):
            if part["script"] not in sources or not isinstance(sources[part["script"]], str):
                raise ProtocolError("packet script is absent from the frozen snapshot: " + part["script"])
            child = {key: suite[key] for key in ("domains", "evidence")}
            child.update(id=f"{suite['id']}--packet-{index}", script=part["script"])
            actual = run_suite(child, runtime, snapshot, packet_directory, timeout, node, worker)
            raw = (packet_directory / (child["id"] + ".log")).read_text(encoding="utf-8")
            logs.append(raw)
            actual.update(log=raw, raw_log_sha256=hashlib.sha256(raw.encode("utf-8")).hexdigest(),
                          script_sha256=hashlib.sha256(sources[part["script"]].encode("utf-8")).hexdigest(),
                          execution_binding=dict(binding))
            result["packets"].append(actual)
            if actual["status"] != "passed":
                raise ProtocolError(f"packet {index}/{len(suite['packets']['parts'])}: {actual['reason']}")
            if actual["process_returncode"] != 0 or actual["scenario_names"] != part["scenario_names"]:
                raise ProtocolError(f"packet {index} did not complete its exact ordered scenario inventory")
            for key, path in paths.items():
                if hashlib.sha256(path.read_bytes()).hexdigest() != binding[key]:
                    raise ProtocolError("packet execution input changed: " + key)
            names.extend(actual["scenario_names"])
            assertions += actual["assertions"]
        if assertions != suite["packets"]["assertions"]:
            raise ProtocolError("packet aggregate assertion count differs from the declared contract")
        result.update(status="passed", scenarios=len(names), assertions=assertions, scenario_names=names)
    except (OSError, ProtocolError, ValueError) as error:
        result["reason"] = str(error)
    output = "".join(logs)
    (Path(temporary) / (suite["id"] + ".log")).write_text(output, encoding="utf-8")
    result.update(elapsed_ms=round((time.perf_counter() - started) * 1000, 2),
                  log=output if result["status"] != "passed" else "")
    return result


def run_suite(suite, runtime, snapshot, temporary, timeout, node="node", worker=None):
    start = time.perf_counter()
    worker = Path(worker) if worker else DIRECTORY / "gse-worker.cjs"
    if "packets" in suite:
        return run_packets(suite, runtime, snapshot, temporary, timeout, node, worker)
    request = {
        "runtime": str(runtime), "snapshot": str(snapshot), "script": suite["script"],
        "prefix": f"/tmp/glsmac-fast/{Path(temporary).name}/{suite['id']}",
    }
    result = {"id": suite["id"], "script": suite["script"], "domains": suite["domains"],
              "evidence": suite["evidence"], "status": "failed", "process_returncode": None, "timed_out": False,
              "execution_prefix": request["prefix"]}
    output = ""
    try:
        if "scheduling" in suite:
            paths = {"runtime_js_sha256": Path(runtime), "runtime_wasm_sha256": Path(runtime).with_suffix(".wasm"),
                     "worker_sha256": worker, "scripts_sha256": Path(snapshot)}
            result["execution_binding"] = {key: hashlib.sha256(path.read_bytes()).hexdigest() for key, path in paths.items()}
            sources = decode_json(Path(snapshot).read_text(encoding="utf-8"))
            if not isinstance(sources, dict) or not isinstance(sources.get(suite["script"]), str):
                raise ProtocolError("exclusive script is absent from the frozen source snapshot")
            result["script_sha256"] = hashlib.sha256(sources[suite["script"]].encode("utf-8")).hexdigest()
        process = subprocess.run(
            [node, str(worker)], input=canonical(request), text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=ROOT, timeout=timeout,
        )
        output = process.stdout + process.stderr
        result["process_returncode"] = process.returncode
        if process.returncode != 0:
            raise ProtocolError(f"worker exited {process.returncode}")
        if "scheduling" in suite:
            for key, path in paths.items():
                if hashlib.sha256(path.read_bytes()).hexdigest() != result["execution_binding"][key]:
                    raise ProtocolError("exclusive execution input changed: " + key)
        result.update(parse_output(output), status="passed")
    except subprocess.TimeoutExpired as error:
        result["timed_out"] = True
        def captured(value):
            return value.decode("utf-8", errors="replace") if isinstance(value, bytes) else (value or "")
        output = captured(error.stdout) + captured(error.stderr)
        result["reason"] = f"timeout after {timeout} seconds"
    except (OSError, ProtocolError) as error:
        result["reason"] = str(error)
    result["elapsed_ms"] = round((time.perf_counter() - start) * 1000, 2)
    log = Path(temporary) / f"{suite['id']}.log"
    log.write_text(output, encoding="utf-8")
    result["log"] = output if result["status"] != "passed" or "scheduling" in suite else ""
    if "scheduling" in suite:
        result["raw_log_sha256"] = hashlib.sha256(output.encode("utf-8")).hexdigest()
    return result


def timeout_budget(suite, requested, default=120):
    declared = suite.get("execution_timeout")
    seconds = declared["seconds"] if declared else None
    return dict(requested_seconds=requested, declared_seconds=seconds,
                declared_reason=declared["reason"] if declared else None,
                default_seconds=default,
                effective_seconds=requested if requested is not None else (seconds if seconds is not None else default),
                source="cli" if requested is not None else ("catalog" if declared else "default"))


def scheduled_results(suites, runtime, snapshot, temporary, timeout, node, jobs, runner=None, default_timeout=120):
    """Drain each ordinary worker block before a declared exclusive suite."""
    runner = run_suite if runner is None else runner
    def execute(suite):
        budget = timeout_budget(suite, timeout, default_timeout)
        result = runner(suite, runtime, snapshot, temporary, budget["effective_seconds"], node)
        result["timeout_budget"] = budget
        return result

    def ordinary(block):
        if block:
            with ThreadPoolExecutor(max_workers=jobs) as pool:
                futures = [pool.submit(execute, suite)
                           for suite in block]
                for future in as_completed(futures):
                    yield future.result()
            # run_suite has reaped every child; the pool is also fully closed.

    block = []
    for suite in suites:
        if "scheduling" not in suite:
            block.append(suite)
            continue
        yield from ordinary(block)
        block = []
        result = execute(suite)
        result["scheduling"] = dict(suite["scheduling"], requested_jobs=jobs, suite_worker_limit=1)
        yield result
    yield from ordinary(block)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--runtime", type=Path, default=Path(os.environ.get("WASM_APP_DIR", ROOT / "build/wasm/bin")) / "GLSMAC.js")
    parser.add_argument("--jobs", type=int)
    parser.add_argument("--suite", action="append", help="select suite id (repeatable)")
    parser.add_argument("--domain", choices=("gameplay", "economy", "decision-logic", "ui", "ux"))
    parser.add_argument("--timeout", type=float, help="explicit per-worker seconds; overrides any declared suite deadline")
    parser.add_argument("--default-timeout", type=float, help="runner fallback seconds; declared suite deadlines still apply")
    parser.add_argument("--node", default="node")
    parser.add_argument("--report", type=Path, default=DIRECTORY / ".build/fast-report.json")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--lane", choices=lanes.LANES, default="all")
    args = parser.parse_args(argv)
    if args.jobs is None:
        args.jobs = 2 if args.lane != "all" else min(os.cpu_count() or 1, 4)
    try:
        if args.lane != "all" and args.jobs > 2:
            raise ProtocolError("selected lanes support at most two workers")
        if not 1 <= args.jobs <= 32 or (args.timeout is not None and not 0 < args.timeout <= 300):
            raise ProtocolError("jobs must be 1..32 and timeout in (0, 300]")
        if args.default_timeout is not None and not 0 < args.default_timeout <= 300:
            raise ProtocolError("default timeout must be in (0, 300]")
        suites = load_catalog(args.catalog)["suites"]
        if args.suite:
            unknown = set(args.suite) - {suite["id"] for suite in suites}
            if unknown:
                raise ProtocolError(f"unknown suites: {sorted(unknown)}")
            suites = [suite for suite in suites if suite["id"] in args.suite]
        if args.domain:
            suites = [suite for suite in suites if args.domain in suite["domains"]]
        suites = lanes.select("regression", suites, args.lane)
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
            for script in suite_scripts(suite):
                if script not in snapshot:
                    raise ProtocolError(f"test script is missing: {script}")
        started = time.perf_counter()
        runtime_hash = hashlib.sha256(runtime.read_bytes()).hexdigest()
        wasm_hash = hashlib.sha256(wasm.read_bytes()).hexdigest()
        args.report.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="glsmac-fast-") as temporary:
            snapshot_path = Path(temporary) / "scripts.json"
            snapshot_json = canonical(snapshot)
            snapshot_path.write_text(snapshot_json, encoding="utf-8")
            results = []
            default_timeout = args.default_timeout if args.default_timeout is not None else 30
            for result in scheduled_results(suites, runtime, snapshot_path, temporary, args.timeout, args.node, args.jobs,
                                            default_timeout=default_timeout):
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
            "version": 1, "kind": "glsmac-headless-regression", "lane": args.lane, "candidate_executed": True, "jobs": args.jobs,
            "requested_timeout_s": args.timeout, "default_timeout_s": default_timeout,
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
