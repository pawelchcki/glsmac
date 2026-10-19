#!/usr/bin/env python3
"""Execute shared, stateful UI cases in the real original or reproduction."""

import argparse
import hashlib
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import shlex

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, canonical, load_request, write_response
from ui.drivers import BrowserDriver, OriginalDriver, ROOT
from ui.vision import MenuVision, VisionError, normalize


ALGORITHM = "ui.menu_trace.v1"
KEYS = {"Escape", "Enter", "ArrowUp", "ArrowDown", "Home", "End"}


def adapter_fingerprint():
    digest = hashlib.sha256()
    for name in ("probe.py", "drivers.py", "vision.py", "browser.mjs"):
        digest.update(Path(__file__).with_name(name).read_bytes())
    return digest.hexdigest()


def run_parallel(request, args):
    from compare import run_probe
    workers = min(args.jobs, len(request["cases"]))
    command = shlex.join([sys.executable, str(Path(__file__).resolve()),
                          "--target", args.target, "--assets", str(args.assets.resolve()),
                          "--wine", args.wine, "--build", str(args.build.resolve()),
                          "--artifacts", str(args.artifacts.resolve()), "--timeout", str(args.timeout)])
    batches = [{"version": 1, "cases": request["cases"][index::workers]} for index in range(workers)]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        responses = list(pool.map(lambda batch: run_probe(command, batch, timeout=1800), batches))
    metadata = responses[0]["implementation"]
    if any(canonical(response["implementation"]) != canonical(metadata) for response in responses):
        raise ProtocolError("UI workers used different executable, asset, runtime or OCR metadata")
    indexed = {result["id"]: result for response in responses for result in response["results"]}
    return dict(metadata, workers=workers), [indexed[case["id"]] for case in request["cases"]]


def validate_input(data):
    if not isinstance(data, dict) or set(data) != {"actions"}:
        raise ProtocolError("UI input requires exactly an actions field")
    actions = data["actions"]
    if not isinstance(actions, list) or len(actions) > 24:
        raise ProtocolError("UI actions must be a list of at most 24 actions")
    for action in actions:
        if not isinstance(action, dict) or len(action) != 1:
            raise ProtocolError("each UI action requires exactly choose or key")
        if "choose" in action:
            label = action["choose"]
            if not isinstance(label, str) or not 1 <= len(label) <= 100 or normalize(label) != label:
                raise ProtocolError("choose requires normalized, nonempty visible text")
        elif "key" in action:
            if not isinstance(action["key"], str) or action["key"] not in KEYS:
                raise ProtocolError("unknown UI key")
        else:
            raise ProtocolError("unknown UI action")


def observe(driver, vision, path, timeout, startup=False):
    deadline = time.monotonic() + timeout
    previous = None
    last_error = "no capture"
    # Both apps animate. A screenshot immediately after input can still show
    # the old screen; require a settling interval and repeated observations.
    time.sleep(0.35)
    while time.monotonic() < deadline:
        driver.snapshot(path)
        try:
            output, controls = vision.read(path)
            if startup and (not output["entries"] or output["entries"][0] != "START GAME"):
                raise VisionError("waiting for initial main menu")
            if output == previous:
                return output, controls
            previous = output
            last_error = "menu has not stabilized"
        except VisionError as error:
            previous = None
            last_error = str(error)
        time.sleep(0.15)
    raise VisionError(f"UI observation timed out: {last_error}")


