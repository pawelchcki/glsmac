#!/usr/bin/env python3
"""Observe paused-turn starting Scout orders through the real original UI.

The fresh Quick Start's first-base setup has reached MY 2101. The actual
Preferences dialog enables Pause at end of turn and disables tutorial messages.
Only displayed order, displayed movement availability, and elapsed years are
outputs. Terrain, economy, combat, other stances and default auto-end are outside
this contract. No executable or original memory is modified.
"""

import argparse
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui.citizen_job_original import JobVision, enter_first_base
from ui.drivers import OriginalDriver
from ui.vision import VisionError, consensus


ALGORITHM = "ui.unit_orders.v1"
KEYS = {"hold": "h", "activate": "a", "skip": "space", "advance": "Return", "close_base": None}


def validate_input(data):
    if not isinstance(data, dict) or set(data) != {"actions"}:
        raise ProtocolError("unit-orders input requires exactly actions")
    actions = data["actions"]
    if (not isinstance(actions, list) or len(actions) > 12
            or any(not isinstance(action, str) or action not in KEYS for action in actions)
            or actions.count("advance") > 2):
        raise ProtocolError("unit-orders accepts 0..12 known actions and at most two advances")
    ready = False
    for action in actions:
        if action == "advance" and not ready:
            raise ProtocolError("advance requires a preceding Hold or Skip command")
        if action == "hold" or action == "skip":
            ready = True
        elif action == "activate":
            ready = False


class OrderVision(JobVision):
    def require_text(self, image, box, expected):
        # ImageMagick may encode a capture as indexed PNG. Normalize before
        # resizing: palette resizing produced different OCR for identical RGB
        # pixels and failed the real, visibly present preferences caption.
        return super().require_text(image.convert("RGB"), box, expected)

    def line(self, image, box, color):
        crop = image.convert("RGB").crop(box)
        ink = self.Image.new("L", crop.size, 255)
        if color == "cyan":
            foreground = lambda p: p[1] > 100 and p[2] > 90 and p[0] < 130
        else:
            foreground = lambda p: (p[1] > 85 and p[1] > p[0] * 1.2 and p[1] > p[2] * 1.2
                                    or p[0] > 100 and p[0] > p[1] * 1.5 and p[0] > p[2] * 1.5)
        ink.putdata([0 if foreground(pixel) else 255 for pixel in crop.getdata()])
        return consensus([self.vision.text(ink.resize((ink.width * scale, ink.height * scale),
                                                     self.Image.Resampling.LANCZOS))
                          for scale in (2, 3, 4)])

    def state(self, image):
        try:
            self.require_text(image, (280, 582, 740, 620), "ALPHA PRIME")
            year = self.line(image, (208, 456, 243, 474), "cyan")
            if not re.fullmatch(r"21[0-9]{2}", year):
                raise VisionError("unreadable original base mission year")
            return {"screen": "base", "year": int(year)}
        except VisionError:
            pass
        # Read complete actual labels, including the red ALREADY MOVED label.
        movement = self.line(image, (10, 695, 130, 709), "unit")
        order = self.line(image, (10, 709, 135, 726), "unit")
        year = self.line(image, (860, 726, 899, 742), "cyan")
        if movement not in {"MOVES: 1", "ALREADY MOVED"} or order not in {"NO ORDERS", "HOLD"}:
            raise VisionError("unexpected or incomplete starting Scout order labels")
        if not re.fullmatch(r"21[0-9]{2}", year):
            raise VisionError("unreadable original mission year")
        return {"screen": "world", "movement_label": movement, "order_label": order, "year": int(year)}

    def preference(self, image, row):
        image = image.convert("RGB")
        # Count the bright cross, not the dark unchecked cross in this skin.
        bright = sum(min(pixel) > 105 for pixel in image.crop((420, row - 7, 435, row + 8)).getdata())
        if bright == 0:
            return False
        if 30 <= bright <= 50:
            return True
        raise VisionError("ambiguous original preference checkbox")


def raw_key(driver, key):
    subprocess.run(["xdotool", "key", "--clearmodifiers", key], env=driver.env,
                   check=True, timeout=10)


