#!/usr/bin/env python3
"""Replay original UI traces through actual GSE menus with no renderer or assets."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fast import create_snapshot
from protocol import ProtocolError, load_request, write_response
from ui.probe import ALGORITHM, validate_input
from ui.drivers import ROOT
from ui.original_headless import ALGORITHM as CUSTOM, validate_input as validate_custom


def run_batches(cases, args):
    from compare import run_probe
    batches = [cases[index:index + args.batch_size] for index in range(0, len(cases), args.batch_size)]
    command = shlex.join([sys.executable, str(Path(__file__).resolve()), "--runtime", str(args.runtime.resolve()),
                          "--batch-size", str(args.batch_size), "--jobs", "1"])
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        responses = list(pool.map(lambda batch: run_probe(command, {"version": 1, "cases": batch}, timeout=90), batches))
    metadata = responses[0]["implementation"]
    if any(response["implementation"] != metadata for response in responses):
        raise ProtocolError("headless workers executed different runtime/script snapshots")
    return dict(metadata, workers=min(args.jobs, len(batches))), [row for response in responses for row in response["results"]]


def gse_literal(value):
    if isinstance(value, str):
        return "'" + value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "\\r") + "'"
    if isinstance(value, list):
        return "[" + ",".join(gse_literal(item) for item in value) + "]"
    if isinstance(value, dict):
        if any(not re.fullmatch(r"[a-z_]+", key) for key in value):
            raise ProtocolError("invalid GSE fixture field")
        return "{" + ",".join(key + ":" + gse_literal(item) for key, item in value.items()) + "}"
    if type(value) is int:
        return str(value) if value >= 0 else "(0 - " + str(-value) + ")"
    raise ProtocolError("unsupported GSE fixture value")


def parse_output(output, cases):
    try:
        return _parse_output(output, cases)
    except (IndexError, KeyError, ValueError, TypeError) as error:
        raise ProtocolError("malformed headless UI observation") from error


def _parse_output(output, cases):
    if not re.search(r"^All tests passed\.$", output, re.MULTILINE):
        raise ProtocolError("GSE execution did not complete successfully: " + output[-2000:])
    results = []
    current = state = None
    algorithms = {case["id"]: case["algorithm"] for case in cases}
    for line in output.splitlines():
        match = re.search(r"(?:^|\] )(HUI_.*)$", line)
        if not match:
            continue
        parts = match[1].split("|")
        marker = parts[0]
        lengths = {"HUI_CASE": 2, "HUI_SCREEN": 2, "HUI_ENTRY": 4, "HUI_SCREEN_END": 1,
                   "HUI_MISSING": 3, "HUI_DONE": 2, "HUI_CUSTOM_MENU": 3, "HUI_CUSTOM_DONE": 4}
        if marker != "HUI_ERROR" and (marker not in lengths or len(parts) != lengths[marker]):
            raise ProtocolError("invalid headless UI marker fields")
        if marker == "HUI_CASE":
            if current is not None or parts[1] not in algorithms:
                raise ProtocolError("incomplete or unknown headless UI case")
            current = {"id": parts[1], "status": "ok", "output": {"trace": [], "completed": False, "failure": None}}
            if algorithms.get(parts[1]) == CUSTOM:
                current["output"] = {"menus": [], "status": None, "consumed": 0, "parameters": None}
        elif current is None:
            raise ProtocolError("headless UI marker outside a case")
        elif marker.startswith("HUI_CUSTOM_") != (algorithms[current["id"]] == CUSTOM) and marker != "HUI_ERROR":
            raise ProtocolError("headless UI marker belongs to another contract")
        elif marker == "HUI_SCREEN":
            if state is not None:
                raise ProtocolError("incomplete headless UI screen")
            state = {"kind": "sliding-menu", "caption": parts[1] or None, "entries": [], "selected": []}
        elif marker == "HUI_ENTRY":
            if state is None or len(parts) != 4 or int(parts[1]) != len(state["entries"]):
                raise ProtocolError("invalid headless UI entry")
            state["entries"].append(parts[3])
            if parts[2] == "true":
                state["selected"].append(parts[3])
            elif parts[2] != "false":
                raise ProtocolError("invalid headless highlight")
        elif marker == "HUI_SCREEN_END":
            if state is None or len(state["selected"]) != 1 or len(set(state["entries"])) != len(state["entries"]):
                raise ProtocolError("invalid headless UI screen completion")
            current["output"]["trace"].append(state)
            state = None
        elif marker == "HUI_MISSING":
            if current["output"]["failure"] is not None or int(parts[1]) != len(current["output"]["trace"]) - 1:
                raise ProtocolError("invalid missing-control observation")
            current["output"]["failure"] = {"kind": "missing-or-ambiguous-control", "step": int(parts[1]), "text": parts[2]}
        elif marker == "HUI_DONE":
            if state is not None or parts[1] not in ("true", "false"):
                raise ProtocolError("invalid headless case completion")
            current["output"]["completed"] = parts[1] == "true"
            count = len(current["output"]["trace"])
            actions = next(case["input"]["actions"] for case in cases if case["id"] == current["id"])
            failure = current["output"]["failure"]
            if (current["output"]["completed"] and (failure is not None or count != len(actions) + 1)
                    or not current["output"]["completed"] and (failure is None or count > len(actions)
                    or actions[failure["step"]].get("choose") != failure["text"])):
                raise ProtocolError("incomplete headless UI action trace")
            results.append(current)
            current = None
        elif marker == "HUI_ERROR":
            if len(parts) < 2 or not "|".join(parts[1:]):
                raise ProtocolError("missing headless UI error reason")
            results.append({"id": current["id"], "status": "error", "reason": "|".join(parts[1:])})
            current = state = None
        elif marker == "HUI_CUSTOM_MENU":
            if parts[1] not in ("ocean", "erosion", "life", "clouds") or int(parts[2]) not in range(3):
                raise ProtocolError("invalid custom menu observation")
            current["output"]["menus"].append({"screen": parts[1], "selected": int(parts[2])})
        elif marker == "HUI_CUSTOM_DONE":
            if parts[1] not in ("waiting", "confirmed", "canceled") or int(parts[2]) not in range(5):
                raise ProtocolError("invalid custom menu completion")
            parameters = [int(value) for value in parts[3].split(",")] if parts[3] else None
            if parameters is not None and (len(parameters) != 4 or any(value not in range(3) for value in parameters)):
                raise ProtocolError("invalid custom menu parameters")
            choices = next(case["input"]["choices"] for case in cases if case["id"] == current["id"])
            if (int(parts[2]) != len(choices) or (parts[1] == "confirmed") != (parameters is not None)
                    or not current["output"]["menus"]):
                raise ProtocolError("incomplete custom menu observation")
            current["output"].update(status=parts[1], consumed=int(parts[2]), parameters=parameters)
            results.append(current)
            current = state = None
        else:
            raise ProtocolError("unknown headless UI marker")
    if current is not None or state is not None or [row["id"] for row in results] != [case["id"] for case in cases]:
        raise ProtocolError("missing, duplicate or reordered headless UI results")
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=Path(os.environ.get("WASM_HEADLESS_APP_DIR", ROOT / "build/wasm/bin")) / "GLSMAC.js")
    parser.add_argument("--log", type=Path)
    parser.add_argument("--jobs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=12)
    args = parser.parse_args()
    cases = load_request()["cases"]
    if not 1 <= args.jobs <= 4 or not 1 <= args.batch_size <= 64:
        raise ProtocolError("jobs must be 1..4 and batch size 1..64")
    if len(cases) > args.batch_size:
        metadata, results = run_batches(cases, args)
        write_response(metadata, results)
        return
    supported = [case for case in cases if case["algorithm"] in (ALGORITHM, CUSTOM)]
    for case in supported:
        (validate_input if case["algorithm"] == ALGORITHM else validate_custom)(case["input"])
    runtime = args.runtime.resolve()
    if not runtime.is_file() or not runtime.with_suffix(".wasm").is_file():
        raise ProtocolError("build the FastDebug WASM runtime once before headless replay")
    snapshot = create_snapshot()
    snapshot["GLSMAC_data/tests/_headless_display.gls.js"] = Path(__file__).with_name("_headless_display.gls.js").read_text()
    template = Path(__file__).with_name("_headless.gls.js").read_text()
    source_hash = hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode() + template.encode()).hexdigest()
    script = "GLSMAC_data/tests/headless_menu_probe.gls.js"
    inputs = [dict(case["input"], id=case["id"], algorithm=case["algorithm"]) for case in supported]
    snapshot[script] = "const headless_inputs = " + gse_literal(inputs) + ";\n" + template
    with tempfile.TemporaryDirectory(prefix="glsmac-headless-ui-") as temporary:
        path = Path(temporary) / "scripts.json"
        path.write_text(json.dumps(snapshot))
        request = {"runtime": str(runtime), "snapshot": str(path), "script": script, "prefix": temporary}
        process = subprocess.run(["node", str(Path(__file__).resolve().parents[1] / "gse-worker.cjs")],
                                 input=json.dumps(request), text=True, capture_output=True, timeout=60)
    if args.log is None:
        directory = Path(__file__).resolve().parents[1] / ".build/ui"
        directory.mkdir(parents=True, exist_ok=True)
        descriptor, filename = tempfile.mkstemp(prefix="headless-", suffix=".log", dir=directory)
        os.close(descriptor)
        args.log = Path(filename)
    args.log.parent.mkdir(parents=True, exist_ok=True)
    args.log.write_text(process.stdout + process.stderr)
    if process.returncode:
        raise ProtocolError(f"headless GSE process exited {process.returncode}; inspect {args.log}")
    observed = iter(parse_output(process.stdout, supported))
    results = [next(observed) if case["algorithm"] in (ALGORITHM, CUSTOM) else {
        "id": case["id"], "status": "unsupported", "reason": "unknown headless UI contract",
    } for case in cases]
    write_response({"name": "glsmac-headless-ui", "kind": "candidate", "target": "wasm-gse",
                    "rendering": False, "assets_required": False,
                    "runtime_sha256": hashlib.sha256(runtime.with_suffix(".wasm").read_bytes()).hexdigest(),
                    "scripts_sha256": source_hash,
                    "mocked": ["display nodes", "audio", "timer delivery", "synthetic installed-text fixtures using existing candidate labels/action slots", "native services outside menu contract"],
                    "executed": ["native SMAC text parser/document binding", "production installed-data consumer for static menu labels/captions", "production menu steps", "production sliding controls", "production menu back-stack"]}, results)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ProtocolError, subprocess.SubprocessError) as error:
        print(f"Headless UI adapter failed: {error}", file=sys.stderr)
        sys.exit(1)