def run_case(driver, vision, case, directory, timeout):
    directory.mkdir(parents=True, exist_ok=True)
    driver.reset()
    trace = []
    actions = case["input"]["actions"]
    for step in range(len(actions) + 1):
        path = directory / f"{step:02d}.png"
        state, controls = observe(driver, vision, path, max(timeout, 60) if step == 0 else timeout,
                                  startup=step == 0)
        trace.append(state)
        # Preserve actual text, coordinates and highlights beside each image.
        path.with_suffix(".json").write_text(json.dumps({"state": state, "controls": controls}, indent=2) + "\n")
        if step == len(actions):
            return {"trace": trace, "completed": True, "failure": None}
        action = actions[step]
        if "key" in action:
            driver.key(action["key"])
        else:
            matches = [control for control in controls if control["text"] == action["choose"]]
            if len(matches) != 1:
                return {"trace": trace, "completed": False,
                        "failure": {"kind": "missing-or-ambiguous-control", "step": step,
                                    "text": action["choose"]}}
            driver.click(matches[0]["x"], matches[0]["y"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=("original", "browser"), required=True)
    parser.add_argument("--assets", type=Path, default=os.environ.get("SMAC_ASSETS_DIR"))
    parser.add_argument("--wine", default=os.environ.get("SMAC_WINE", "wine"))
    parser.add_argument("--build", type=Path, default=Path(os.environ.get("WASM_APP_DIR", ROOT / "build/wasm-release/bin")))
    parser.add_argument("--artifacts", type=Path, default=Path(__file__).resolve().parents[1] / ".build/ui")
    parser.add_argument("--timeout", type=float, default=30)
    parser.add_argument("--jobs", type=int, default=1, help="independent application processes (1..4)")
    args = parser.parse_args()
    request = load_request()
    for case in request["cases"]:
        if case["algorithm"] == ALGORITHM:
            validate_input(case["input"])
    if not args.assets or not args.assets.is_dir():
        raise ProtocolError("set SMAC_ASSETS_DIR or --assets to a local original installation")
    if not 0 < args.timeout <= 120 or not 1 <= args.jobs <= 4:
        raise ProtocolError("UI timeout must be in (0, 120] and jobs in 1..4")
    if args.jobs > 1:
        metadata, results = run_parallel(request, args)
        write_response(metadata, results)
        return
    initial_adapter = adapter_fingerprint()
    target_directory = args.artifacts.resolve() / args.target
    target_directory.mkdir(parents=True, exist_ok=True)
    artifacts = Path(tempfile.mkdtemp(prefix="run-", dir=target_directory))
    print(f"UI artifacts: {artifacts}", file=sys.stderr, flush=True)
    vision = MenuVision()
    driver = None
    try:
        if args.target == "original":
            import shutil
            wine = shutil.which(args.wine)
            if wine is None:
                raise ProtocolError("Wine is missing; set SMAC_WINE or --wine")
            driver = OriginalDriver(args.assets.resolve(), wine, artifacts)
        else:
            driver = BrowserDriver(args.assets.resolve(), args.build.resolve(), artifacts)
        results = []
        for case in request["cases"]:
            if case["algorithm"] != ALGORITHM:
                results.append({"id": case["id"], "status": "unsupported", "reason": "unknown UI contract"})
                continue
            try:
                output = run_case(driver, vision, case, artifacts / case["id"], args.timeout)
                if args.target == "original" and not output["completed"]:
                    raise VisionError("original could not execute the complete action sequence")
                results.append({"id": case["id"], "status": "ok", "output": output})
                print(f"Observed {args.target}: {case['id']}", file=sys.stderr, flush=True)
            except (VisionError, ProtocolError) as error:
                # Unsupported perception and runtime failures are errors,
                # never missing behavior inferred from an unreadable image.
                results.append({"id": case["id"], "status": "error", "reason": str(error)})
                print(f"Failed {args.target}: {case['id']}: {error}", file=sys.stderr, flush=True)
        if adapter_fingerprint() != initial_adapter:
            raise ProtocolError("UI adapter changed during the run; finish edits before recording")
        if args.target == "browser":
            for filename, field in (("GLSMAC.js", "loader_sha256"), ("GLSMAC.wasm", "runtime_sha256")):
                if hashlib.sha256((args.build.resolve() / filename).read_bytes()).hexdigest() != driver.metadata[field]:
                    raise ProtocolError("browser runtime changed during the run; finish the build before testing")
        metadata = dict(driver.metadata, observation="visible-menu-text-and-highlight",
                        ocr="tesseract", ocr_version=vision.version,
                        ocr_model_sha256=vision.model_sha256, adapter_sha256=initial_adapter,
                        viewport=[1024, 768], contract=ALGORITHM)
        write_response(metadata, results)
    finally:
        if driver:
            driver.close()
        vision.close()


if __name__ == "__main__":
    try:
        main()
    except (OSError, ProtocolError, VisionError, ImportError) as error:
        print(f"UI adapter failed: {error}", file=sys.stderr)
        sys.exit(1)