def setup(driver, vision, directory, timeout):
    enter_first_base(driver, vision, directory, timeout)
    driver.click(365, 735)  # Dismiss the actual first-base tutorial.
    driver.click(650, 524)  # Close the actual base screen.
    raw_key(driver, "ctrl+p")
    vision.wait(driver, lambda image: vision.require_text(image, (439, 281, 715, 303), "PAUSE AT END"),
                directory / "preferences.png", timeout)
    image = vision.Image.open(directory / "preferences.png")
    if not vision.preference(image, 292):
        driver.click(428, 292)
    if vision.preference(image, 172):
        driver.click(428, 172)

    def configured(image):
        vision.require_text(image, (439, 281, 715, 303), "PAUSE AT END")
        if not vision.preference(image, 292) or vision.preference(image, 172):
            raise VisionError("waiting for actual paused-turn/tutorial settings")
        return True

    vision.wait(driver, configured, directory / "configured.png", timeout)
    driver.click(300, 496)
    state = vision.wait(driver, vision.state, directory / "initial.png", timeout)
    if state != {"screen": "world", "movement_label": "MOVES: 1", "order_label": "NO ORDERS", "year": 2101}:
        raise ProtocolError("original starting Scout fixture did not reach declared MY 2101 state")
    return state


def run_case(driver, vision, case, directory, timeout):
    directory.mkdir(parents=True, exist_ok=True)
    initial = setup(driver, vision, directory, timeout)
    origin_year = initial["year"]

    def output(state):
        result = {"screen": state["screen"], "year_delta": state["year"] - origin_year}
        if state["screen"] == "world":
            result.update(movement_label=state["movement_label"], order_label=state["order_label"])
        return result

    trace = [output(initial)]
    for index, action in enumerate(case["input"]["actions"]):
        if action == "close_base":
            if trace[-1]["screen"] != "base":
                raise ProtocolError("close_base requires the actual original base screen")
            driver.click(650, 524)
        else:
            raw_key(driver, KEYS[action])
        # Keep a real delivery boundary before looking for repeated stable text.
        time.sleep(0.5)
        state = vision.wait(driver, vision.state, directory / f"{index:02d}-{action}.png", timeout)
        trace.append(output(state))
    return {"trace": trace}


def adapter_fingerprint():
    return hashlib.sha256(b"".join(Path(__file__).with_name(name).read_bytes() for name in
                                  ("unit_orders_original.py", "citizen_job_original.py", "drivers.py", "vision.py"))).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, default=os.environ.get("SMAC_ASSETS_DIR"))
    parser.add_argument("--wine", default=os.environ.get("SMAC_WINE", "wine"))
    parser.add_argument("--artifacts", type=Path, required=True)
    parser.add_argument("--timeout", type=float, default=30)
    args = parser.parse_args()
    request = load_request()
    for case in request["cases"]:
        if case["algorithm"] != ALGORITHM:
            raise ProtocolError("unsupported unit-orders contract")
        validate_input(case["input"])
    if not args.assets or not args.assets.is_dir() or not 0 < args.timeout <= 120:
        raise ProtocolError("unit-orders capture requires original assets and a valid settling deadline")
    wine = shutil.which(args.wine)
    if wine is None:
        raise ProtocolError("Wine is missing")
    args.artifacts.mkdir(parents=True, exist_ok=True)
    artifacts = Path(tempfile.mkdtemp(prefix="run-", dir=args.artifacts.resolve()))
    fingerprint = adapter_fingerprint()
    vision = None
    driver = None
    try:
        driver = OriginalDriver(args.assets.resolve(), wine, artifacts)
        results = []
        for case in request["cases"]:
            # Keep the observer lifecycle independent for each fresh game case.
            if vision:
                vision.vision.close()
            vision = OrderVision()
            result = run_case(driver, vision, case, artifacts / case["id"], args.timeout)
            results.append({"id": case["id"], "status": "ok", "output": result})
            print(f"Captured original unit orders: {case['id']}", file=sys.stderr, flush=True)
        if fingerprint != adapter_fingerprint():
            raise ProtocolError("unit-orders adapter changed during capture")
        write_response(dict(driver.metadata, contract=ALGORITHM, viewport=[1024, 768],
                            fixture="Quick Start first Scout at MY 2101; pause at end enabled; tutorials disabled",
                            observation="visible-order-movement-labels-and-mission-year", adapter_sha256=fingerprint,
                            ocr="tesseract", ocr_version=vision.vision.version,
                            ocr_model_sha256=vision.vision.model_sha256), results)
    finally:
        if driver:
            driver.close()
        if vision:
            vision.vision.close()


if __name__ == "__main__":
    try:
        main()
    except (ProtocolError, OSError, ValueError) as error:
        print(f"unit-orders capture error: {error}", file=sys.stderr)
        sys.exit(2)
