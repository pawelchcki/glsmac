#!/usr/bin/env python3
"""Observe first-base units in the original Military Command Nexus.

No original code or data is patched. Names and counts come from rendered rows,
without an expected-name dictionary or character substitutions.
"""
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
from ui.citizen_job_original import JobVision
from ui.drivers import OriginalDriver
from ui.faction_identity_original import opening_dialog
from ui.faction_ratings_original import await_social, fingerprint as social_fingerprint, rating
from ui.faction_setup_original_v2 import FactionVision
from ui.probe import observe
from ui.startup_inventory_contract import ALGORITHM, validate_input, validate_output
from ui.vision import VisionError, consensus

DIRECTORY = Path(__file__).resolve().parent


def fingerprint():
    digest = hashlib.sha256(social_fingerprint().encode())
    for name in ('startup_inventory_original.py', 'startup_inventory_contract.py'):
        digest.update((DIRECTORY / name).read_bytes())
    return digest.hexdigest()


class InventoryVision(JobVision):
    def readings(self, image, box, color):
        crop = image.convert('RGB').crop(box)
        mask = self.Image.new('L', crop.size, 255)
        mask.putdata([0 if pixel == color else 255 for pixel in crop.getdata()])
        mask = self.vision.ImageOps.expand(mask, 10, 255)
        return [self.vision.text(mask.resize((mask.width * scale, mask.height * scale), method))
                for scale, method in ((2, self.Image.Resampling.NEAREST),
                                      (2, self.Image.Resampling.LANCZOS),
                                      (4, self.Image.Resampling.BICUBIC))]

    def line(self, image, box, color):
        return consensus(self.readings(image, box, color))

    def state(self, image):
        image = image.convert('RGB')
        self.require_text(image, (260, 5, 790, 31), 'SECURITY NEXUS')
        years = []
        for text in self.readings(image, (275, 582, 750, 606), (104, 140, 196)):
            match = re.search(r'\b([0-9]{4})$', text)
            years.append(match[1] if match else '')
        if consensus(years) != '2101':
            raise VisionError('original inventory is outside the first-base MY2101 checkpoint')
        # Discover occupied text bands, including unexpected extra units. Do not
        # stop after the two rows found during observer calibration.
        bands = []
        for y in range(33, 395):
            count = sum(image.getpixel((x, y)) == (88, 140, 44) for x in range(260, 518))
            if count >= 2:
                if bands and y - bands[-1][-1] <= 3:
                    bands[-1].append(y)
                else:
                    bands.append([y])
        if not bands or len(bands) > 8:
            raise VisionError('missing or overflowing original inventory rows')
        rows = []
        for band in bands:
            if not 6 <= band[-1] - band[0] <= 18:
                raise VisionError('ambiguous original inventory text band')
            top, bottom = band[0] - 4, band[-1] + 5
            name = self.line(image, (260, top, 518, bottom), (88, 140, 44))
            row = {'name': name}
            columns = {}
            for key, color in (('active', (16, 228, 0)), ('lost', (255, 0, 0))):
                xs = [x for x in range(630, 820) for y in range(top, bottom)
                      if image.getpixel((x, y)) == color]
                if not xs:
                    raise VisionError('missing actual colored inventory column: ' + key)
                columns[key] = (min(xs), max(xs))
            if columns['active'][1] >= columns['lost'][0] - 3:
                raise VisionError('overlapping actual inventory count columns')
            # Fonts can shift the fixed-width report's metrics. Discover the
            # bright Active and red Lost glyphs, then read Prod between them.
            for key, label, left, right, color in (
                    ('active', 'ACTIVE', columns['active'][0] - 2, columns['active'][1] + 3, (16, 228, 0)),
                    ('production', 'PROD', columns['active'][1] + 1, columns['lost'][0], (88, 140, 44)),
                    ('lost', 'LOST', columns['lost'][0] - 2, columns['lost'][1] + 3, (255, 0, 0))):
                text = self.line(image, (left, top, right, bottom), color)
                match = re.fullmatch(r'([0-9]{1,2})\s+' + label + r',?', text)
                if not match:
                    raise VisionError('unreadable actual inventory count: ' + text)
                row[key] = int(match[1])
            rows.append(row)
        output = {'units': sorted(rows, key=lambda row: row['name'])}
        validate_output(output)
        return output


def enter_inventory(driver, observer, world, directory, timeout):
    # Social Engineering is a previously verified initialized first-base
    # checkpoint. Its tutorial can consume the first Cancel click.
    path = directory / 'social.png'
    await_social(driver, observer, world, path, timeout)
    for _ in range(2):
        driver.click(675, 525); time.sleep(.5)
        subprocess.run(['xdotool', 'key', '--clearmodifiers', 'F7'], env=driver.env, check=True, timeout=10)
        time.sleep(.7); driver.snapshot(path)
        try:
            rating(observer.vision, world.Image.open(path), 'GROWTH', 340)
        except VisionError:
            break
    # F7 can be consumed while the tutorial closes. Select the report through
    # the actual world menu after Social Engineering has gone away.
    for x, y in ((62, 540), (25, 375), (280, 630)):
        driver.click(x, y); time.sleep(.25)
    return world.wait(driver, world.state, directory / 'inventory.png', timeout)


