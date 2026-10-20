#!/usr/bin/env python3
"""Read-only original road-network capture using actual menu, move and turn input."""
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
from ui.faction_setup_original_v2 import FactionVision
from ui.faction_setup_native import NativeMemory
from ui.faction_ratings_original import await_social, rating
from ui.faction_identity_original import opening_dialog
from ui.former_work_original import (FormerVision, choose, raw_key, dismiss_research, ORDER_NAMES,
                                     fingerprint as work_fingerprint)
from ui.former_work_sources import profiles, fingerprint_profiles
from ui.road_network_contract import ALGORITHM, PROFILES, validate_input, validate_output
from ui.generate_road_network import map_input
from ui.vision import VisionError
DIRECTORY = Path(__file__).resolve().parent


def fingerprint():
    digest = hashlib.sha256(work_fingerprint().encode())
    for name in ('road_network_original.py', 'road_network_contract.py', 'generate_road_network.py'):
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
        if tile[0] >> 5 < 3 or (tile[0] >> 3) & 3 > 2 or tile[5] >> 6 > 2 or unit['damage']:
            raise ProtocolError('original road-network Former is outside healthy valid land')
        if unit['order'] not in ORDER_NAMES or unit['movement_spent'] > 3 or unit['work_units'] > 128:
            raise ProtocolError('unrecognized original Former order/progress/movement')
        flags = struct.unpack_from('<I', tile, 8)[0]
        return {'turn': memory.image_word(0x009A64D4), 'order': ORDER_NAMES[unit['order']],
                'work_units': unit['work_units'], 'movement_spent': unit['movement_spent'],
                'terrain': {name: bool(flags & bit) for name, bit in
                            (('road', 0x4), ('farm', 0x8000), ('mine', 0x10), ('forest', 0x200000))},
                'moisture': ((tile[0] >> 3) & 3) + 1, 'rockiness': (tile[5] >> 6) + 1,
                'fungus': bool(flags & 0x20), 'x': unit['x'], 'y': unit['y'], 'base': bool(flags & 1), 'scout_order': scouts[0]['order']}
    finally:
        memory.close()


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
    return native(driver)


def act(driver, vision, current, action, path, timeout):
    if action in ('west', 'east', 'road'):
        raw_key(driver, {'west': 'KP_Left', 'east': 'KP_Right', 'road': 'r'}[action])
    elif action == 'advance':
        if current['order'] == 'none' and current['movement_spent'] < 3:
            raw_key(driver, 'space'); time.sleep(.5)
        driver.click(890, 584)
    else:
        raise ProtocolError('Unknown road network action')
    return settled(driver, vision, path, timeout, current['turn'] + (action == 'advance'),
                   advance=action == 'advance')


def run_case(driver, observer, vision, case, directory, timeout):
    directory.mkdir()
    profile = case['input']['profile']
    (driver.work / 'game/maps/zzterraform.MP').write_bytes(map_input(profile))
    current = setup(driver, observer, vision, directory, timeout)
    if current['turn'] != 1 or current['scout_order'] != 2 or current['movement_spent'] != 0 or not current['base']:
        raise ProtocolError('Original road network first-base setup is not initialized')
    first = current['x'], current['y']
    preparation = [current]
    for index, action in enumerate(('east', 'advance', 'road', 'advance') if profile == 'base-road' else ('east', 'advance')):
        current = act(driver, vision, current, action, directory / f'prepare-{index}-{action}.png', timeout)
        preparation.append(current)
        (directory / 'preparation.json').write_text(json.dumps(preparation, indent=2) + '\n')
    if (current['x'], current['y']) != ((first[0] + 2) % 40, first[1]) or current['base']:
        raise ProtocolError('Original road network did not start east of its base')
    if current['order'] != 'none' or current['movement_spent'] != 0 or current['work_units'] != 0:
        raise ProtocolError('Original road network did not leave a fresh Former')
    origin, x, y = current['turn'], current['x'], current['y']
    def output(state):
        if state['y'] != y or state['scout_order'] != 2 or state['fungus']:
            raise ProtocolError('Original road network fixture was disturbed')
        if not state['base'] and (state['moisture'], state['rockiness'], state['terrain']['forest']) != PROFILES[profile]:
            raise ProtocolError('Original road network terrain differs from its input')
        delta = (state['x'] - x + 20) % 40 - 20
        return {'year_delta': state['turn'] - origin, 'position': delta // 2,
                'movement_spent': state['movement_spent'],
                'terrain': {key: state[key] for key in ('base', 'moisture', 'rockiness')} |
                           {key: state['terrain'][key] for key in ('road', 'forest')}}
    trace = [output(current)]
    for index, action in enumerate(case['input']['actions']):
        current = act(driver, vision, current, action, directory / f'{index:02d}-{action}.png', timeout)
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
    parser.add_argument('--artifacts', type=Path, required=True)
    args = parser.parse_args(); cases = load_request()['cases']
    for case in cases:
        if case['algorithm'] != ALGORITHM: raise ProtocolError('Unknown road network contract')
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
        for name, raw in bundles['normal'].items(): (driver.work / 'game' / name).write_bytes(raw)
        rows = []
        for case in cases:
            result = run_case(driver, observer, vision, case, directory / case['id'], args.timeout)
            rows.append({'id': case['id'], 'status': 'ok', 'output': result})
            print('Captured original road network: ' + case['id'], file=sys.stderr, flush=True)
        if fingerprint() != initial: raise ProtocolError('Road network observer changed during capture')
        digest = hashlib.sha256(fingerprint_profiles({'normal': bundles['normal']}).encode())
        for profile in sorted(PROFILES): digest.update(map_input(profile))
        write_response(dict(driver.metadata, contract=ALGORITHM, adapter_sha256=initial,
                            source_profiles_sha256=digest.hexdigest(),
                            observation='Read-only native movement spent, position, turn and current-tile base/road/forest/moisture/rockiness after real input',
                            fixture='Fresh healthy ordinary Former, held Scout, Gaians/Citizen/standard, synthetic 40x80 map, UNIT1 bonus; real initial move and turn; base profile also builds its non-base road; unchanged RULES',
                            units='Same-row tile displacement, movement spent in thirds, moisture/rockiness 1..3',
                            ocr_version=vision.vision.version, ocr_model_sha256=vision.vision.model_sha256), rows)
    finally:
        if driver: driver.close()
        observer.vision.close(); vision.vision.close()


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, ProtocolError, VisionError, subprocess.SubprocessError) as error:
        print('Original road network capture failed:', error, file=sys.stderr); sys.exit(1)
