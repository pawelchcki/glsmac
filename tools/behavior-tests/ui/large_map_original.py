#!/usr/bin/env python3
"""Observe edited inputs and original warning controls in an isolated installation."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui.dimension_dialog_original import DialogVision, text_files
from ui.drivers import OriginalDriver
from ui.large_map_contract import ALGORITHM, PROFILES, validate_input, validate_output
from ui.probe import observe
from ui.size_kind_original import read_kind
from ui.vision import MenuVision, VisionError, consensus

DIRECTORY = Path(__file__).resolve().parent
DIMENSION_ROWS = ((347, 663, 1007, 686), (347, 687, 1007, 711))
WARNING_ROWS = ((351, 681, 600, 695), (351, 702, 600, 716))
COMMON_TEXT = ('Core Notice', 'Proceed here.', 'Return here.')
EXPANSION_TEXT = ('Expansion Notice', 'Expansion go.', 'Expansion stop.')


def fingerprint():
    digest = hashlib.sha256()
    for name in ('large_map_original.py', 'large_map_contract.py', 'size_kind_original.py',
                 'dimension_dialog_original.py', 'dimension_dialog_contract.py', 'drivers.py', 'probe.py', 'vision.py'):
        digest.update((DIRECTORY / name).read_bytes())
    return digest.hexdigest()


def patch_warning(raw, values):
    lines = raw.decode('latin1').splitlines(keepends=True)
    starts = [n for n, line in enumerate(lines) if line.strip() == '#VERYLARGEMAP']
    if len(starts) != 1:
        raise ProtocolError('missing or ambiguous original VERYLARGEMAP block')
    start = starts[0]
    end = next((n for n in range(start + 1, len(lines)) if re.fullmatch(r'#[A-Z][A-Z0-9_]*', lines[n].strip())), len(lines))
    captions = [n for n in range(start + 1, end) if lines[n].startswith('#caption ')]
    body = [n for n in range(start + 1, end) if lines[n].strip() and not lines[n].startswith(('#', ';'))]
    if len(captions) != 1 or len(body) < 3 or [lines[n].strip() for n in body[-2:]] != ['Continue anyway.', 'Never mind.']:
        raise ProtocolError('unsupported original warning source structure')
    for index, value in zip((captions[0], *body[-2:]), values):
        lines[index] = ('#caption ' if index == captions[0] else '') + value + '\r\n'
    return ''.join(lines).encode('latin1')


def profiles(assets):
    original = text_files(assets, 'default')
    result = {}
    for profile in PROFILES:
        current = dict(original)
        for name, raw in original.items():
            if name.lower() == 'script.txt' and profile in ('common', 'both'):
                current[name] = patch_warning(raw, COMMON_TEXT)
            if name.lower() == 'xscript.txt' and profile in ('expansion', 'both'):
                current[name] = patch_warning(raw, EXPANSION_TEXT)
        result[profile] = current
    return result


class WarningVision:
    # Selected entries have different paint while the list has keyboard focus.
    # Both palettes were observed directly; unknown paint fails closed.
    PALETTES = {
        ((104, 140, 196), (103, 91, 181)): 0,
        ((120, 164, 212), (28, 80, 99)): 0,
        ((28, 80, 99), (120, 164, 212)): 1,
    }

    def __init__(self, vision):
        self.vision = vision
        self.dialog = DialogVision(vision)

    def read(self, image):
        if image.size != (1024, 768):
            raise VisionError('warning requires the pinned 1024x768 viewport')
        paint = tuple(image.getpixel((900, y)) for y in (685, 708))
        if paint not in self.PALETTES:
            raise VisionError('unknown warning selection paint')
        entries = [self.dialog.read_region(image, box, black=True) for box in WARNING_ROWS]
        return {'kind': 'large-map-warning', 'caption': self.dialog.read_region(image, (345, 497, 1012, 521)),
                'entries': entries, 'selected': [entries[self.PALETTES[paint]]],
                'buttons': [self.dialog.read_region(image, (650, 731, 705, 748), black=True)]}

    def edited(self, image, origins):
        # The initial brown value rectangles locate the input left edges. Edited
        # values use blue glyphs on black, sometimes retaining a blinking caret.
        # Neither the case's requested digits nor their lengths select the crop.
        return {'kind': 'dimension-dialog', 'caption': self.dialog.read_region(image, (340, 630, 1018, 654)),
                'values': [self.numeric_region(image, (origin[0] - 1, row[1], row[2], row[3]))
                           for origin, row in zip(origins, DIMENSION_ROWS)]}

    def numeric_region(self, image, box):
        vision = self.vision
        crop = image.crop(box)
        mask = vision.Image.new('L', crop.size, 255)
        for x in range(crop.width):
            ys = [y for y in range(crop.height) if crop.getpixel((x, y)) == (120, 164, 212)]
            # The pinned font's digit glyphs are 12 pixels high; its caret is a
            # contiguous 20-pixel column. Remove only the tall cursor geometry,
            # preserving every shorter glyph stroke, including the digit one.
            if len(ys) >= 18 and ys[-1] - ys[0] + 1 == len(ys):
                continue
            for y in ys:
                mask.putpixel((x, y), 0)
        mask = vision.ImageOps.expand(mask, 8, 255)
        value = consensus([vision.text(mask.resize((mask.width * scale, mask.height * scale), vision.Image.Resampling.NEAREST))
                           for scale in (3, 4, 5)])
        if not re.fullmatch('[0-9]+', value):
            raise VisionError('edited field OCR did not return numeric glyphs')
        return value


def capture(cases, args):
    source_profiles = profiles(args.assets)
    initial = fingerprint()
    args.artifacts.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    vision, driver = MenuVision(), None
    reader = WarningVision(vision)
    try:
        driver = OriginalDriver(args.assets, args.wine, work)
        results = []
        for case in cases:
            directory = work / case['id']
            directory.mkdir()
            if driver.process and driver.process.poll() is None:
                driver.process.kill()
                driver.process.wait(timeout=5)
            for name, raw in source_profiles[case['input']['text_profile']].items():
                (driver.work / 'game' / name).write_bytes(raw)
            driver.reset()
            step = 0

            def choose(label, startup=False):
                nonlocal step
                screen, controls = observe(driver, vision, directory / f'menu-{step}.png',
                                           60 if startup else args.timeout, startup=startup)
                step += 1
                found = [control for control in controls if control['text'] == label]
                if len(found) != 1:
                    raise ProtocolError(f'cannot reach original warning control {label}: {screen}')
                driver.click(found[0]['x'], found[0]['y'])

            choose('START GAME', True)
            choose('MAKE RANDOM MAP' if case['input']['route'] == 'random' else 'CUSTOMIZE RANDOM MAP')
            choose('CUSTOM SIZE')
            deadline = time.monotonic() + args.timeout
            while time.monotonic() < deadline:
                path = directory / 'initial.png'
                driver.snapshot(path)
                try:
                    image = vision.Image.open(path).convert('RGB')
                    origins = [reader.dialog.number_bounds(image, row) for row in DIMENSION_ROWS]
                    reader.dialog.read(path)
                    break
                except VisionError:
                    time.sleep(.15)
            else:
                raise VisionError('original custom-size fields did not appear')
            for origin, key in zip(origins, ('horizontal', 'vertical')):
                driver.click((origin[0] + origin[2]) // 2, (origin[1] + origin[3]) // 2)
                subprocess.run(['xdotool', 'key', '--clearmodifiers', '--repeat', '12', '--delay', '5', 'BackSpace'],
                               env=driver.env, check=True, timeout=10)
                subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '30', case['input'][key]],
                               env=driver.env, check=True, timeout=10)
            subprocess.run(['xdotool', 'key', '--clearmodifiers', 'Tab'], env=driver.env, check=True, timeout=10)

            def stable(stage, edited=False):
                previous = None
                deadline = time.monotonic() + args.timeout
                while time.monotonic() < deadline:
                    path = directory / f'{stage}.png'
                    driver.snapshot(path)
                    try:
                        image = vision.Image.open(path).convert('RGB')
                        if edited:
                            current = reader.edited(image, origins)
                        else:
                            try:
                                current = reader.read(image)
                            except VisionError:
                                current, _ = vision.read(path)
                        if current == previous:
                            return current
                        previous = current
                    except VisionError:
                        pass
                    time.sleep(.15)
                raise VisionError(f'original warning checkpoint failed to stabilize: {stage}')

            trace = [{'stage': 'edited', 'available': True, 'size_kind': read_kind(driver), 'screen': stable('edited', True)}]
            if case['input']['submit'] == 'Enter':
                origin = origins[1]
                driver.click((origin[0] + origin[2]) // 2, (origin[1] + origin[3]) // 2)
                driver.key('Enter')
            else:
                driver.click(510, 738)
            screen = stable('submit')
            trace.append({'stage': 'submit', 'available': True, 'size_kind': read_kind(driver), 'screen': screen})
            for index, action in enumerate(case['input']['actions']):
                if screen['kind'] != 'large-map-warning':
                    raise ProtocolError('case asks for a warning action outside an actual warning')
                if action in ('ClickFirst', 'ClickSecond'):
                    driver.click(500, 685 if action == 'ClickFirst' else 708)
                elif action == 'OK':
                    driver.click(675, 738)
                else:
                    driver.key(action)
                stage = f'action-{index}'
                screen = stable(stage)
                trace.append({'stage': stage, 'available': True, 'size_kind': read_kind(driver), 'screen': screen})
            output = {'trace': trace}
            validate_output(output, case)
            (directory / 'observed.json').write_text(json.dumps(output, indent=2) + '\n')
            results.append({'id': case['id'], 'status': 'ok', 'output': output})
            print('Observed original warning: ' + case['id'], file=sys.stderr, flush=True)
        if fingerprint() != initial:
            raise ProtocolError('original warning adapter changed during capture')
        profile_digest = hashlib.sha256()
        for profile, sources in source_profiles.items():
            profile_digest.update(profile.encode())
            for name, raw in sorted(sources.items()):
                profile_digest.update(name.encode() + hashlib.sha256(raw).digest())
        return dict(driver.metadata, adapter_sha256=initial, contract=ALGORITHM, text_profiles_sha256=profile_digest.hexdigest(),
                    ocr_version=vision.version, ocr_model_sha256=vision.model_sha256,
                    observation='actual edited values, warning selection, caller navigation and read-only setup kind'), results
    finally:
        if driver:
            driver.close()
        vision.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--wine', default='wine')
    parser.add_argument('--timeout', type=float, default=15)
    parser.add_argument('--artifacts', type=Path, default=DIRECTORY.parent / '.build/large-map-original')
    args = parser.parse_args()
    cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported:
        validate_input(case['input'])
    if not 0 < args.timeout <= 120:
        raise ProtocolError('invalid warning observation deadline')
    metadata, rows = ({'name': 'large-map-original', 'kind': 'adapter'}, [])
    if supported:
        metadata, rows = capture(supported, args)
    iterator = iter(rows)
    write_response(metadata, [next(iterator) if case['algorithm'] == ALGORITHM else
                             {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown warning contract'} for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, VisionError, subprocess.SubprocessError) as error:
        print(f'Original warning observation failed: {error}', file=sys.stderr)
        sys.exit(1)
