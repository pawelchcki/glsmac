#!/usr/bin/env python3
"""Measure pinned original native dimensions after an actual generated world."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui.citizen_job_original import JobVision
from ui.dimension_dialog_original import text_files
from ui.drivers import OriginalDriver
from ui.large_map_original import DIMENSION_ROWS, WarningVision
from ui.probe import observe
from ui.size_kind_original import owned_process
from ui.vision import VisionError
from ui.world_dimensions_contract import ALGORITHM, validate_input, validate_output

DIRECTORY = Path(__file__).resolve().parent
ADDRESSES = {'size_kind': 0x0094A2A0, 'width': 0x00949870, 'height': 0x00949874,
             'half_width': 0x0068FAF0, 'tile_count': 0x00949884}


def fingerprint():
    digest = hashlib.sha256()
    for name in ('world_dimensions_original.py', 'world_dimensions_contract.py', 'large_map_original.py',
                 'large_map_contract.py', 'size_kind_original.py', 'citizen_job_original.py',
                 'dimension_dialog_original.py', 'dimension_dialog_contract.py', 'drivers.py', 'probe.py', 'vision.py'):
        digest.update((DIRECTORY / name).read_bytes())
    return digest.hexdigest()


def read_dimensions(driver):
    process = owned_process(driver)
    mappings = [line.split(maxsplit=5) for line in (process / 'maps').read_text().splitlines()]
    headers = [row for row in mappings if len(row) == 6 and row[2] == '00000000' and row[5] == str(driver.work / 'game/terranx.exe')]
    if len(headers) != 1:
        raise ProtocolError('missing or ambiguous pinned original image mapping')
    base = int(headers[0][0].split('-')[0], 16)
    with (process / 'mem').open('rb', buffering=0) as memory:
        if os.pread(memory.fileno(), 2, base) != b'MZ':
            raise ProtocolError('invalid original mapped executable header')
        output = {}
        for key, address in ADDRESSES.items():
            raw = os.pread(memory.fileno(), 4, base + address - 0x00400000)
            if len(raw) != 4:
                raise ProtocolError('incomplete original dimension read')
            output[key] = struct.unpack('<i', raw)[0]
    validate_output(output)
    if output['width'] != 2 * output['half_width'] or output['tile_count'] != output['half_width'] * output['height']:
        raise ProtocolError('original native grid fields are inconsistent')
    return output


def capture(cases, args):
    text_files(args.assets, 'default')
    initial = fingerprint()
    args.artifacts.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    vision, driver = JobVision(), None
    reader = WarningVision(vision.vision)
    try:
        driver = OriginalDriver(args.assets, args.wine, work)
        rows = []
        for case in cases:
            directory = work / case['id']
            directory.mkdir()
            driver.reset()
            step = 0

            def choose(label, startup=False):
                nonlocal step
                screen, controls = observe(driver, vision.vision, directory / f'menu-{step}.png',
                                           60 if startup else args.timeout, startup=startup)
                step += 1
                found = [control for control in controls if control['text'] == label]
                if len(found) != 1:
                    raise ProtocolError(f'cannot reach original dimension control {label}: {screen}')
                driver.click(found[0]['x'], found[0]['y'])

            choose('START GAME', True); choose('MAKE RANDOM MAP'); choose('CUSTOM SIZE')
            deadline = time.monotonic() + args.timeout
            while time.monotonic() < deadline:
                path = directory / 'initial.png'; driver.snapshot(path)
                try:
                    image = vision.Image.open(path).convert('RGB')
                    origins = [reader.dialog.number_bounds(image, box) for box in DIMENSION_ROWS]
                    reader.dialog.read(path)
                    break
                except VisionError:
                    time.sleep(.15)
            else:
                raise VisionError('original dimension inputs did not appear')
            for origin, key in zip(origins, ('horizontal', 'vertical')):
                driver.click((origin[0] + origin[2]) // 2, (origin[1] + origin[3]) // 2)
                subprocess.run(['xdotool', 'key', '--clearmodifiers', '--repeat', '12', '--delay', '5', 'BackSpace'], env=driver.env, check=True, timeout=10)
                subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '30', case['input'][key]], env=driver.env, check=True, timeout=10)
            vision.wait(driver, lambda image: reader.edited(image.convert('RGB'), origins), directory / 'typed.png', args.timeout)
            driver.key('Enter'); time.sleep(.4)
            path = directory / 'submitted.png'; driver.snapshot(path)
            try:
                reader.read(vision.Image.open(path).convert('RGB'))
            except VisionError:
                pass
            else:
                driver.key('Enter')
            choose('CITIZEN'); choose('PLAY WITH STANDARD RULES')
            vision.wait(driver, lambda image: vision.require_text(image, (180, 10, 600, 35), 'CHOOSE YOUR FACTIONS'), directory / 'factions.png', args.timeout)
            driver.key('Enter')
            vision.wait(driver, lambda image: vision.require_text(image, (340, 654, 1000, 680), 'ENTER YOUR NAME'), directory / 'name.png', args.timeout)
            driver.key('Enter')
            vision.wait(driver, lambda image: vision.require_text(image, (400, 567, 1010, 592), 'PLANETFALL'), directory / 'generated.png', args.timeout)
            first = read_dimensions(driver)
            time.sleep(.15)
            if read_dimensions(driver) != first:
                raise ProtocolError('original generated dimensions did not stabilize')
            (directory / 'observed.json').write_text(json.dumps(first, indent=2) + '\n')
            rows.append({'id': case['id'], 'status': 'ok', 'output': first})
        if fingerprint() != initial:
            raise ProtocolError('original dimension observer changed during capture')
        return dict(driver.metadata, adapter_sha256=initial, contract=ALGORITHM,
                    readonly_fields=[{'name': key, 'rva': hex(address - 0x00400000), 'bytes': 4} for key, address in ADDRESSES.items()],
                    observation='actual post-generation dimensions at the visible PLANETFALL checkpoint',
                    ocr_version=vision.vision.version, ocr_model_sha256=vision.vision.model_sha256), rows
    finally:
        if driver:
            driver.close()
        vision.vision.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--wine', default='wine')
    parser.add_argument('--timeout', type=float, default=30)
    parser.add_argument('--artifacts', type=Path, default=DIRECTORY.parent / '.build/world-dimensions-original')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported:
        validate_input(case['input'])
    metadata, rows = ({'name': 'world-dimensions-original', 'kind': 'adapter'}, [])
    if supported:
        metadata, rows = capture(supported, args)
    iterator = iter(rows)
    write_response(metadata, [next(iterator) if case['algorithm'] == ALGORITHM else
                             {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown grid-dimension contract'} for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, VisionError, subprocess.SubprocessError) as error:
        print(f'Original world dimensions failed: {error}', file=sys.stderr); sys.exit(1)
