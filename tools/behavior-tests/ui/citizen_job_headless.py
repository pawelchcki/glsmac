#!/usr/bin/env python3
"""Observe production citizen-job controls through asset-free native GSE fixtures.

This candidate adapter imports no reference adapter and reads no observations.
It receives only the public input protocol; comparison belongs to the caller.
"""

import argparse
import hashlib
import json
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


ALGORITHM = "ui.citizen_job.v1"
ACTIONS = frozenset({"open", "WORKER", "DOCTOR", "confirm", "cancel", "ArrowDown",
                     "ArrowUp", "Home", "End", "Enter", "Escape"})


def validate_input(value):
    if not isinstance(value, dict) or set(value) != {"actions"}:
        raise ProtocolError("citizen-job input requires only actions")
    actions = value["actions"]
    if not isinstance(actions, list) or not 0 <= len(actions) <= 24:
        raise ProtocolError("citizen-job actions must contain 0..24 items")
    if any(not isinstance(action, str) or action not in ACTIONS for action in actions):
        raise ProtocolError("unknown citizen-job action")
    opened = False
    for action in actions:
        if action == "open":
            if opened:
                raise ProtocolError("citizen-job open requires the base screen")
            opened = True
        else:
            if not opened:
                raise ProtocolError("citizen-job choice, navigation or close requires the job screen")
            if action in {"confirm", "cancel", "Enter", "Escape"}:
                opened = False


def gse_literal(value):
    if isinstance(value, str):
        return "'" + value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "\\r") + "'"
    if isinstance(value, list):
        return "[" + ",".join(gse_literal(item) for item in value) + "]"
    if isinstance(value, dict) and all(re.fullmatch(r"[a-z_]+", key) for key in value):
        return "{" + ",".join(key + ":" + gse_literal(item) for key, item in value.items()) + "}"
    raise ProtocolError("unsupported citizen-job GSE fixture value")


