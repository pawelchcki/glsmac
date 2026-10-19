#!/usr/bin/env python3
"""Compare the menu reached by Enter/Escape from custom map dimensions.

This bounded contract observes navigation only. It does not compare dimension
values, validation limits, focus traversal, generated terrain or dialog layout.
"""

import argparse
import hashlib
import json
import re
from pathlib import Path
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fast import create_snapshot
from protocol import ProtocolError, load_request, write_response
from ui.drivers import BrowserDriver, OriginalDriver, ROOT
from ui.headless import gse_literal, parse_output
from ui.probe import observe
from ui.vision import MenuVision, VisionError


ALGORITHM = "ui.map_size_keyboard.v1"
DIRECTORY = Path(__file__).resolve().parent


def adapter_fingerprint():
    digest = hashlib.sha256()
    for name in ("size_keyboard.py", "drivers.py", "vision.py", "probe.py", "browser.mjs"):
        digest.update((DIRECTORY / name).read_bytes())
    return digest.hexdigest()


def validate_input(value):
    if (not isinstance(value, dict) or set(value) != {"route", "key"}
            or value["route"] not in ("random", "custom")
            or value["key"] not in ("Enter", "Escape")):
        raise ProtocolError("map-size keyboard input requires route random/custom and key Enter/Escape")


def parse_candidate(output, cases):
    # The normal menu parser checks ordering, highlights and complete markers.
    # A remaining popup is a genuine observed mismatch, rather than an inferred
    # next menu or an unsupported case silently omitted from the comparison.
    popup_ids = []
    retained = []
    observed_ids = []
    for line in output.splitlines():
        marker = re.search(r"(?:^|\] )((?:SIZE_POPUP|HUI_CASE)\|.*)$", line)
        if marker:
            observed_ids.append(marker[1].split("|")[1])
        if marker and marker[1].startswith("SIZE_POPUP|"):
            parts = marker[1].split("|")
            if len(parts) != 2 or parts[1] in popup_ids:
                raise ProtocolError("invalid map-size popup marker")
            popup_ids.append(parts[1])
        else:
            retained.append(line)
    if observed_ids != [case["id"] for case in cases]:
        raise ProtocolError("missing, duplicate or reordered map-size keyboard cases")
    menu_cases = [dict(case, algorithm="ui.menu_trace.v1", input={"actions": []})
                  for case in cases if case["id"] not in popup_ids]
    if set(popup_ids) - {case["id"] for case in cases}:
        raise ProtocolError("unknown map-size popup case")
    menus = {row["id"]: row for row in parse_output("\n".join(retained), menu_cases)}
    results = []
    for case in cases:
        if case["id"] in popup_ids:
            results.append({"id": case["id"], "status": "ok", "output": {"after": {"kind": "popup"}}})
        else:
            row = menus[case["id"]]
            results.append({"id": case["id"], "status": row["status"], **(
                {"output": {"after": row["output"]["trace"][0]}} if row["status"] == "ok"
                else {"reason": row["reason"]})})
    return results


def headless(cases, runtime):
    snapshot = create_snapshot()
    template = (DIRECTORY / "_headless.gls.js").read_text()
    snapshot["GLSMAC_data/tests/_headless_display.gls.js"] = (DIRECTORY / "_headless_display.gls.js").read_text()
    keyboard = (DIRECTORY / "_size_keyboard.gls.js").read_text()
    digest = hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode() + template.encode() + keyboard.encode()).hexdigest()
    runtime_hash = hashlib.sha256(runtime.with_suffix(".wasm").read_bytes()).hexdigest()
    loader_hash = hashlib.sha256(runtime.read_bytes()).hexdigest()
    script = "GLSMAC_data/tests/size_keyboard_probe.gls.js"
    snapshot[script] = ("const headless_inputs = [];\nconst size_inputs = "
                        + gse_literal([dict(case["input"], id=case["id"]) for case in cases])
                        + ";\n" + template + keyboard)
    with tempfile.TemporaryDirectory(prefix="glsmac-size-keyboard-") as temporary:
        path = Path(temporary) / "scripts.json"
        path.write_text(json.dumps(snapshot))
        request = {"runtime": str(runtime), "snapshot": str(path), "script": script, "prefix": temporary}
        process = subprocess.run(["node", str(DIRECTORY.parent / "gse-worker.cjs")],
                                 input=json.dumps(request), text=True, capture_output=True, timeout=90)
    if process.returncode:
        raise ProtocolError("map-size GSE probe failed: " + (process.stdout + process.stderr)[-3000:])
    if (hashlib.sha256(runtime.with_suffix(".wasm").read_bytes()).hexdigest() != runtime_hash
            or hashlib.sha256(runtime.read_bytes()).hexdigest() != loader_hash):
        raise ProtocolError("runtime changed during map-size keyboard replay")
    return {"name": "glsmac-map-size-keyboard", "kind": "candidate", "target": "wasm-gse",
            "rendering": False, "scripts_sha256": digest, "runtime_sha256": runtime_hash,
            "loader_sha256": loader_hash,
            "mocked": ["native display", "focused Input Enter emits input", "audio", "timer delivery"]}, parse_candidate(process.stdout, cases)


