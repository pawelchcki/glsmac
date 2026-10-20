#!/usr/bin/env python3
"""Observe original Former commands and terrain changes through real game input.

Only declared input files are changed in a private installation. The executable
and its memory are never patched. Unit, map and turn fields are read from the
pinned image with the existing process/mapping guards.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui.drivers import OriginalDriver
from ui.probe import observe
from ui.faction_setup_original_v2 import FactionVision
from ui.citizen_job_original import JobVision
from ui.faction_ratings_original import await_social, rating
from ui.faction_identity_original import opening_dialog
from ui.unit_orders_original import OrderVision, raw_key
from ui.faction_setup_native import NativeMemory
from ui.startup_inventory_original import fingerprint as setup_fingerprint
from ui.former_work_contract import ALGORITHM, validate_input, validate_output
from ui.former_work_sources import profiles, arid_map, fingerprint_profiles
from ui.vision import VisionError, consensus

DIRECTORY = Path(__file__).resolve().parent
ORDER_NAMES = {0: 'none', 2: 'hold', 4: 'farm', 6: 'mine', 8: 'forest', 9: 'road'}
KEYS = {'road': 'r', 'farm': 'f', 'mine': 'm', 'forest': 'shift+f'}


def fingerprint():
    digest = hashlib.sha256(setup_fingerprint().encode())
    for name in ('former_work_original.py', 'former_work_contract.py', 'former_work_sources.py',
                 'unit_orders_original.py', 'faction_setup_native.py'):
        digest.update((DIRECTORY / name).read_bytes())
    return digest.hexdigest()


def native(driver):
    memory = NativeMemory(driver)
    try:
        mask = memory.read(memory.address(0x009A64E8), 1)[0]
        if mask not in (2, 4, 8, 16, 32, 64, 128):
            raise ProtocolError('Former fixture requires exactly one human faction')
        faction = mask.bit_length() - 1
        count = memory.image_word(0x009A64C8)
        if count not in range(2049):
            raise ProtocolError('original vehicle count exceeds the pinned array')
        owned = []
        for index in range(count):
            row = memory.read(memory.address(0x00952828) + index * 52, 52)
            if row[14] == faction:
                x, y = struct.unpack_from('<hh', row)
                owned.append({'type': struct.unpack_from('<h', row, 10)[0], 'x': x, 'y': y,
                              'order': row[17], 'work_units': row[37], 'movement_spent': row[40], 'damage': row[16]})
        formers = [unit for unit in owned if unit['type'] == 1]
        scouts = [unit for unit in owned if unit['type'] == 2]
        if len(owned) != 2 or len(formers) != 1 or len(scouts) != 1:
            raise ProtocolError('original fixture no longer has exactly one owned Former and Scout')
        unit = formers[0]
        width, height = memory.image_word(0x00949870), memory.image_word(0x00949874)
        if (width, height) != (40, 80) or not 0 <= unit['x'] < width or not 0 <= unit['y'] < height or unit['x'] % 2 != unit['y'] % 2:
            raise ProtocolError('original Former/map coordinates do not match the declared fixture')
        tile = memory.read(memory.image_word(0x0094A30C) + (unit['y'] * (width // 2) + unit['x'] // 2) * 44, 44)
        if tile[0] >> 5 < 3 or (tile[0] >> 3) & 3 or tile[5] >> 6 or unit['damage']:
            raise ProtocolError('original Former is outside healthy flat arid land')
        if unit['order'] not in ORDER_NAMES or unit['movement_spent'] > 3 or unit['work_units'] > 128:
            raise ProtocolError('unrecognized original Former order/progress/movement')
        flags = struct.unpack_from('<I', tile, 8)[0]
        return {'turn': memory.image_word(0x009A64D4), 'order': ORDER_NAMES[unit['order']],
                'work_units': unit['work_units'], 'movement_spent': unit['movement_spent'],
                'terrain': {name: bool(flags & bit) for name, bit in
                            (('road', 0x4), ('farm', 0x8000), ('mine', 0x10), ('forest', 0x200000))},
                'x': unit['x'], 'y': unit['y'], 'base': bool(flags & 1), 'scout_order': scouts[0]['order']}
    finally:
        memory.close()


class FormerVision(OrderVision):
    def dialog_choice(self, image, expected):
        crop = image.convert('RGB').crop((273, 363, 740, 382))
        mask = self.Image.new('L', crop.size, 255)
        mask.putdata([0 if max(pixel) < 95 else 255 for pixel in crop.getdata()])
        mask = self.vision.ImageOps.expand(mask, 8, 255)
        readings = [self.vision.text(mask.resize((mask.width * scale, mask.height * scale), self.Image.Resampling.NEAREST))
                    for scale in (2, 3, 4)]
        if sum(expected in text for text in readings) < 2:
            raise VisionError('original confirmation choice was not observed')
        return True

    def map_choice(self, image):
        crop = image.convert('RGB').crop((391, 217, 510, 233))
        mask = self.Image.new('L', crop.size, 255)
        mask.putdata([0 if max(pixel) < 95 else 255 for pixel in crop.getdata()])
        mask = self.vision.ImageOps.expand(mask, 8, 255)
        readings = [self.vision.text(mask.resize((mask.width * scale, mask.height * scale), self.Image.Resampling.LANCZOS)).replace(' ', '')
                    for scale in (2, 3, 4)]
        if consensus(readings) != 'ZZTERRAFORM.MP':
            raise VisionError('the actual selected map is not the declared synthetic input')
        return True

    def line_at(self, image, box):
        crop = image.convert('RGB').crop(box)
        mask = self.Image.new('L', crop.size, 255)
        mask.putdata([0 if (g > 85 and g > r * 1.2 and g > b * 1.2 or r > 100 and r > g * 1.5 and r > b * 1.5)
                      else 255 for r, g, b in crop.getdata()])
        mask = self.vision.ImageOps.expand(mask, 8, 255)
        return consensus([self.vision.text(mask.resize((mask.width * scale, mask.height * scale), self.Image.Resampling.LANCZOS))
                          for scale in (2, 3, 4)])

    def selected_former(self, image):
        if self.line_at(image, (10, 637, 135, 653)) != 'FORMERS':
            raise VisionError('the actual selected unit is not the declared Former')
        return True


def choose(driver, observer, label, path, timeout, startup=False):
    deadline = time.monotonic() + (60 if startup else timeout)
    while time.monotonic() < deadline:
        menu, controls = observe(driver, observer.vision, path, max(.1, deadline - time.monotonic()), startup=startup)
        found = [control for control in controls if control['text'] == label]
        if not found and label == 'PLAY WITH STANDARD RULES' and menu['caption'] == 'GAME RULES':
            found = [control for control in controls if control['text'] == 'PLAY WITH STANDARD RULE' and control['selected']]
        if len(found) == 1:
            driver.click(found[0]['x'], found[0]['y']); return
        time.sleep(.15)
    raise ProtocolError('missing original Former setup choice: ' + label)


def dismiss_research(driver, vision, image):
    try:
        vision.require_text(image, (175, 214, 850, 242), 'COMMUNICATIONS OFFICER')
        vision.require_text(image, (183, 435, 840, 458), 'CLOSE THE CHANNEL')
        driver.click(350, 446); time.sleep(.2); driver.key('Enter')
        return True
    except VisionError:
        pass
    for box, caption, point in (
        ((165, 256, 855, 286), 'CONFIRM RESEARCH PRIORITIES', (510, 446)),
        ((200, 329, 820, 357), 'ABOUT RESEARCH', (510, 424)),
        ((50, 178, 974, 204), 'SELECT RESEARCH GOAL', (140, 320)),
    ):
        try:
            vision.require_text(image, box, caption)
            driver.click(*point)
            return True
        except VisionError:
            pass
    return False


def settled(driver, vision, path, timeout, turn=None, prior_work=False, advance=False, replace=False):
    deadline = time.monotonic() + timeout
    previous = None
    interrupted_at = None
    retried_advance = False
    time.sleep(1.2)
    while time.monotonic() < deadline:
        driver.snapshot(path)
        image = vision.Image.open(path).convert('RGB')
        if replace:
            try:
                vision.require_text(image, (175, 255, 850, 286), 'PLANETARY ECOLOGIST')
                vision.require_text(image, (270, 290, 752, 310), 'WILL BE REPLACED')
                vision.dialog_choice(image, 'CONTINUE.')
                driver.click(350, 372); driver.click(510, 402)
                previous = None; time.sleep(.3); continue
            except VisionError:
                pass
        if advance:
            try:
                vision.require_text(image, (175, 255, 850, 286), 'OPERATIONS DIRECTOR')
                vision.require_text(image, (270, 310, 752, 330), 'END THE TURN NOW')
                vision.dialog_choice(image, 'YES,')
                driver.click(350, 372); driver.click(510, 402)
                previous = None; time.sleep(.3); continue
            except VisionError:
                pass
        if dismiss_research(driver, vision, image):
            # Dismissing a dialog can resume the pending native advance. Do
            # not immediately submit a second turn while it is resuming.
            interrupted_at = time.monotonic()
            previous = None; time.sleep(.3); continue
        current = native(driver)
        if turn is not None and current['turn'] > turn:
            raise ProtocolError('original Former fixture advanced past the requested checkpoint')
        if (advance and turn is not None and current['turn'] == turn - 1 and interrupted_at is not None
                and not retried_advance and time.monotonic() - interrupted_at >= 8):
            try:
                vision.require_text(image, (785, 572, 1013, 598), 'TURN COMPLETE')
                driver.click(890, 584); retried_advance = True
                previous = None; time.sleep(.3); continue
            except VisionError:
                pass
        ready = (turn is None or current['turn'] == turn) and (
            not prior_work or current['order'] == 'none' or current['movement_spent'] == 3)
        if ready and current == previous:
            return current
        previous = current if ready else None
        time.sleep(.2)
    raise ProtocolError('original Former work did not settle: ' + str(path))


def setup(driver, observer, vision, directory, timeout):
    driver.reset()
    choose(driver, observer, 'START GAME', directory / 'start.png', timeout, True)
    choose(driver, observer, 'LOAD MAP FILE', directory / 'map-type.png', timeout)
    vision.wait(driver, lambda image: vision.require_text(image, (365, 160, 676, 192), 'LOAD'), directory / 'file.png', timeout)
    # The private fixture directory contains only this declared synthetic map.
    vision.wait(driver, vision.map_choice, directory / 'file-name.png', timeout)
    driver.click(430, 225); time.sleep(.2); driver.click(445, 521)
    choose(driver, observer, 'CITIZEN', directory / 'difficulty.png', timeout)
    choose(driver, observer, 'PLAY WITH STANDARD RULES', directory / 'rules.png', timeout)
    observer.wait(driver, directory / 'factions.png', timeout)
    driver.click(135, 88)
    vision.wait(driver, lambda image: vision.require_text(image, (340, 135, 775, 158), 'GAIA'),
                directory / 'gaian-roster.png', timeout)
    driver.click(550, 147)
    selected = observer.wait(driver, directory / 'selected-gaian.png', timeout)
    if selected['screen'] != 'factions' or selected['selected'] != 0 or selected['random']:
        raise ProtocolError('original Gaian roster selection did not settle')
    driver.key('Enter')
    deadline = time.monotonic() + timeout
    while observer.wait(driver, directory / 'name.png', timeout)['screen'] != 'name':
        if time.monotonic() >= deadline:
            raise ProtocolError('missing original Gaian name confirmation')
        time.sleep(.2)
    driver.key('Enter')
    vision.wait(driver, lambda image: opening_dialog(observer, image), directory / 'opening.png', timeout); driver.key('Enter')
    vision.wait(driver, lambda image: vision.require_text(image, (260, 256, 765, 286), 'FIRST BASE'), directory / 'base-name.png', timeout)
    driver.key('Enter')
    await_social(driver, observer, vision, directory / 'social.png', timeout)
    for _ in range(2):
        driver.click(675, 525); time.sleep(.5); raw_key(driver, 'F7'); time.sleep(.7); driver.snapshot(directory / 'social-closed.png')
        try:
            rating(observer.vision, vision.Image.open(directory / 'social-closed.png'), 'GROWTH', 340)
        except VisionError:
            break
    raw_key(driver, 'ctrl+p')
    vision.wait(driver, lambda image: vision.require_text(image, (439, 281, 715, 303), 'PAUSE AT END'), directory / 'preferences.png', timeout)
    image = vision.Image.open(directory / 'preferences.png')
    if not vision.preference(image, 292): driver.click(428, 292)
    if vision.preference(image, 172): driver.click(428, 172)
    def configured(image):
        vision.require_text(image, (439, 281, 715, 303), 'PAUSE AT END')
        if not vision.preference(image, 292) or vision.preference(image, 172):
            raise VisionError('original pause/tutorial choices have not settled')
        return True
    vision.wait(driver, configured, directory / 'configured.png', timeout); driver.click(300, 496)
    time.sleep(.5); raw_key(driver, 'h'); time.sleep(.5); driver.click(308, 731)
    vision.wait(driver, vision.selected_former, directory / 'former-selected.png', timeout)
    initial = native(driver)
    if initial['turn'] != 1 or initial['scout_order'] != 2 or initial['order'] != 'none' or initial['movement_spent'] != 0 or not initial['base']:
        raise ProtocolError('original first-base Former fixture is not initialized')
    raw_key(driver, 'KP_Right')
    moved = settled(driver, vision, directory / 'moved.png', timeout, 1)
    if moved['x'] != (initial['x'] + 2) % 40 or moved['y'] != initial['y'] or moved['base'] or moved['movement_spent'] != 3:
        raise ProtocolError('original Former did not move to the declared adjacent non-base tile')
    driver.click(890, 584)
    ready = settled(driver, vision, directory / 'ready.png', timeout, 2)
    vision.wait(driver, vision.selected_former, directory / 'ready-former.png', timeout)
    if ready['movement_spent'] != 0 or ready['work_units'] != 0 or ready['order'] != 'none' or any(ready['terrain'].values()):
        raise ProtocolError('original Former work fixture is not fresh at MY2102')
    return ready


def run_case(driver, observer, vision, case, directory, timeout):
    directory.mkdir()
    current = setup(driver, observer, vision, directory, timeout)
    origin = current['turn']; position = current['x'], current['y']
    def output(state):
        return {key: state[key] for key in ('order', 'movement_spent', 'work_units', 'terrain')} | {'year_delta': state['turn'] - origin}
    trace = [output(current)]
    (directory / 'trace-progress.json').write_text(json.dumps({'trace': trace}, indent=2) + '\n')
    for index, action in enumerate(case['input']['actions']):
        prior = current
        if action in KEYS:
            raw_key(driver, KEYS[action])
        elif action == 'advance':
            if current['order'] == 'none' and current['movement_spent'] < 3:
                raw_key(driver, 'space'); time.sleep(.5)
            driver.click(890, 584)
        else:
            raw_key(driver, 'a')
            vision.wait(driver, lambda image: vision.require_text(image, (175, 255, 850, 286), 'OPERATIONS DIRECTOR'),
                        directory / f'{index}-cancel-dialog.png', timeout)
            vision.wait(driver, lambda image: vision.require_text(image, (180, 380, 840, 405), 'CANCEL ORDERS'),
                        directory / f'{index}-cancel-choice.png', timeout)
            driver.click(310, 392); driver.click(510, 444)
        current = settled(driver, vision, directory / f'{index:02d}-{action}.png', timeout,
                          prior['turn'] + (action == 'advance'), prior_work=action == 'advance' and prior['order'] in KEYS,
                          advance=action == 'advance', replace=action in KEYS)
        if (current['x'], current['y']) != position or current['base'] or current['scout_order'] != 2:
            raise ProtocolError('original Former work fixture was disturbed')
        trace.append(output(current))
        (directory / 'trace-progress.json').write_text(json.dumps({'trace': trace}, indent=2) + '\n')
    result = {'trace': trace}; validate_output(result, case['input']['actions'])
    (directory / 'observed.json').write_text(json.dumps(result, indent=2) + '\n')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--wine', default='wine')
    parser.add_argument('--timeout', type=float, default=45)
    parser.add_argument('--artifacts', type=Path, default=DIRECTORY.parent / '.build/former-work-original')
    args = parser.parse_args(); cases = load_request()['cases']
    for case in cases:
        if case['algorithm'] != ALGORITHM: raise ProtocolError('unknown Former work contract')
        validate_input(case['input'])
    initial = fingerprint(); bundles = profiles(args.assets)
    args.artifacts.mkdir(parents=True, exist_ok=True)
    directory = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    driver = None; observer = FactionVision(); vision = FormerVision()
    try:
        driver = OriginalDriver(args.assets, args.wine, directory)
        maps = driver.work / 'game/maps'
        for path in maps.iterdir():
            if path.is_file() and path.suffix.lower() == '.mp': path.unlink()
        (maps / 'zzterraform.MP').write_bytes(arid_map())
        rows = []
        for case in cases:
            if driver.process and driver.process.poll() is None:
                driver.process.kill(); driver.process.wait(timeout=5)
            for name, raw in bundles[case['input']['profile']].items(): (driver.work / 'game' / name).write_bytes(raw)
            result = run_case(driver, observer, vision, case, directory / case['id'], args.timeout)
            rows.append({'id': case['id'], 'status': 'ok', 'output': result})
            print('Captured original Former work: ' + case['id'], file=sys.stderr, flush=True)
        if fingerprint() != initial: raise ProtocolError('Former observer changed during capture')
        write_response(dict(driver.metadata, contract=ALGORITHM, adapter_sha256=initial,
                            source_profiles_sha256=fingerprint_profiles(bundles),
                            observation='Actual native vehicle order, road movement spent, work counter and four map improvement flags after real UI commands',
                            fixture='Synthetic flat arid 40x80 map, Gaians/Citizen/standard, UNIT1 input, held Scout, normal Former one tile east at MY2102, verified pause/tutorial preferences, displayed research defaults accepted and contact offers declined, terrain replacement and end-turn confirmations accepted',
                            units='Movement spent in thirds of a normal movement point; original work-counter units (two per observed full normal Former tick)',
                            ocr_version=vision.vision.version, ocr_model_sha256=vision.vision.model_sha256), rows)
    finally:
        if driver: driver.close()
        observer.vision.close(); vision.vision.close()


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, ProtocolError, VisionError, subprocess.SubprocessError) as error:
        print('Original Former work capture failed: ' + str(error), file=sys.stderr); sys.exit(1)
