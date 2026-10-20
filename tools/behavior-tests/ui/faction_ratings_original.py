#!/usr/bin/env python3
"""Observe initialized ratings through the real original Social Engineering UI."""
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
from ui.faction_setup_original_v2 import FactionVision
from ui.faction_setup_native import NativeMemory
from ui.faction_ratings_contract import ALGORITHM, validate_input, validate_output
from ui.faction_ratings_sources import OVERRIDES, rules_override, social_override
from ui.probe import observe
from ui.vision import VisionError, consensus

DIRECTORY = Path(__file__).resolve().parent
GROWTH = 0x0096CC44
INDUSTRY = 0x0096CC50
STRIDE = 0x20CC
NUTRIENT_RULE = 0x00949750
MINERAL_RULE = 0x00949754


def fingerprint():
    digest = hashlib.sha256()
    for name in ('faction_ratings_original.py', 'faction_ratings_contract.py', 'faction_ratings_sources.py',
                 'faction_identity_original.py', 'faction_setup_original.py', 'faction_setup_original_v2.py',
                 'faction_setup_native.py', 'faction_setup_contract.py', 'faction_setup_sources.py',
                 'drivers.py', 'size_kind_original.py', 'citizen_job_original.py', 'probe.py', 'vision.py',
                 'dimension_dialog_original.py', 'dimension_dialog_contract.py'):
        digest.update((DIRECTORY / name).read_bytes())
    return digest.hexdigest()


def rating(vision, image, label, top):
    crop = image.convert('RGB').crop((770, top, 884, top + 22))
    mask = vision.Image.new('L', crop.size, 255)
    mask.putdata([0 if pixel == (0, 0, 0) else 255 for pixel in crop.getdata()])
    mask = vision.ImageOps.expand(mask, 8, 255)
    readings = []
    for scale in (3, 4, 5):
        text = vision.text(mask.resize((mask.width * scale, mask.height * scale), vision.Image.Resampling.NEAREST))
        # Extract only a displayed decimal suffix next to the actual label.
        # Frame noise may differ; no character/dictionary substitution supplies
        # a numeral. Two independent complete readings must agree on the value.
        match = re.search(r'\b' + label + r'\b.*?([+-]?[0-9]{1,2})\s*:?\s*$', text)
        readings.append(match[1] if match else '')
    return int(consensus(readings))


def read_native(driver, displayed):
    memory = NativeMemory(driver)
    try:
        mask = memory.read(memory.address(0x009A64E8), 1)[0]
        if mask not in (2, 4, 8, 16, 32, 64, 128):
            raise ProtocolError('expected one actual human faction')
        faction = mask.bit_length() - 1
        values = {'growth': memory.image_word(GROWTH + faction * STRIDE, signed=True),
                  'industry': memory.image_word(INDUSTRY + faction * STRIDE, signed=True),
                  'nutrient_rule_factor': memory.image_word(NUTRIENT_RULE, signed=True),
                  'mineral_rule_factor': memory.image_word(MINERAL_RULE, signed=True)}
        if any(values[name] != displayed[name] for name in ('growth', 'industry')):
            raise ProtocolError('native rating fields do not match the actual named Social Engineering rows')
        validate_output(values)
        return values
    finally:
        memory.close()


def await_social(driver, observer, world, path, timeout):
    deadline = time.monotonic() + timeout
    previous, sent = None, False
    while time.monotonic() < deadline:
        driver.snapshot(path); image = world.Image.open(path).convert('RGB')
        try:
            current = {'growth': rating(observer.vision, image, 'GROWTH', 340),
                       'industry': rating(observer.vision, image, 'INDUSTRY', 406)}
            if current == previous:
                return current
            previous = current
        except VisionError:
            previous = None
            try:
                world.require_text(image, (40, 724, 220, 749), 'TOUR')
                driver.click(365, 735); sent = False
            except VisionError:
                try:
                    world.require_text(image, (200, 329, 820, 357), 'ABOUT RESEARCH')
                    driver.click(510, 424); sent = False
                except VisionError:
                    try:
                        world.require_text(image, (165, 256, 855, 286), 'CONFIRM RESEARCH PRIORITIES')
                        driver.click(510, 446); sent = False
                    except VisionError:
                        try:
                            world.require_text(image, (50, 178, 974, 204), 'SELECT RESEARCH GOAL')
                            # Explicit first visible goal; research progression
                            # and its content are outside this rating contract.
                            driver.click(140, 320); sent = False
                        except VisionError:
                            pass
            if not sent:
                subprocess.run(['xdotool', 'key', '--clearmodifiers', 'e'], env=driver.env, check=True, timeout=10)
                sent = True
        time.sleep(.15)
    raise VisionError('original initialized Social Engineering did not appear: ' + str(path))


