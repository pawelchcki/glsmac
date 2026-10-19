#!/usr/bin/env python3
"""Observe the first original base's Worker/Doctor chooser in Wine/Xvfb.

The bounded fixture is a fresh Quick Start and its first size-one base at
MY 2101, with no changed research or allocation.
Only visible chooser state and
the specialist Psych bonus are outputs. No original memory/code is patched.
"""

import argparse
import hashlib
import os
from pathlib import Path
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui.drivers import OriginalDriver
from ui.probe import observe
from ui.vision import MenuVision, VisionError, consensus


ALGORITHM = "ui.citizen_job.v1"
NAVIGATION = {"ArrowUp", "ArrowDown", "Home", "End"}
CLOSE = {"confirm", "cancel", "Enter", "Escape"}


def validate_input(data):
    if not isinstance(data, dict) or set(data) != {"actions"}:
        raise ProtocolError("citizen job input requires exactly actions")
    actions = data["actions"]
    if not isinstance(actions, list) or len(actions) > 24:
        raise ProtocolError("citizen job actions must be a list of at most 24 actions")
    in_dialog = False
    for action in actions:
        if not isinstance(action, str):
            raise ProtocolError("citizen job action must be a string")
        if action == "open" and not in_dialog:
            in_dialog = True
        elif action in CLOSE and in_dialog:
            in_dialog = False
        elif action in NAVIGATION | {"WORKER", "DOCTOR"} and in_dialog:
            pass
        else:
            raise ProtocolError("unknown or misplaced citizen job action")


class JobVision:
    def __init__(self):
        from PIL import Image
        self.Image = Image
        self.vision = MenuVision()

    def text(self, image, box):
        crop = image.crop(box)
        readings = []
        for scale in (2, 4, 3):
            enlarged = crop.resize((crop.width * scale, crop.height * scale), self.Image.Resampling.NEAREST)
            # The frame's left border can be read as a leading bracket.
            readings.append(self.vision.text(enlarged).strip().lstrip("[‘").rstrip("]"))
        return consensus(readings)

    def require_text(self, image, box, expected):
        crop = image.crop(box)
        readings = [self.vision.text(crop.resize((crop.width * scale, crop.height * scale),
                                                self.Image.Resampling.NEAREST)) for scale in (2, 3, 4)]
        # Startup synchronization only: require the actual target caption in
        # two independent readings without requiring unrelated words to agree.
        if sum(expected in text for text in readings) < 2:
            raise VisionError("waiting for original startup caption")
        return True

    def job(self, image):
        image = image.convert("RGB")
        jobs = [self.text(image, (210, 387, 335, 407)), self.text(image, (210, 407, 335, 429))]
        effect = self.text(image, (740, 407, 811, 429))
        selected = []
        for y in (394, 416):
            colors = [image.getpixel((x, row)) for x in range(500, 700, 11) for row in range(y, y + 4)]
            selected.append(statistics.mean(p[0] for p in colors) > 90
                            and statistics.mean(p[2] for p in colors) > 185)
        if sum(selected) != 1:
            raise VisionError("ambiguous original citizen-job highlight")
        if jobs != ["WORKER", "DOCTOR"]:
            raise ProtocolError("original fixture exposes jobs outside the starting size-one contract")
        return {"jobs": jobs, "doctor_effect": effect, "selected": jobs[selected.index(True)]}

    def psych_bonus(self, image):
        crop = image.convert("RGB").crop((350, 480, 710, 502))
        # Isolate the green text from the dark horizontal grid. OCR reads the
        # actual bonus numeral; no rate, population type or input supplies it.
        ink = self.Image.new("L", crop.size, 255)
        ink.putdata([0 if p[1] > 100 and p[0] > 35 and p[1] > p[0] * 1.1 else 255
                     for p in crop.getdata()])
        readings = []
        for scale in (2, 3, 4):
            text = self.vision.text(ink.resize((ink.width * scale, ink.height * scale),
                                               self.Image.Resampling.NEAREST))
            match = re.search(r"\+\s*([O0-9]+) BONUS", text)
            readings.append(match.group(1).replace("O", "0") if match else "")
        return int(consensus(readings))

    def state(self, image):
        try:
            job = self.job(image)
        except VisionError:
            return {"screen": "base", "psych_bonus": self.psych_bonus(image)}
        return {"screen": "job", "job": job, "psych_bonus": self.psych_bonus(image)}

    def wait(self, driver, reader, path, timeout):
        deadline = time.monotonic() + timeout
        previous = None
        time.sleep(0.35)
        while time.monotonic() < deadline:
            driver.snapshot(path)
            try:
                result = reader(self.Image.open(path))
                if result == previous:
                    return result
                previous = result
            except (VisionError, OSError, ValueError):
                previous = None
            time.sleep(0.1)
        raise ProtocolError(f"original citizen-job observation timed out: {path}")


