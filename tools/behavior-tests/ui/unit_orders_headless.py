#!/usr/bin/env python3
"""Observe shipped unit-order controls on native units without assets or graphics.

Candidate-only: this adapter reads inputs, never reference observations/adapters.
"""

import argparse
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]
sys.path.insert(0, str(DIRECTORY.parent))
from fast import create_snapshot
from protocol import ProtocolError, canonical, load_request, write_response

ALGORITHM = "ui.unit_orders.v1"
ACTIONS = frozenset({"hold", "activate", "skip", "advance", "close_base"})


def validate_input(value):
    if not isinstance(value, dict) or set(value) != {"actions"}:
        raise ProtocolError("unit-orders input requires only actions")
    actions = value["actions"]
    if not isinstance(actions, list) or len(actions) > 12:
        raise ProtocolError("unit-orders actions must contain 0..12 items")
    if any(not isinstance(action, str) or action not in ACTIONS for action in actions):
        raise ProtocolError("unknown unit-orders action")
    if actions.count("advance") > 2:
        raise ProtocolError("unit-orders contract permits at most two advances")
    # Screen/selection outcomes are observed at runtime, never inferred here.


def gse_literal(value):
    if isinstance(value, str):
        return "'" + value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "\\r") + "'"
    if isinstance(value, list):
        return "[" + ",".join(gse_literal(item) for item in value) + "]"
    if isinstance(value, dict) and all(re.fullmatch(r"[a-z_]+", key) for key in value):
        return "{" + ",".join(key + ":" + gse_literal(item) for key, item in value.items()) + "}"
    raise ProtocolError("unsupported unit-orders GSE fixture value")


