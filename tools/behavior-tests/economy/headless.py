#!/usr/bin/env python3
"""Replay bounded base-square inputs through the production GSE resource handler."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import fast
from protocol import ProtocolError, canonical, load_request, validate_cases, write_response


DIRECTORY = Path(__file__).resolve().parent
ALGORITHM = "economy.base_square_resources.v1"
DEFAULT_RUNTIME = Path(os.environ.get("WASM_HEADLESS_APP_DIR", fast.ROOT / "build/wasm/bin")) / "GLSMAC.js"
WORKER_TIMEOUT = 30


def validate_input(data):
    integers = {"faction_id", "base_id", "x", "y"}
    flags = {"land", "river", "headquarters", "recycling_tanks"}
    if not isinstance(data, dict) or set(data) != integers | flags:
        raise ProtocolError("expected exactly the bounded base-square input fields")
    if any(type(data[key]) is not int for key in integers) or any(type(data[key]) is not bool for key in flags):
        raise ProtocolError("base-square IDs/coordinates must be integers and flags must be booleans")
    if (data["faction_id"] not in range(1, 8) or data["base_id"] not in (0, 1, 7)
            or (data["x"], data["y"]) not in ((0, 0), (2, 2)) or data["river"] and not data["land"]):
        raise ProtocolError("input is outside the bounded base-square fixture")


def gse_literal(value):
    if type(value) is bool:
        return "true" if value else "false"
    if type(value) is int:
        return str(value) if value >= 0 else "(0 - " + str(-value) + ")"
    if isinstance(value, str):
        return "'" + value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "\\r") + "'"
    if isinstance(value, list):
        return "[" + ",".join(gse_literal(item) for item in value) + "]"
    if isinstance(value, dict):
        if any(not re.fullmatch(r"[a-z_]+", key) for key in value):
            raise ProtocolError("invalid GSE fixture field")
        return "{" + ",".join(key + ":" + gse_literal(item) for key, item in value.items()) + "}"
    raise ProtocolError("unsupported GSE fixture value")


def parse_output(output, cases):
    summary = fast.parse_output(output)
    if summary["scenarios"] != 1 or summary["assertions"] != 3 * len(cases):
        raise ProtocolError("incorrect base-square execution counts")
    results = []
    completed = False
    for line in output.splitlines():
        if "HECO_" not in line:
            continue
        match = re.search(r"(?:^|\] )(HECO_.*)$", line)
        if match is None or completed:
            raise ProtocolError("malformed or trailing economy marker")
        parts = match[1].split("|")
        if parts[0] == "HECO_DONE":
            if parts != ["HECO_DONE", str(len(cases))] or len(results) != len(cases):
                raise ProtocolError("incomplete economy results")
            completed = True
        elif parts[0] == "HECO_RESULT":
            if (len(parts) != 5 or len(results) >= len(cases) or parts[1] != cases[len(results)]["id"]
                    or any(re.fullmatch(r"-?(?:0|[1-9][0-9]*)", value) is None for value in parts[2:])):
                raise ProtocolError("missing, duplicate, reordered or malformed economy result")
            results.append({"id": parts[1], "status": "ok", "output": dict(zip(
                ("NUTRIENTS", "MINERALS", "ENERGY"), map(int, parts[2:])))})
        else:
            raise ProtocolError("unknown economy marker")
    if not completed:
        raise ProtocolError("missing economy completion marker")
    return results


def runtime_hashes(runtime):
    if not runtime.is_file() or not runtime.with_suffix(".wasm").is_file():
        raise ProtocolError("build the FastDebug WASM runtime before economy replay")
    return {"runtime_js_sha256": hashlib.sha256(runtime.read_bytes()).hexdigest(),
            "runtime_sha256": hashlib.sha256(runtime.with_suffix(".wasm").read_bytes()).hexdigest()}


def replay(cases, runtime=DEFAULT_RUNTIME, jobs=2, batch_size=128, log_directory=None, *,
           algorithm=None, input_validator=None, template_path=None):
    algorithm = ALGORITHM if algorithm is None else algorithm
    input_validator = validate_input if input_validator is None else input_validator
    validate_cases({"version": 1, "cases": cases})
    if not 1 <= jobs <= 4 or not 1 <= batch_size <= 512:
        raise ProtocolError("jobs must be 1..4 and batch size 1..512")
    supported = [case for case in cases if case["algorithm"] == algorithm]
    for case in supported:
        input_validator(case["input"])
    metadata = {"name": "glsmac-headless-economy", "kind": "candidate", "target": "wasm-gse",
                "rendering": False, "assets_required": False,
                "mocked": ["tile-manager registration", "tile", "base", "player"],
                "executed": ["production resources.configure get_tile_resources handler"]}
    observed = []
    if supported:
        runtime = Path(runtime).resolve()
        hashes = runtime_hashes(runtime)
        snapshot = fast.create_snapshot()
        template = Path(template_path or DIRECTORY / "_headless.gls.js").read_text(encoding="utf-8")
        metadata.update(hashes, scripts_sha256=hashlib.sha256((canonical(snapshot) + template).encode()).hexdigest())
        batches = [supported[index:index + batch_size] for index in range(0, len(supported), batch_size)]
        log_directory = Path(log_directory) if log_directory else DIRECTORY.parent / ".build/economy"
        log_directory.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="glsmac-headless-economy-") as temporary:
            def run_batch(item):
                index, batch = item
                script = "GLSMAC_data/tests/headless_economy_probe.gls.js"
                inputs = [dict(case["input"], id=case["id"]) for case in batch]
                batch_snapshot = dict(snapshot)
                batch_snapshot[script] = "const headless_inputs = " + gse_literal(inputs) + ";\n" + template
                path = Path(temporary) / f"scripts-{index}.json"
                path.write_text(canonical(batch_snapshot), encoding="utf-8")
                request = {"runtime": str(runtime), "snapshot": str(path), "script": script,
                           "prefix": str(Path(temporary) / f"worker-{index}")}
                descriptor, filename = tempfile.mkstemp(prefix=f"headless-{index}-", suffix=".log", dir=log_directory)
                os.close(descriptor)
                try:
                    process = subprocess.run(["node", str(DIRECTORY.parent / "gse-worker.cjs")],
                                             input=canonical(request), text=True, capture_output=True,
                                             cwd=fast.ROOT, timeout=WORKER_TIMEOUT)
                except subprocess.TimeoutExpired as error:
                    output = error.stdout or ""
                    Path(filename).write_text(output.decode(errors="replace") if isinstance(output, bytes) else output)
                    raise ProtocolError(f"economy worker timed out after {WORKER_TIMEOUT}s; inspect {filename}") from error
                Path(filename).write_text(process.stdout + process.stderr, encoding="utf-8")
                if process.returncode:
                    raise ProtocolError(f"economy worker exited {process.returncode}; inspect {filename}")
                try:
                    return parse_output(process.stdout, batch)
                except ProtocolError as error:
                    raise ProtocolError(f"{error}; inspect {filename}") from error

            with ThreadPoolExecutor(max_workers=jobs) as pool:
                observed = [row for batch in pool.map(run_batch, enumerate(batches)) for row in batch]
        if runtime_hashes(runtime) != hashes:
            raise ProtocolError("economy runtime changed during replay")
        metadata["workers"] = min(jobs, len(batches))
    iterator = iter(observed)
    results = [next(iterator) if case["algorithm"] == algorithm else {
        "id": case["id"], "status": "unsupported", "reason": "unknown headless economy contract",
    } for case in cases]
    return metadata, results


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=DEFAULT_RUNTIME)
    parser.add_argument("--jobs", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--log-directory", type=Path)
    args = parser.parse_args(argv)
    metadata, results = replay(load_request()["cases"], args.runtime, args.jobs, args.batch_size, args.log_directory)
    write_response(metadata, results)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ProtocolError, subprocess.SubprocessError) as error:
        print(f"Headless economy adapter failed: {error}", file=sys.stderr)
        sys.exit(1)