def enter_first_base(driver, vision, directory, timeout):
    driver.reset()
    _, controls = observe(driver, vision.vision, directory / "main.png", 60, startup=True)
    choices = [control for control in controls if control["text"] == "QUICK START"]
    if len(choices) != 1:
        raise ProtocolError("missing original QUICK START")
    driver.click(choices[0]["x"], choices[0]["y"])
    wait = lambda reader, name: vision.wait(driver, reader, directory / name, timeout)
    wait(lambda image: vision.require_text(image, (400, 567, 1010, 592), "PLANETFALL"), "planetfall.png")
    driver.click(707, 737)

    def planet_ready(image):
        try:
            vision.require_text(image, (260, 256, 765, 286), "FIRST BASE")
            return "name"
        except VisionError:
            vision.require_text(image, (5, 640, 130, 663), "COLONY POD")
            return "pod"

    if wait(planet_ready, "planet-ready.png") == "pod":
        subprocess.run(["xdotool", "key", "--clearmodifiers", "b"], env=driver.env, check=True, timeout=10)
        wait(lambda image: vision.require_text(image, (260, 256, 765, 286), "FIRST BASE"), "base-name.png")
    driver.key("Enter")
    wait(lambda image: vision.require_text(image, (40, 724, 220, 749), "TOUR"), "tour.png")
    driver.click(365, 735)
    # The actual new Scout is active in its base at MY 2101. Enter opens the
    # base without advancing the year. The world HUD can briefly retain 2100
    # during setup; wait for a settled display before inferring a turn change.
    # World-map coordinates change with the generated terrain/viewport.
    driver.key("Enter")
    return wait(vision.psych_bonus, "base.png")


def run_case(driver, vision, case, directory, timeout):
    directory.mkdir(parents=True, exist_ok=True)
    initial = enter_first_base(driver, vision, directory, timeout)
    trace = [{"screen": "base", "psych_bonus": initial}]
    for index, action in enumerate(case["input"]["actions"]):
        current = trace[-1]
        if action == "open":
            if current["screen"] != "base":
                raise ProtocolError("original citizen chooser is already open")
            driver.click(289, 652)
        else:
            if current["screen"] != "job":
                raise ProtocolError("original citizen chooser is not open")
            if action in ("WORKER", "DOCTOR"):
                row = current["job"]["jobs"].index(action)
                driver.click(287, 397 + row * 22)
            elif action in ("confirm", "cancel"):
                driver.click(359 if action == "confirm" else 660, 449)
            else:
                driver.key(action)
        trace.append(vision.wait(driver, vision.state, directory / f"{index:02d}.png", timeout))
    return {"trace": trace}


def adapter_fingerprint():
    source = b"".join(Path(__file__).with_name(name).read_bytes()
                      for name in ("citizen_job_original.py", "drivers.py", "vision.py"))
    return hashlib.sha256(source).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, default=os.environ.get("SMAC_ASSETS_DIR"))
    parser.add_argument("--wine", default=os.environ.get("SMAC_WINE", "wine"))
    parser.add_argument("--artifacts", type=Path, default=Path(__file__).resolve().parents[1] / ".build/citizen-job-original")
    parser.add_argument("--timeout", type=float, default=30)
    args = parser.parse_args()
    request = load_request()
    for case in request["cases"]:
        if case["algorithm"] != ALGORITHM:
            raise ProtocolError("unsupported citizen-job contract")
        validate_input(case["input"])
    if not args.assets or not args.assets.is_dir() or not 0 < args.timeout <= 120:
        raise ProtocolError("original citizen-job capture requires assets and a valid settling deadline")
    wine = shutil.which(args.wine)
    if wine is None:
        raise ProtocolError("Wine is missing; set SMAC_WINE or --wine")
    args.artifacts.mkdir(parents=True, exist_ok=True)
    artifacts = Path(tempfile.mkdtemp(prefix="run-", dir=args.artifacts.resolve()))
    initial_adapter = adapter_fingerprint()
    vision = JobVision()
    driver = None
    try:
        driver = OriginalDriver(args.assets.resolve(), wine, artifacts)
        results = []
        for case in request["cases"]:
            output = run_case(driver, vision, case, artifacts / case["id"], args.timeout)
            results.append({"id": case["id"], "status": "ok", "output": output})
            print(f"Captured original citizen job: {case['id']}", file=sys.stderr, flush=True)
        if adapter_fingerprint() != initial_adapter:
            raise ProtocolError("citizen-job adapter changed during capture")
        metadata = dict(driver.metadata, contract=ALGORITHM, viewport=[1024, 768],
                        observation="visible-job-text-highlight-and-specialist-psych-bonus",
                        adapter_sha256=initial_adapter,
                        ocr="tesseract", ocr_version=vision.vision.version,
                        ocr_model_sha256=vision.vision.model_sha256)
        write_response(metadata, results)
    finally:
        if driver:
            driver.close()
        vision.vision.close()


if __name__ == "__main__":
    try:
        main()
    except (ProtocolError, OSError, ValueError) as error:
        print(f"citizen job capture error: {error}", file=sys.stderr)
        sys.exit(2)
