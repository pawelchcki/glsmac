#!/usr/bin/env python3
"""Replay visible custom-dimension controls using production GSE, without pixels."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fast import create_snapshot
from protocol import ProtocolError, load_request, write_response
from ui.dimension_dialog_contract import ALGORITHM, WORLD_DIMENSIONS, parse_candidate, validate_input
from ui.drivers import ROOT
from ui.headless import gse_literal

DIRECTORY = Path(__file__).resolve().parent


def headless(cases, runtime):
    snapshot = create_snapshot()
    snapshot["GLSMAC_data/tests/_headless_display.gls.js"] = (DIRECTORY / "_headless_display.gls.js").read_text()
    template = (DIRECTORY / "_headless.gls.js").read_text()
    probe = (DIRECTORY / "_dimension_dialog.gls.js").read_text()
    inputs = [dict(case["input"], id=case["id"], prior_preset=(case["input"]["prior_preset"]
                  if case["input"]["prior_preset"] is not None else -1)) for case in cases]
    script = "GLSMAC_data/tests/dimension_dialog_probe.gls.js"
    snapshot[script] = ("const headless_inputs = [];\nconst dimension_inputs = " + gse_literal(inputs)
                        + ";\nconst dimension_context = " + gse_literal([[width * 2, height] for width, height in WORLD_DIMENSIONS])
                        + ";\n" + template + probe)
    digest = hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest()
    loader_hash = hashlib.sha256(runtime.read_bytes()).hexdigest()
    wasm_hash = hashlib.sha256(runtime.with_suffix(".wasm").read_bytes()).hexdigest()
    with tempfile.TemporaryDirectory(prefix="glsmac-dimension-dialog-") as temporary:
        path = Path(temporary) / "scripts.json"
        path.write_text(json.dumps(snapshot))
        request = {"runtime": str(runtime), "snapshot": str(path), "script": script, "prefix": temporary}
        result = subprocess.run(["node", str(DIRECTORY.parent / "gse-worker.cjs")],
                                input=json.dumps(request), text=True, capture_output=True, timeout=90)
    if result.returncode:
        raise ProtocolError("dimension GSE worker failed: " + (result.stdout + result.stderr)[-3000:])
    if (hashlib.sha256(runtime.read_bytes()).hexdigest() != loader_hash
            or hashlib.sha256(runtime.with_suffix(".wasm").read_bytes()).hexdigest() != wasm_hash):
        raise ProtocolError("dimension runtime changed during replay")
    try:
        rows = parse_candidate(result.stdout, cases)
    except ProtocolError as error:
        raise ProtocolError(str(error) + ": " + (result.stdout + result.stderr)[-3000:]) from error
    return {"name": "glsmac-dimension-dialog", "kind": "candidate", "target": "wasm-gse", "rendering": False,
            "scripts_sha256": digest, "loader_sha256": loader_hash, "runtime_sha256": wasm_hash,
            "mocked": ["native display", "audio", "timer delivery", "matching synthetic installed text", "pre-world initialization"]}, rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=ROOT / "build/wasm/bin/GLSMAC.js")
    args = parser.parse_args()
    cases = load_request()["cases"]
    supported = [case for case in cases if case["algorithm"] == ALGORITHM]
    for case in supported:
        validate_input(case["input"])
    metadata, rows = {"name": "dimension-dialog-headless", "kind": "adapter"}, []
    if supported:
        metadata, rows = headless(supported, args.runtime.resolve())
    observed = iter(rows)
    write_response(metadata, [next(observed) if case["algorithm"] == ALGORITHM else {
        "id": case["id"], "status": "unsupported", "reason": "unknown dimension-dialog contract"
    } for case in cases])


if __name__ == "__main__":
    try:
        main()
    except (OSError, ProtocolError, subprocess.SubprocessError) as error:
        print(f"Dimension dialog replay failed: {error}", file=sys.stderr)
        sys.exit(1)