def parse_output(output, cases):
    if not re.search(r"^All tests passed\.$", output, re.MULTILINE) or any(
            marker in output for marker in ("TEST FAILED", "Testing complete, passed:", "FATAL ERROR", "Aborted(")):
        raise ProtocolError("unit-orders GSE execution did not complete: " + output[-2000:])
    results = []
    current = state = None
    for line in output.splitlines():
        match = re.search(r"(?:^|\] )(UORD_.*)$", line)
        if not match:
            continue
        parts = match[1].split("|")
        marker = parts[0]
        if marker == "UORD_CASE":
            if len(parts) != 2 or current is not None or len(results) >= len(cases) or parts[1] != cases[len(results)]["id"]:
                raise ProtocolError("unexpected, duplicate, reordered or incomplete unit-orders case")
            current = {"id": parts[1], "status": "ok", "output": {"trace": []}}
        elif current is None:
            raise ProtocolError("unit-orders marker outside a case")
        elif marker == "UORD_STATE":
            if state is not None or len(parts) != 4 or parts[1] != str(len(current["output"]["trace"])) or parts[2] not in {"world", "base"} or not re.fullmatch(r"[0-2]", parts[3]):
                raise ProtocolError("invalid unit-orders screen, checkpoint index or native year")
            if parts[1] == "0" and parts[3] != "0":
                raise ProtocolError("initial native year delta must be zero")
            state = {"screen": parts[2], "year_delta": int(parts[3])}
        elif marker in {"UORD_MOVEMENT", "UORD_ORDER"}:
            field = "movement_label" if marker == "UORD_MOVEMENT" else "order_label"
            if state is None or state["screen"] != "world" or len(parts) != 2 or field in state or not parts[1].strip() or parts[1] != parts[1].upper():
                raise ProtocolError("missing, duplicate or invalid visible unit label")
            state[field] = " ".join(parts[1].split())
        elif marker == "UORD_STATE_END":
            if len(parts) != 1 or state is None or (state["screen"] == "world" and set(state) != {"screen", "year_delta", "movement_label", "order_label"}):
                raise ProtocolError("incomplete unit-orders checkpoint")
            current["output"]["trace"].append(state)
            state = None
        elif marker == "UORD_DONE":
            if len(parts) != 1 or state is not None or len(current["output"]["trace"]) != len(cases[len(results)]["input"]["actions"]) + 1:
                raise ProtocolError("incomplete unit-orders action trace")
            results.append(current)
            current = None
        elif marker == "UORD_ERROR":
            reason = "|".join(parts[1:])
            if not reason:
                raise ProtocolError("unit-orders error has no reason")
            results.append({"id": current["id"], "status": "error", "reason": reason})
            current = state = None
        else:
            raise ProtocolError("unknown unit-orders marker")
    if current is not None or state is not None or [row["id"] for row in results] != [case["id"] for case in cases]:
        raise ProtocolError("missing, duplicate or reordered unit-orders results")
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path,
                        default=Path(os.environ.get("WASM_HEADLESS_APP_DIR", ROOT / "build/wasm/bin")) / "GLSMAC.js")
    parser.add_argument("--log", type=Path)
    args = parser.parse_args()
    cases = load_request()["cases"]
    supported = [case for case in cases if case["algorithm"] == ALGORITHM]
    for case in supported:
        validate_input(case["input"])
    if len(supported) > 32:
        raise ProtocolError("unit-orders adapter accepts at most 32 cases per bounded worker")
    runtime = args.runtime.resolve()
    if not runtime.is_file() or not runtime.with_suffix(".wasm").is_file():
        raise ProtocolError("build the WASM runtime before unit-orders replay")
    runtime_hash = hashlib.sha256(runtime.read_bytes()).hexdigest()
    wasm_hash = hashlib.sha256(runtime.with_suffix(".wasm").read_bytes()).hexdigest()
    snapshot = create_snapshot()
    template = Path(__file__).with_name("_unit_orders_headless.gls.js").read_text(encoding="utf-8")
    script = "GLSMAC_data/tests/unit_orders_headless_probe.gls.js"
    if script in snapshot:
        raise ProtocolError("unit-orders probe would shadow an existing test")
    source_hash = hashlib.sha256((canonical(snapshot) + template).encode()).hexdigest()
    inputs = [dict(id=case["id"], actions=case["input"]["actions"]) for case in supported]
    snapshot[script] = "const unit_order_inputs = " + gse_literal(inputs) + ";\n" + template
    if args.log is None:
        directory = DIRECTORY.parent / ".build/ui"
        directory.mkdir(parents=True, exist_ok=True)
        descriptor, filename = tempfile.mkstemp(prefix="unit-orders-", suffix=".log", dir=directory)
        os.close(descriptor)
        args.log = Path(filename)
    args.log.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="glsmac-unit-orders-") as temporary:
        path = Path(temporary) / "scripts.json"
        path.write_text(canonical(snapshot), encoding="utf-8")
        request = {"runtime": str(runtime), "snapshot": str(path), "script": script, "prefix": temporary}
        try:
            process = subprocess.run(["node", str(DIRECTORY.parent / "gse-worker.cjs")],
                                     input=canonical(request), text=True, capture_output=True, cwd=ROOT, timeout=60)
        except subprocess.TimeoutExpired as error:
            text = lambda data: data.decode(errors="replace") if isinstance(data, bytes) else (data or "")
            args.log.write_text(text(error.stdout) + text(error.stderr), encoding="utf-8")
            raise ProtocolError(f"unit-orders worker timed out; inspect {args.log}") from error
    args.log.write_text(process.stdout + process.stderr, encoding="utf-8")
    if process.returncode:
        raise ProtocolError(f"unit-orders worker exited {process.returncode}; inspect {args.log}")
    if runtime_hash != hashlib.sha256(runtime.read_bytes()).hexdigest() or wasm_hash != hashlib.sha256(runtime.with_suffix(".wasm").read_bytes()).hexdigest():
        raise ProtocolError("unit-orders runtime changed during replay")
    observed = iter(parse_output(process.stdout, supported))
    results = [next(observed) if case["algorithm"] == ALGORITHM else {
        "id": case["id"], "status": "unsupported", "reason": "unknown unit-orders contract",
    } for case in cases]
    write_response({"name": "glsmac-unit-orders-headless", "kind": "candidate", "target": "wasm-gse",
                    "rendering": False, "assets_required": False, "runtime_sha256": runtime_hash,
                    "wasm_sha256": wasm_hash, "scripts_sha256": source_hash,
                    "mocked": ["display/art/audio", "morale art data", "timer/event and explicit selection-request notification delivery", "initial one-unit selection", "paused turn completion acknowledgements", "base-content population omitted (no economy/production claim)"],
                    "executed": ["native owned Scout/base and Unit manager", "production unit controls/preview and objects-list selection", "actual base popup/init/show/hide/default OK/modal callbacks", "shipped command/advance validators and apply", "native Game::AdvanceTurn and shipped unit_turn"]}, results)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ProtocolError, subprocess.SubprocessError) as error:
        print(f"Unit-orders candidate adapter failed: {error}", file=sys.stderr)
        sys.exit(1)
