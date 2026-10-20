#!/usr/bin/env python3
"""Record real road moves and subsequent Former work, without patching memory."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui.drivers import OriginalDriver
from ui.faction_setup_original_v2 import FactionVision
from ui.former_work_original import FormerVision, setup, settled, raw_key, KEYS, fingerprint as work_fingerprint
from ui.former_work_sources import profiles, arid_map, fingerprint_profiles
from ui.former_movement_contract import ALGORITHM, validate_input, validate_output
from ui.vision import VisionError

DIRECTORY = Path(__file__).resolve().parent


def fingerprint():
    digest = hashlib.sha256(work_fingerprint().encode())
    for name in ('former_movement_original.py', 'former_movement_contract.py'):
        digest.update((DIRECTORY / name).read_bytes())
    return digest.hexdigest()


def act(driver, vision, current, action, path, timeout):
    if action in KEYS:
        raw_key(driver, KEYS[action])
    elif action in ('west', 'east'):
        raw_key(driver, 'KP_Left' if action == 'west' else 'KP_Right')
    elif action == 'advance':
        if current['order'] == 'none' and current['movement_spent'] < 3:
            raw_key(driver, 'space'); time.sleep(.5)
        driver.click(890, 584)
    elif action == 'cancel_work':
        raw_key(driver, 'a')
        vision.wait(driver, lambda image: vision.require_text(image, (175, 255, 850, 286), 'OPERATIONS DIRECTOR'),
                    path.with_name(path.stem + '-cancel.png'), timeout)
        vision.wait(driver, lambda image: vision.require_text(image, (180, 380, 840, 405), 'CANCEL ORDERS'),
                    path.with_name(path.stem + '-choice.png'), timeout)
        driver.click(310, 392); driver.click(510, 444)
    else:
        raise ProtocolError('Unknown road movement action')
    return settled(driver, vision, path, timeout, current['turn'] + (action == 'advance'),
                   advance=action == 'advance', replace=action in KEYS)


def run_case(driver, observer, vision, case, directory, timeout):
    directory.mkdir()
    current = setup(driver, observer, vision, directory, timeout)
    first = current['x'], current['y']
    preparation = [current]
    for index, action in enumerate(('road', 'advance', 'east', 'advance', 'road', 'advance')):
        current = act(driver, vision, current, action, directory / f'prepare-{index}-{action}.png', timeout)
        preparation.append(current)
        (directory / 'preparation.json').write_text(json.dumps(preparation, indent=2) + '\n')
    if (current['x'], current['y']) != ((first[0] + 2) % 40, first[1]) or not current['terrain']['road']:
        raise ProtocolError('Original road preparation did not reach the eastern paved tile')
    if current['order'] != 'none' or current['work_units'] != 0 or current['movement_spent'] != 0:
        raise ProtocolError('Original road preparation did not leave a fresh Former')
    origin, x, y = current['turn'], current['x'], current['y']
    def output(state):
        if state['y'] != y or state['base'] or state['scout_order'] != 2:
            raise ProtocolError('Original road movement fixture was disturbed')
        delta = (state['x'] - x + 20) % 40 - 20
        return {key: state[key] for key in ('order', 'movement_spent', 'work_units', 'terrain')} | {
            'year_delta': state['turn'] - origin, 'position': delta // 2}
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
        if case['algorithm'] != ALGORITHM: raise ProtocolError('Unknown Former road movement contract')
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
        for name, raw in bundles['normal'].items(): (driver.work / 'game' / name).write_bytes(raw)
        rows = []
        for case in cases:
            result = run_case(driver, observer, vision, case, directory / case['id'], args.timeout)
            rows.append({'id': case['id'], 'status': 'ok', 'output': result})
            print('Captured original road movement: ' + case['id'], file=sys.stderr, flush=True)
        if fingerprint() != initial: raise ProtocolError('Road movement observer changed during capture')
        write_response(dict(driver.metadata, contract=ALGORITHM, adapter_sha256=initial,
                            source_profiles_sha256=fingerprint_profiles({'normal': bundles['normal']}),
                            observation='Read-only native vehicle position, order, movement spent, work counter, turn and current-tile improvement flags after real UI input',
                            fixture='Fresh healthy Former on synthetic 40x80 arid map; Gaians/Citizen/standard; UNIT1 input; held Scout; two adjacent roads built through actual work/turns before recording; unchanged installed road and work rates',
                            units='Signed same-row tile displacement; movement spent in thirds; original integer work counter',
                            ocr_version=vision.vision.version, ocr_model_sha256=vision.vision.model_sha256), rows)
    finally:
        if driver: driver.close()
        observer.vision.close(); vision.vision.close()


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, ProtocolError, VisionError, subprocess.SubprocessError) as error:
        print('Original road movement capture failed:', error, file=sys.stderr); sys.exit(1)
