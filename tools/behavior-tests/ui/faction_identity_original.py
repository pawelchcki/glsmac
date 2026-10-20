#!/usr/bin/env python3
"""Read selected identity data at the original post-generation opening dialog."""
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
from ui.faction_setup_original import action
from ui.faction_setup_original_v2 import FactionVision
from ui.faction_setup_native import NativeMemory
from ui.faction_setup_sources import source_profiles
from ui.faction_identity_contract import ALGORITHM, FIELDS, validate_input, validate_output
from ui.citizen_job_original import JobVision
from ui.probe import observe
from ui.vision import VisionError

DIRECTORY = Path(__file__).resolve().parent
RECORD = 0x00947020
STRIDE = 0x59C
OFFSETS = (0, 0x350, 0x2B0, 0x2D0, 0x18, 0x30)
HUMAN_MASK = 0x009A64E8


def fingerprint():
    digest = hashlib.sha256()
    for name in ('faction_identity_original.py', 'faction_identity_contract.py', 'faction_setup_original.py',
                 'faction_setup_original_v2.py', 'faction_setup_native.py', 'faction_setup_contract.py',
                 'faction_setup_sources.py', 'drivers.py', 'size_kind_original.py', 'citizen_job_original.py',
                 'dimension_dialog_original.py', 'dimension_dialog_contract.py', 'probe.py', 'vision.py'):
        digest.update((DIRECTORY / name).read_bytes())
    return digest.hexdigest()


def read_identity(driver):
    memory = NativeMemory(driver)
    try:
        # This is one byte. Adjacent original flags are not part of this mask.
        mask = memory.read(memory.address(HUMAN_MASK), 1)[0]
        if mask not in (2, 4, 8, 16, 32, 64, 128):
            raise ProtocolError('expected exactly one selected original human faction')
        record = RECORD + (mask.bit_length() - 2) * STRIDE
        result = {'identity': [memory.text(memory.address(record + offset)) for offset in OFFSETS]}
        validate_output(result)
        return result
    finally:
        memory.close()


def opening_dialog(observer, image):
    image = image.convert('RGB')
    if observer.region(image, (650, 733, 750, 746), black=True) != 'OK':
        raise VisionError('waiting for the original opening-dialog confirmation')
    # The Cult/Progenitor opening captions and dialog heights differ. Locate
    # the actual title frame and read its text; no requested identity or source
    # string supplies the caption or the result fields.
    for y in range(450, 711):
        if FactionVision.border(image, y):
            try:
                return observer.region(image, (401, y + 3, 1011, y + 23))
            except VisionError:
                continue
    raise VisionError('waiting for the original post-generation title frame')


def capture(cases, args):
    initial = fingerprint()
    profiles = source_profiles(args.assets)
    args.artifacts.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    observer, planet, driver = FactionVision(), JobVision(), None
    try:
        driver = OriginalDriver(args.assets, args.wine, work)
        rows = []
        for case in cases:
            directory = work / case['id']; directory.mkdir()
            if driver.process and driver.process.poll() is None:
                driver.process.kill(); driver.process.wait(timeout=5)
            for filename, data in profiles[case['input']['profile']].items():
                (driver.work / 'game' / filename).write_bytes(data)
            driver.reset()
            for index, label in enumerate(('START GAME', 'MAKE RANDOM MAP', 'TINY PLANET', 'CITIZEN', 'PLAY WITH STANDARD RULES')):
                menu, controls = observe(driver, observer.vision, directory / f'menu-{index}.png',
                                         60 if index == 0 else args.timeout, startup=index == 0)
                matches = [control for control in controls if control['text'] == label]
                if len(matches) != 1:
                    raise ProtocolError(f'cannot reach original identity control {label}: {menu}')
                driver.click(matches[0]['x'], matches[0]['y'])
            current = observer.wait(driver, directory / 'initial.png', args.timeout)
            for index, command in enumerate(case['input']['actions']):
                action(driver, current, command)
                current = observer.wait(driver, directory / f'action-{index}.png', args.timeout)
            if current['screen'] != 'name':
                raise ProtocolError('identity input must reach the actual name confirmation')
            driver.key('Enter')
            planet.wait(driver, lambda image: opening_dialog(observer, image),
                        directory / 'planetfall.png', args.timeout)
            result = read_identity(driver)
            time.sleep(.15)
            if read_identity(driver) != result:
                raise ProtocolError('original Planetfall identity did not stabilize')
            (directory / 'observed.json').write_text(json.dumps(result, indent=2) + '\n')
            rows.append({'id': case['id'], 'status': 'ok', 'output': result})
            with (work / 'progress.jsonl').open('a') as progress:
                progress.write(json.dumps({'complete': len(rows), 'total': len(cases), 'case': case['id']}) + '\n')
        if fingerprint() != initial:
            raise ProtocolError('identity observer changed during capture')
        digest = hashlib.sha256()
        for name, bundle in profiles.items():
            digest.update(name.encode())
            for filename, raw in sorted(bundle.items()):
                digest.update(filename.encode() + hashlib.sha256(raw).digest())
        return dict(driver.metadata, contract=ALGORITHM, adapter_sha256=initial,
                    source_profiles_sha256=digest.hexdigest(),
                    observation='six actual selected-faction identity strings at the visible post-generation opening dialog; no memory writes',
                    readonly_data={'human_mask': hex(HUMAN_MASK), 'record': hex(RECORD), 'stride': STRIDE,
                                   'fields': dict(zip(FIELDS, OFFSETS))},
                    ocr_version=observer.vision.version, ocr_model_sha256=observer.vision.model_sha256), rows
    finally:
        if driver:
            driver.close()
        observer.vision.close(); planet.vision.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--wine', default='wine')
    parser.add_argument('--timeout', type=float, default=45)
    parser.add_argument('--artifacts', type=Path, default=DIRECTORY.parent / '.build/faction-identity-original')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported:
        validate_input(case['input'])
    metadata, rows = ({'name': 'faction-identity-original', 'kind': 'adapter'}, [])
    if supported:
        metadata, rows = capture(supported, args)
    iterator = iter(rows)
    write_response(metadata, [next(iterator) if case['algorithm'] == ALGORITHM else
                             {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown faction identity contract'} for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, VisionError, subprocess.SubprocessError) as error:
        print(f'Original faction identity failed: {error}', file=sys.stderr); sys.exit(1)