def parse_output(output, cases):
    """Parse strict rendered observations, never calculate a job's effect."""
    if not re.search(r"^All tests passed\.$", output, re.MULTILINE) or "TEST FAILED" in output:
        raise ProtocolError("citizen-job GSE execution did not complete: " + output[-2000:])
    results = []
    current = screen = None
    for line in output.splitlines():
        match = re.search(r"(?:^|\] )(CJOB_.*)$", line)
        if not match:
            continue
        parts = match[1].split("|")
        marker = parts[0]
        if marker == "CJOB_CASE":
            if len(parts) != 2 or current is not None or len(results) >= len(cases) or parts[1] != cases[len(results)]["id"]:
                raise ProtocolError("unexpected, duplicate or incomplete citizen-job case")
            current = {"id": parts[1], "status": "ok", "output": {"trace": []}}
        elif current is None:
            raise ProtocolError("citizen-job marker outside a case")
        elif marker == "CJOB_SCREEN":
            if screen is not None or len(parts) != 3 or parts[1] not in {"base", "job"} or not re.fullmatch(r"-?\d+", parts[2].strip()):
                raise ProtocolError("invalid citizen-job screen")
            screen = {"screen": parts[1], "psych_bonus": int(parts[2].strip())}
            if parts[1] == "job":
                screen["job"] = {"jobs": [], "doctor_effect": None, "selected": None}
        elif marker == "CJOB_JOB":
            if screen is None or screen["screen"] != "job" or len(parts) != 4:
                raise ProtocolError("citizen job row outside a chooser")
            job = screen["job"]
            if parts[1] != str(len(job["jobs"])) or not parts[2] or parts[2] != parts[2].upper() or parts[2] in job["jobs"] or parts[3] not in {"true", "false"}:
                raise ProtocolError("invalid rendered citizen-job row")
            job["jobs"].append(parts[2])
            if parts[3] == "true":
                if job["selected"] is not None:
                    raise ProtocolError("multiple highlighted citizen jobs")
                job["selected"] = parts[2]
        elif marker == "CJOB_EFFECT":
            if screen is None or screen["screen"] != "job" or len(parts) != 2 or not parts[1] or parts[1] != parts[1].upper() or screen["job"]["doctor_effect"] is not None:
                raise ProtocolError("invalid rendered Doctor effect")
            screen["job"]["doctor_effect"] = parts[1]
        elif marker == "CJOB_SCREEN_END":
            if len(parts) != 1 or screen is None:
                raise ProtocolError("incomplete citizen-job screen")
            if screen["screen"] == "job" and (not screen["job"]["jobs"] or screen["job"]["selected"] is None or screen["job"]["doctor_effect"] is None):
                raise ProtocolError("incomplete citizen chooser observation")
            current["output"]["trace"].append(screen)
            screen = None
        elif marker == "CJOB_DONE":
            if len(parts) != 1 or screen is not None or len(current["output"]["trace"]) != len(cases[len(results)]["input"]["actions"]) + 1:
                raise ProtocolError("incomplete citizen-job action trace")
            results.append(current)
            current = None
        elif marker == "CJOB_ERROR":
            reason = "|".join(parts[1:])
            if not reason:
                raise ProtocolError("missing citizen-job error reason")
            results.append({"id": current["id"], "status": "error", "reason": reason})
            current = screen = None
        else:
            raise ProtocolError("unknown citizen-job marker")
    if current is not None or screen is not None or [row["id"] for row in results] != [case["id"] for case in cases]:
        raise ProtocolError("missing or reordered citizen-job results")
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
        raise ProtocolError("citizen-job adapter accepts at most 32 cases per bounded worker")
    runtime = args.runtime.resolve()
    if not runtime.is_file() or not runtime.with_suffix(".wasm").is_file():
        raise ProtocolError("build the WASM runtime before citizen-job replay")
    runtime_hash = hashlib.sha256(runtime.read_bytes()).hexdigest()
    wasm_hash = hashlib.sha256(runtime.with_suffix(".wasm").read_bytes()).hexdigest()
    snapshot = create_snapshot()
    template = Path(__file__).with_name("_citizen_job_headless.gls.js").read_text(encoding="utf-8")
    script = "GLSMAC_data/tests/citizen_job_headless_probe.gls.js"
    if script in snapshot:
        raise ProtocolError("citizen-job probe would shadow an existing test")
    source_hash = hashlib.sha256((canonical(snapshot) + template).encode()).hexdigest()
    inputs = [dict(id=case["id"], actions=case["input"]["actions"]) for case in supported]
    snapshot[script] = "const citizen_job_inputs = " + gse_literal(inputs) + ";\n" + template
    with tempfile.TemporaryDirectory(prefix="glsmac-citizen-job-") as temporary:
        snapshot_path = Path(temporary) / "scripts.json"
        snapshot_path.write_text(canonical(snapshot), encoding="utf-8")
        request = {"runtime": str(runtime), "snapshot": str(snapshot_path), "script": script, "prefix": temporary}
        process = subprocess.run(["node", str(DIRECTORY.parent / "gse-worker.cjs")],
                                 input=canonical(request), text=True, capture_output=True, cwd=ROOT, timeout=60)
    if args.log is None:
        log_directory = DIRECTORY.parent / ".build/ui"
        log_directory.mkdir(parents=True, exist_ok=True)
        descriptor, filename = tempfile.mkstemp(prefix="citizen-job-", suffix=".log", dir=log_directory)
        os.close(descriptor)
        args.log = Path(filename)
    args.log.parent.mkdir(parents=True, exist_ok=True)
    args.log.write_text(process.stdout + process.stderr, encoding="utf-8")
    if process.returncode:
        raise ProtocolError(f"citizen-job worker exited {process.returncode}; inspect {args.log}")
    if runtime_hash != hashlib.sha256(runtime.read_bytes()).hexdigest() or wasm_hash != hashlib.sha256(runtime.with_suffix(".wasm").read_bytes()).hexdigest():
        raise ProtocolError("citizen-job runtime changed during replay")
    observed = iter(parse_output(process.stdout, supported))
    results = [next(observed) if case["algorithm"] == ALGORITHM else {
        "id": case["id"], "status": "unsupported", "reason": "unknown citizen-job contract",
    } for case in cases]
    write_response({"name": "glsmac-citizen-job-headless", "kind": "candidate", "target": "wasm-gse",
                    "rendering": False, "assets_required": False, "runtime_sha256": runtime_hash,
                    "wasm_sha256": wasm_hash, "scripts_sha256": source_hash,
                    "mocked": ["display/art/audio", "timer delivery", "controlled terrain yields with zero raw energy", "current local owner", "synchronous event delivery", "unrelated base panels"],
                    "executed": ["native Base/Pop and write guards", "production base intake/consumption and worker helpers", "production work/unwork validation and apply", "production base-screen/citizen/energy/chooser callbacks"]}, results)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ProtocolError, subprocess.SubprocessError) as error:
        print(f"Citizen-job candidate adapter failed: {error}", file=sys.stderr)
        sys.exit(1)