def rendered(cases, args):
    initial_adapter = adapter_fingerprint()
    args.artifacts.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix=args.target + "-", dir=args.artifacts))
    vision = MenuVision()
    driver = None
    try:
        driver = (OriginalDriver(args.assets.resolve(), args.wine, work) if args.target == "original"
                  else BrowserDriver(args.assets.resolve(), args.build.resolve(), work))
        results = []
        for case in cases:
            directory = work / case["id"]
            directory.mkdir()
            driver.reset()
            labels = ["START GAME", "MAKE RANDOM MAP" if case["input"]["route"] == "random"
                      else "CUSTOMIZE RANDOM MAP", "CUSTOM SIZE"]
            for index, label in enumerate(labels):
                state, controls = observe(driver, vision, directory / f"{index}.png",
                                          60 if index == 0 else args.timeout, startup=index == 0)
                matches = [row for row in controls if row["text"] == label]
                if len(matches) != 1:
                    raise ProtocolError(f"cannot reach custom map dimensions: {state}")
                driver.click(matches[0]["x"], matches[0]["y"])
            # This contract intentionally does not read or edit either field.
            # Allow the newly opened native dialog to receive keyboard focus.
            time.sleep(0.6)
            driver.snapshot(directory / "dialog.png")
            driver.key(case["input"]["key"])
            after, _ = observe(driver, vision, directory / "after.png", args.timeout)
            results.append({"id": case["id"], "status": "ok", "output": {"after": after}})
        if adapter_fingerprint() != initial_adapter:
            raise ProtocolError("map-size adapter changed during observation")
        if args.target == "browser":
            for filename, field in (("GLSMAC.js", "loader_sha256"), ("GLSMAC.wasm", "runtime_sha256")):
                if hashlib.sha256((args.build / filename).read_bytes()).hexdigest() != driver.metadata[field]:
                    raise ProtocolError("browser runtime changed during observation")
        return dict(driver.metadata, contract=ALGORITHM, adapter_sha256=initial_adapter,
                    observation="visible final menu text and highlight after custom dimension keyboard action",
                    ocr_version=vision.version, ocr_model_sha256=vision.model_sha256), results
    finally:
        if driver:
            driver.close()
        vision.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=("original", "headless", "browser"), required=True)
    parser.add_argument("--assets", type=Path)
    parser.add_argument("--wine", default="wine")
    parser.add_argument("--build", type=Path, default=ROOT / "build/wasm-release/bin")
    parser.add_argument("--runtime", type=Path, default=ROOT / "build/wasm/bin/GLSMAC.js")
    parser.add_argument("--timeout", type=float, default=20)
    parser.add_argument("--artifacts", type=Path, default=DIRECTORY.parent / ".build/ui/size-keyboard")
    args = parser.parse_args()
    cases = load_request()["cases"]
    supported = [case for case in cases if case["algorithm"] == ALGORITHM]
    for case in supported:
        validate_input(case["input"])
    if not 0 < args.timeout <= 120:
        raise ProtocolError("invalid map-size observation timeout")
    if supported and args.target != "headless" and (not args.assets or not args.assets.is_dir()):
        raise ProtocolError("rendered map-size probe requires original assets")
    metadata, results = ({"name": "map-size-keyboard", "kind": "adapter"}, [])
    if supported:
        metadata, results = (headless(supported, args.runtime.resolve()) if args.target == "headless"
                             else rendered(supported, args))
    observed = iter(results)
    write_response(metadata, [next(observed) if case["algorithm"] == ALGORITHM else {
        "id": case["id"], "status": "unsupported", "reason": "unknown map-size keyboard contract"
    } for case in cases])


if __name__ == "__main__":
    try:
        main()
    except (OSError, ProtocolError, VisionError, subprocess.SubprocessError) as error:
        print(f"Map-size keyboard probe failed: {error}", file=sys.stderr)
        sys.exit(1)