def capture(cases, args):
    initial = fingerprint()
    originals = {}
    for name in ('alphax.txt', 'cyborg.txt'):
        matches = [path for path in args.assets.iterdir() if path.name.lower() == name and path.is_file()]
        if len(matches) != 1:
            raise ProtocolError('missing or ambiguous source: ' + name)
        originals[name] = (matches[0].name, matches[0].read_bytes())
    profiles = {'default': {name: raw for name, raw in originals.values()}}
    for profile, values in OVERRIDES.items():
        profiles[profile] = {
            originals['alphax.txt'][0]: rules_override(originals['alphax.txt'][1], values['nutrient'], values['mineral']),
            originals['cyborg.txt'][0]: social_override(originals['cyborg.txt'][1], values['growth'], values['industry']),
        }
    args.artifacts.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    observer, world, driver = FactionVision(), JobVision(), None
    try:
        driver = OriginalDriver(args.assets, args.wine, work)
        rows = []
        for case in cases:
            directory = work / case['id']; directory.mkdir()
            if driver.process and driver.process.poll() is None:
                driver.process.kill(); driver.process.wait(timeout=5)
            for filename, raw in profiles[case['input']['profile']].items():
                (driver.work / 'game' / filename).write_bytes(raw)
            driver.reset()
            for index, label in enumerate(('START GAME', 'MAKE RANDOM MAP', 'TINY PLANET', 'CITIZEN', 'PLAY WITH STANDARD RULES')):
                menu, controls = observe(driver, observer.vision, directory / f'menu-{index}.png',
                                         60 if index == 0 else args.timeout, startup=index == 0)
                matches = [control for control in controls if control['text'] == label]
                if len(matches) != 1:
                    raise ProtocolError(f'missing actual original setup choice {label}: {menu}')
                driver.click(matches[0]['x'], matches[0]['y'])
            observer.wait(driver, directory / 'factions.png', args.timeout)
            driver.click(135 if case['input']['preset'] == 'base' else 380, 88)
            driver.click(550, 147 + 19 * case['input']['slot'])
            driver.key('Enter')
            current = observer.wait(driver, directory / 'name.png', args.timeout)
            if current['screen'] != 'name':
                raise ProtocolError('original selected-faction name prompt is absent')
            driver.key('Enter')
            world.wait(driver, lambda image: opening_dialog(observer, image), directory / 'opening.png', args.timeout)
            driver.key('Enter')

            def planet_ready(image):
                try:
                    world.require_text(image, (260, 256, 765, 286), 'FIRST BASE')
                    return 'name'
                except VisionError:
                    world.require_text(image, (5, 640, 135, 663), 'COLONY POD')
                    return 'pod'

            if world.wait(driver, planet_ready, directory / 'planet-ready.png', args.timeout) == 'pod':
                subprocess.run(['xdotool', 'key', '--clearmodifiers', 'b'], env=driver.env, check=True, timeout=10)
                world.wait(driver, lambda image: world.require_text(image, (260, 256, 765, 286), 'FIRST BASE'),
                           directory / 'base-name.png', args.timeout)
            driver.key('Enter')
            displayed = await_social(driver, observer, world, directory / 'social.png', args.timeout)
            result = read_native(driver, displayed)
            time.sleep(.15)
            if read_native(driver, displayed) != result:
                raise ProtocolError('original initialized ratings changed during observation')
            (directory / 'observed.json').write_text(json.dumps(result, indent=2) + '\n')
            rows.append({'id': case['id'], 'status': 'ok', 'output': result})
            with (work / 'progress.jsonl').open('a') as stream:
                stream.write(json.dumps({'complete': len(rows), 'total': len(cases), 'case': case['id']}) + '\n')
        if fingerprint() != initial:
            raise ProtocolError('rating observer changed during capture')
        digest = hashlib.sha256()
        for name, bundle in profiles.items():
            digest.update(name.encode())
            for filename, raw in sorted(bundle.items()):
                digest.update(filename.encode() + hashlib.sha256(raw).digest())
        return dict(driver.metadata, contract=ALGORITHM, adapter_sha256=initial,
                    source_profiles_sha256=digest.hexdigest(),
                    observation='initialized human ratings cross-checked against actual named Social Engineering rows after first-base setup',
                    readonly_data={'growth': hex(GROWTH), 'industry': hex(INDUSTRY), 'stride': STRIDE,
                                   'nutrient_rule': hex(NUTRIENT_RULE), 'mineral_rule': hex(MINERAL_RULE)},
                    ocr_version=observer.vision.version, ocr_model_sha256=observer.vision.model_sha256), rows
    finally:
        if driver:
            driver.close()
        observer.vision.close(); world.vision.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--wine', default='wine')
    parser.add_argument('--timeout', type=float, default=45)
    parser.add_argument('--artifacts', type=Path, default=DIRECTORY.parent / '.build/faction-ratings-original')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported:
        validate_input(case['input'])
    metadata, rows = ({'name': 'faction-ratings-original', 'kind': 'adapter'}, [])
    if supported:
        metadata, rows = capture(supported, args)
    iterator = iter(rows)
    write_response(metadata, [next(iterator) if case['algorithm'] == ALGORITHM else
                             {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown social-rating contract'} for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, VisionError, subprocess.SubprocessError) as error:
        print(f'Original social-rating capture failed: {error}', file=sys.stderr); sys.exit(1)