def capture(cases, args, source_profiles=None):
    initial = fingerprint()
    args.artifacts.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    observer, world, driver = FactionVision(), InventoryVision(), None
    try:
        driver = OriginalDriver(args.assets, args.wine, work)
        rows = []
        for case in cases:
            directory = work / case['id']; directory.mkdir()
            if source_profiles is not None:
                if driver.process and driver.process.poll() is None:
                    driver.process.kill(); driver.process.wait(timeout=5)
                for filename, raw in source_profiles[case['input']['profile']].items():
                    (driver.work / 'game' / filename).write_bytes(raw)
            driver.reset()
            for index, label in enumerate(('START GAME', 'MAKE RANDOM MAP', 'TINY PLANET', 'CITIZEN', 'PLAY WITH STANDARD RULES')):
                deadline = time.monotonic() + (60 if index == 0 else args.timeout)
                while True:
                    menu, controls = observe(driver, observer.vision, directory / f'menu-{index}.png',
                                             max(.1, deadline - time.monotonic()), startup=index == 0)
                    matches = [control for control in controls if control['text'] == label]
                    if not matches and label == 'PLAY WITH STANDARD RULES' and menu['caption'] == 'GAME RULES':
                        # This original skin clips the final S at the panel's
                        # right edge. Select its actual highlighted first row;
                        # this setup-only spelling never supplies output names.
                        matches = [control for control in controls
                                   if control['text'] == 'PLAY WITH STANDARD RULE' and control['selected']]
                    if len(matches) == 1:
                        break
                    if time.monotonic() >= deadline:
                        raise ProtocolError('missing actual original setup choice: ' + label)
                    # Sliding text can be consistently clipped in consecutive
                    # captures. Wait for the whole actual choice, not a prefix.
                    time.sleep(.15)
                driver.click(matches[0]['x'], matches[0]['y'])
            observer.wait(driver, directory / 'factions.png', args.timeout)
            driver.click(135 if case['input']['preset'] == 'base' else 380, 88)
            driver.click(550, 147 + 19 * case['input']['slot']); driver.key('Enter')
            if observer.wait(driver, directory / 'name.png', args.timeout)['screen'] != 'name':
                raise ProtocolError('selected-faction name prompt is absent')
            driver.key('Enter')
            world.wait(driver, lambda image: opening_dialog(observer, image), directory / 'opening.png', args.timeout)
            driver.key('Enter')

            def ready(image):
                try:
                    world.require_text(image, (260, 256, 765, 286), 'FIRST BASE')
                    return 'name'
                except VisionError:
                    world.require_text(image, (5, 640, 135, 663), 'COLONY POD')
                    return 'pod'

            if world.wait(driver, ready, directory / 'ready.png', args.timeout) == 'pod':
                subprocess.run(['xdotool', 'key', '--clearmodifiers', 'b'], env=driver.env, check=True, timeout=10)
                world.wait(driver, lambda image: world.require_text(image, (260, 256, 765, 286), 'FIRST BASE'),
                           directory / 'base-name.png', args.timeout)
            driver.key('Enter')
            result = enter_inventory(driver, observer, world, directory, args.timeout)
            rows.append({'id': case['id'], 'status': 'ok', 'output': result})
            (directory / 'observed.json').write_text(json.dumps(result, indent=2) + '\n')
            print('Captured original startup inventory: ' + case['id'], file=sys.stderr, flush=True)
        if fingerprint() != initial:
            raise ProtocolError('startup inventory observer changed during capture')
        return dict(driver.metadata, contract=ALGORITHM, adapter_sha256=initial,
                    observation='actual first-page Military Command Nexus names and active/production/lost counts at MY2101',
                    fixture='Tiny/Citizen/standard; selected Gaian or Consciousness; first base founded; default research accepted; no turns advanced',
                    ocr_version=world.vision.version, ocr_model_sha256=world.vision.model_sha256), rows
    finally:
        if driver:
            driver.close()
        observer.vision.close(); world.vision.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--wine', default='wine')
    parser.add_argument('--timeout', type=float, default=45)
    parser.add_argument('--artifacts', type=Path, default=DIRECTORY.parent / '.build/startup-inventory-original')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported:
        validate_input(case['input'])
    metadata, rows = ({'name': 'startup-inventory-original', 'kind': 'adapter'}, [])
    if supported:
        metadata, rows = capture(supported, args)
    iterator = iter(rows)
    write_response(metadata, [next(iterator) if case['algorithm'] == ALGORITHM else
                             {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown startup inventory contract'} for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, VisionError, subprocess.SubprocessError) as error:
        print('Original startup inventory capture failed: ' + str(error), file=sys.stderr); sys.exit(1)
