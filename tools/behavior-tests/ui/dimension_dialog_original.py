#!/usr/bin/env python3
"""Observe the original custom-dimension dialog in fresh Wine/Xvfb processes.

Only visible caption, labels, untouched raw input strings and action labels are
observed. Source text overrides are test inputs, never OCR answers. Coordinates
describe a 1024x768 observation region; layout itself is outside the contract.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui.dimension_dialog_contract import (
    ALGORITHM, HORIZONTAL_LABEL, VERTICAL_LABEL, LABEL_COUNT, SOURCE_HASHES,
    TEXT_PROFILES, validate_input, validate_output,
)
from ui.drivers import OriginalDriver
from ui.probe import observe
from ui.vision import MenuVision, VisionError, consensus

DIRECTORY = Path(__file__).resolve().parent


def adapter_fingerprint():
    digest = hashlib.sha256()
    for name in ("dimension_dialog_original.py", "dimension_dialog_contract.py", "drivers.py", "probe.py", "vision.py"):
        digest.update((DIRECTORY / name).read_bytes())
    return digest.hexdigest()


def caption_source(content, caption):
    script = content.decode("latin1").splitlines(keepends=True)
    headers = [n for n, line in enumerate(script) if line.strip() == "#CUSTOMMAP"]
    if len(headers) != 1:
        raise ProtocolError("ambiguous original CUSTOMMAP")
    start = headers[0] + 1
    end = next((n for n in range(start, len(script)) if re.match(r"#[A-Z]", script[n])), len(script))
    captions = [n for n in range(start, end) if script[n].startswith("#caption ")]
    if len(captions) != 1:
        raise ProtocolError("ambiguous original dimension caption")
    script[captions[0]] = "#caption " + caption + "\r\n"
    return "".join(script).encode("latin1")


def text_files(assets, profile):
    paths = {}
    for name in SOURCE_HASHES:
        matches = [path for path in assets.iterdir() if path.is_file() and path.name.lower() == name]
        if len(matches) != 1:
            raise ProtocolError("missing or ambiguous dimension source: " + name)
        paths[name] = matches[0]
    raw = {name: path.read_bytes() for name, path in paths.items()}
    if any(hashlib.sha256(raw[name]).hexdigest() != expected for name, expected in SOURCE_HASHES.items()):
        raise ProtocolError("unsupported dimension-dialog installed-data profile")
    if profile == "default":
        return {paths[name].name: raw[name] for name in ("labels.txt", "xscript.txt", "script.txt")}
    data = TEXT_PROFILES[profile]
    labels = raw["labels.txt"].decode("latin1").splitlines(keepends=True)
    headers = [n for n, line in enumerate(labels) if line.strip() == "#LABELS"]
    if len(headers) != 1 or labels[headers[0] + 1].strip() != str(LABEL_COUNT):
        raise ProtocolError("invalid source label table")
    for index, key in ((HORIZONTAL_LABEL, "horizontal"), (VERTICAL_LABEL, "vertical")):
        labels[headers[0] + 2 + index] = data[key] + "\r\n"
    return {paths["labels.txt"].name: "".join(labels).encode("latin1"),
            paths["xscript.txt"].name: caption_source(raw["xscript.txt"], data["caption"]),
            paths["script.txt"].name: caption_source(raw["script.txt"], data["common_caption"])
                if "common_caption" in data else raw["script.txt"]}


class DialogVision:
    def __init__(self, vision):
        self.vision = vision

    @staticmethod
    def number_bounds(image, box):
        crop = image.crop(box)
        points = [(x, y) for y in range(crop.height) for x in range(crop.width)
                  if crop.getpixel((x, y)) == (100, 81, 63)]
        if not points:
            raise VisionError("native numeric value background is absent")
        return (box[0] + min(p[0] for p in points), box[1] + min(p[1] for p in points),
                box[0] + max(p[0] for p in points) + 1, box[1] + max(p[1] for p in points) + 1)

    def read_region(self, image, box, black=False):
        v = self.vision
        crop = image.crop(box)
        if crop.width <= 0 or crop.height <= 0:
            raise VisionError("invalid dimension observation region")
        mask = v.Image.new("L", crop.size, 255)
        for y in range(crop.height):
            for x in range(crop.width):
                pixel = crop.getpixel((x, y))
                glyph = pixel == (0, 0, 0) if black else pixel[0] > 80 and pixel[1] > 110 and pixel[2] > 140
                if glyph:
                    mask.putpixel((x, y), 0)
        mask = v.ImageOps.expand(mask, 8, 255)
        return consensus([v.text(mask.resize((mask.width * scale, mask.height * scale), v.Image.Resampling.NEAREST))
                          for scale in (3, 4, 5)])

    def read(self, path):
        image = self.vision.Image.open(path).convert("RGB")
        if image.size != (1024, 768):
            raise VisionError("dimension observation requires the declared 1024x768 viewport")
        rows = [(347, 663, 1007, 686), (347, 687, 1007, 711)]
        numbers = [self.number_bounds(image, row) for row in rows]
        output = {
            "caption": self.read_region(image, (340, 630, 1018, 654)),
            "labels": [self.read_region(image, (row[0], row[1], number[0] - 2, row[3]))
                       for row, number in zip(rows, numbers)],
            "values": [self.read_region(image, box, black=True) for box in numbers],
            "buttons": [self.read_region(image, box, black=True)
                        for box in ((495, 731, 524, 746), (806, 731, 880, 746))],
        }
        validate_output(output)
        return output


def capture(cases, args):
    initial = adapter_fingerprint()
    profiles = {name: text_files(args.assets, name) for name in TEXT_PROFILES}
    args.artifacts.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="capture-", dir=args.artifacts))
    vision, driver = MenuVision(), None
    try:
        observer = DialogVision(vision)
        driver = OriginalDriver(args.assets, args.wine, work)
        results = []
        for case in cases:
            directory = work / case["id"]
            directory.mkdir()
            if driver.process and driver.process.poll() is None:
                driver.process.kill()
                driver.process.wait(timeout=5)
            for name, content in profiles[case["input"]["text_profile"]].items():
                (driver.work / "game" / name).write_bytes(content)
            driver.reset()
            step = 0

            def menu(startup=False):
                nonlocal step
                output = observe(driver, vision, directory / f"{step}.png",
                                 60 if startup else args.timeout, startup=startup)
                step += 1
                return output

            def choose(label, startup=False):
                state, controls = menu(startup)
                matches = [control for control in controls if control["text"] == label]
                if len(matches) != 1:
                    raise ProtocolError(f"cannot reach dimension dialog: {label}: {state}")
                driver.click(matches[0]["x"], matches[0]["y"])

            route = "MAKE RANDOM MAP" if case["input"]["route"] == "random" else "CUSTOMIZE RANDOM MAP"
            choose("START GAME", True)
            choose(route)
            prior = case["input"]["prior_preset"]
            if prior is not None:
                _, controls = menu()
                if len(controls) != 6:
                    raise ProtocolError("unexpected original preset/action count")
                driver.click(controls[prior]["x"], controls[prior]["y"])
                menu()
                driver.key("Escape")
                if case["input"]["route"] == "random":
                    choose(route)
            choose("CUSTOM SIZE")
            time.sleep(0.35)
            previous, output = None, None
            deadline = time.monotonic() + args.timeout
            while time.monotonic() < deadline:
                path = directory / "dialog.png"
                driver.snapshot(path)
                current = observer.read(path)
                if current == previous:
                    output = current
                    break
                previous = current
                time.sleep(0.15)
            if output is None:
                raise VisionError("dimension dialog did not stabilize")
            path.with_suffix(".json").write_text(json.dumps(output, indent=2) + "\n")
            results.append({"id": case["id"], "status": "ok", "output": output})
        if adapter_fingerprint() != initial:
            raise ProtocolError("dimension observer changed during capture")
        return dict(driver.metadata, adapter_sha256=initial, contract=ALGORITHM,
                    text_profiles_sha256=hashlib.sha256(json.dumps({profile: {name: hashlib.sha256(data).hexdigest()
                        for name, data in files.items()} for profile, files in profiles.items()}, sort_keys=True).encode()).hexdigest(),
                    observation="visible untouched caption, field labels/raw strings and action labels",
                    ocr_version=vision.version, ocr_model_sha256=vision.model_sha256), results
    finally:
        if driver:
            driver.close()
        vision.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path)
    parser.add_argument("--wine", default="wine")
    parser.add_argument("--timeout", type=float, default=12)
    parser.add_argument("--artifacts", type=Path, default=DIRECTORY.parent / ".build/dimension-dialog-original")
    args = parser.parse_args()
    cases = load_request()["cases"]
    supported = [case for case in cases if case["algorithm"] == ALGORITHM]
    for case in supported:
        validate_input(case["input"])
    if not 0 < args.timeout <= 120:
        raise ProtocolError("invalid dimension observation timeout")
    metadata, rows = {"name": "dimension-dialog-original", "kind": "adapter"}, []
    if supported:
        if not args.assets or not args.assets.is_dir():
            raise ProtocolError("dimension recording requires installed original assets")
        args.assets = args.assets.resolve()
        args.wine = shutil.which(args.wine) or args.wine
        if not Path(args.wine).is_file():
            raise ProtocolError("Wine is unavailable")
        metadata, rows = capture(supported, args)
    observed = iter(rows)
    write_response(metadata, [next(observed) if case["algorithm"] == ALGORITHM else {
        "id": case["id"], "status": "unsupported", "reason": "unknown dimension-dialog contract"
    } for case in cases])


if __name__ == "__main__":
    try:
        main()
    except (OSError, ProtocolError, VisionError, subprocess.SubprocessError) as error:
        print(f"Dimension dialog capture failed: {error}", file=sys.stderr)
        sys.exit(1)
