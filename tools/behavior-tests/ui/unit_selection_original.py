#!/usr/bin/env python3
"""Observe original active-unit selection through actual controls and guarded reads."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import time
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui.drivers import OriginalDriver
from ui.faction_setup_original_v2 import FactionVision
from ui.faction_setup_native import NativeMemory
from ui.former_work_original import (FormerVision, choose, raw_key, await_social, rating,
                                     opening_dialog, dismiss_research, fingerprint as work_fingerprint)
from ui.former_work_sources import arid_map
from ui.unit_selection_contract import ALGORITHM, ROLES, validate_input, validate_output
from ui.unit_selection_sources import bundle
from ui.vision import VisionError
DIRECTORY=Path(__file__).resolve().parent
TYPE_ROLE={2:'scout',1:'former',0:'colony'}
ROLE_LABEL={'scout':'SCOUT PATROL','former':'FORMERS','colony':'COLONY POD'}


def fingerprint():
    digest=hashlib.sha256(work_fingerprint().encode())
    for name in ('unit_selection_original.py','unit_selection_contract.py','unit_selection_sources.py'):
        digest.update((DIRECTORY/name).read_bytes())
    return digest.hexdigest()


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
    return settled(driver, vision, directory / 'initial.png', timeout, 1)


def native(driver):
    memory = NativeMemory(driver)
    try:
        mask = memory.read(memory.address(0x009A64E8), 1)[0]
        if mask not in (2, 4, 8, 16, 32, 64, 128):
            raise ProtocolError('Selection fixture requires exactly one human faction')
        faction = mask.bit_length() - 1
        width, height = memory.image_word(0x00949870), memory.image_word(0x00949874)
        if (width, height) != (40, 80): raise ProtocolError('Selection fixture map dimensions changed')
        count = memory.image_word(0x009A64C8)
        if not 0 <= count <= 2048: raise ProtocolError('Original selection vehicle array is unbounded')
        units = []
        for index in range(count):
            raw = memory.read(memory.address(0x00952828) + index * 52, 52)
            if raw[14] != faction: continue
            kind = struct.unpack_from('<h', raw, 10)[0]
            x, y = struct.unpack_from('<hh', raw)
            if kind not in TYPE_ROLE or raw[16] or raw[17] not in (0, 2) or raw[40] > 3 or raw[37]:
                raise ProtocolError('Unrecognized original selection unit type/health/order/progress')
            if not 0 <= x < width or not 0 <= y < height or x % 2 != y % 2:
                raise ProtocolError('Invalid original selection unit coordinates')
            tile = memory.read(memory.image_word(0x0094A30C) + (y * (width // 2) + x // 2) * 44, 44)
            if tile[0] >> 5 < 3 or (tile[0] >> 3) & 3 or tile[5] >> 6 or struct.unpack_from('<I', tile, 8)[0] & 0x20:
                raise ProtocolError('Original selection unit is outside flat arid nonfungus land')
            units.append({'index': index, 'role': TYPE_ROLE[kind], 'x': x, 'y': y,
                          'order': 'hold' if raw[17] == 2 else 'none', 'movement_spent': raw[40]})
        if len(units) != 3 or {u['role'] for u in units} != set(ROLES):
            raise ProtocolError('Selection fixture no longer has exactly its three owned units')
        # Public Console layout metadata: MapWin base 0x9156B0,
        # InVehMode +0x23BD8 and VehID +0x23BDC. These fields were checked
        # against visible unit names and actual H/Space effects. CurrentVehID
        # is a different global and must not be used for UI selection.
        mode = memory.image_word(0x00939288, signed=True)
        selected_id = memory.image_word(0x0093928C, signed=True)
        if mode not in (0, 1) or (mode == 0 and selected_id != -1):
            raise ProtocolError('Unrecognized original active-unit mode')
        selected = [u['role'] for u in units if u['index'] == selected_id]
        if mode == 1 and len(selected) != 1:
            raise ProtocolError('Original selected unit is outside the controlled owned fixture')
        return {'turn': memory.image_word(0x009A64D4), 'selected': selected[0] if mode == 1 else None,
                'units': sorted(units, key=lambda u: ROLES.index(u['role']))}
    finally:
        memory.close()


def settled(driver, vision, path, timeout, turn, advance=False):
    deadline = time.monotonic() + timeout; previous = None
    time.sleep(1.2)
    while time.monotonic() < deadline:
        driver.snapshot(path); image = vision.Image.open(path).convert('RGB')
        if advance and dismiss_research(driver, vision, image):
            previous = None; time.sleep(.3); continue
        current = native(driver)
        if current['turn'] > turn: raise ProtocolError('Original selection advanced past the checkpoint')
        if current['turn'] != turn:
            previous = None; time.sleep(.2); continue
        if current['selected'] is not None:
            try:
                label = vision.line_at(image, (10, 637, 135, 653))
                if label != ROLE_LABEL[current['selected']]: raise VisionError('Original name and active-unit identity disagree')
            except VisionError:
                previous = None; time.sleep(.2); continue
        if current == previous: return current
        previous = current; time.sleep(.2)
    raise ProtocolError('Original unit selection did not settle: ' + str(path))


def act(driver, vision, current, action, path, timeout):
    if action == 'advance':
        if any(u['order'] == 'none' and u['movement_spent'] < 3 for u in current['units']):
            raise ProtocolError('Selection advance requires all controlled units handled')
        driver.click(890, 584)
    else:
        raw_key(driver, {'wait': 'w', 'tab': 'Tab', 'hold': 'h', 'skip': 'space',
                         'southeast': 'KP_Next', 'southwest': 'KP_End'}[action])
    return settled(driver, vision, path, timeout, current['turn'] + (action == 'advance'), action == 'advance')


def prepare(driver, observer, vision, case, directory, timeout):
    current = setup(driver, observer, vision, directory, timeout)
    if current['selected'] != 'scout' or any(u['order'] != 'none' or u['movement_spent'] for u in current['units']):
        raise ProtocolError('Original three-unit start is not ready with the Scout selected')
    origin = current['units'][0]['x'], current['units'][0]['y']
    if any((u['x'], u['y']) != origin for u in current['units']):
        raise ProtocolError('Original three-unit start is not stacked')
    preparation = [current]
    def step(action):
        nonlocal current
        current = act(driver, vision, current, action, directory / f'prepare-{len(preparation)}-{action}.png', timeout)
        preparation.append(current)
        (directory / 'preparation.json').write_text(json.dumps(preparation, indent=2) + '\n')
    if case['input']['profile'] == 'spread':
        step('wait')
        if current['selected'] != 'former': raise ProtocolError('Original prep did not select its actual Former')
        step('southeast')
        for _ in range(3):
            if current['selected'] == 'colony': break
            step('wait')
        if current['selected'] != 'colony': raise ProtocolError('Original prep did not select its actual Colony Pod')
        step('southwest')
        if current['selected'] != 'scout': raise ProtocolError('Original prep did not leave its Scout ready')
        step('skip'); step('advance')
        expected = {'scout': (0, 0), 'former': (1, 1), 'colony': (-1, 1)}
        for unit in current['units']:
            actual = ((unit['x'] - origin[0] + 20) % 40 - 20, unit['y'] - origin[1])
            if actual != expected[unit['role']] or unit['movement_spent'] or unit['order'] != 'none':
                raise ProtocolError('Original spread fixture did not reach declared ready positions')
        if current['selected'] != 'scout': raise ProtocolError('Original spread turn did not select its Scout')
    return current, origin


def run_case(driver, observer, vision, case, directory, timeout):
    directory.mkdir()
    current, position = prepare(driver, observer, vision, case, directory, timeout)
    initial = current['turn']
    def output(state):
        return {'year_delta': state['turn'] - initial, 'selected': state['selected'],
                'units': [{'role': u['role'], 'x_delta': (u['x'] - position[0] + 20) % 40 - 20,
                           'y_delta': u['y'] - position[1], 'order': u['order'],
                           'movement_spent': u['movement_spent']} for u in state['units']]}
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
        if case['algorithm'] != ALGORITHM: raise ProtocolError('Unknown unit selection contract')
        validate_input(case['input'])
    initial = fingerprint(); inputs = bundle(args.assets)
    args.artifacts.mkdir(parents=True, exist_ok=True)
    directory = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    observer = FactionVision(); vision = FormerVision(); driver = None
    try:
        driver = OriginalDriver(args.assets, args.wine, directory)
        for path in (driver.work / 'game/maps').iterdir():
            if path.is_file() and path.suffix.lower() == '.mp': path.unlink()
        (driver.work / 'game/maps/zzterraform.MP').write_bytes(arid_map())
        for name, raw in inputs.items(): (driver.work / 'game' / name).write_bytes(raw)
        rows = []
        for case in cases:
            result = run_case(driver, observer, vision, case, directory / case['id'], args.timeout)
            rows.append({'id': case['id'], 'status': 'ok', 'output': result})
            print('Captured original unit selection: ' + case['id'], file=sys.stderr, flush=True)
        if fingerprint() != initial: raise ProtocolError('Unit selection observer changed during capture')
        digest = hashlib.sha256(arid_map())
        for name, raw in sorted(inputs.items()): digest.update(name.encode() + b'\0' + raw)
        write_response(dict(driver.metadata, contract=ALGORITHM, adapter_sha256=initial,
                            source_profiles_sha256=digest.hexdigest(),
                            observation='Read-only native Console active-unit mode/identity cross-checked with visible names; all three owned unit positions/orders/movement and actual turn after real keys',
                            fixture='Fresh Gaians/Citizen/standard process; synthetic 40x80 flat arid map; UNIT1 and UNIT0 bonuses; three healthy ordinary units; actual first-base setup; optional real southeast/southwest moves and turn; Scout initially selected; pause at end on, tutorials off',
                            units='Relative original map coordinate units with normalized horizontal wrap; movement spent in thirds; native turn difference',
                            ocr_version=vision.vision.version, ocr_model_sha256=vision.vision.model_sha256), rows)
    finally:
        if driver: driver.close()
        observer.vision.close(); vision.vision.close()


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, ProtocolError, VisionError, subprocess.SubprocessError) as error:
        print('Original unit selection capture failed:', error, file=sys.stderr); sys.exit(1)
