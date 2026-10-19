#!/usr/bin/env python3
"""Observe original custom-size navigation and its read-only setup kind.

Reads only the verified size-kind scalar in the pinned image. No process memory,
code or installed asset is modified. Private process/prefix identity is checked
before each read; process IDs never become reference answers or metadata.
"""
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
from ui.dimension_dialog_original import DialogVision, text_files
from ui.drivers import OriginalDriver
from ui.probe import observe
from ui.size_kind_contract import ALGORITHM, validate_input, validate_output
from ui.vision import MenuVision, VisionError

DIRECTORY = Path(__file__).resolve().parent
SIZE_KIND_RVA = 0x0094A2A0 - 0x00400000

def fingerprint():
    h = hashlib.sha256()
    for name in ('size_kind_original.py', 'size_kind_contract.py', 'dimension_dialog_original.py', 'dimension_dialog_contract.py', 'drivers.py', 'probe.py', 'vision.py'):
        h.update((DIRECTORY / name).read_bytes())
    return h.hexdigest()

def owned_process(driver, proc=Path('/proc')):
    matches = []
    for entry in proc.iterdir():
        if not entry.name.isdecimal():
            continue
        try:
            if entry.stat().st_uid != os.getuid() or (entry / 'comm').read_text().strip().lower() != 'terranx.exe':
                continue
            if ('WINEPREFIX=' + driver.env['WINEPREFIX']).encode() in (entry / 'environ').read_bytes().split(b'\0'):
                matches.append(entry)
        except (OSError, UnicodeError):
            continue
    if len(matches) != 1:
        raise ProtocolError('expected exactly one original process in the private Wine prefix')
    return matches[0]

def read_kind(driver):
    process = owned_process(driver)
    expected = str(driver.work / 'game' / 'terranx.exe')
    mappings = [line.split(maxsplit=5) for line in (process / 'maps').read_text().splitlines()]
    headers = [row for row in mappings if len(row) == 6 and row[2] == '00000000' and row[5] == expected]
    if len(headers) != 1:
        raise ProtocolError('original image mapping is absent or ambiguous')
    base = int(headers[0][0].split('-')[0], 16)
    with (process / 'mem').open('rb', buffering=0) as memory:
        if os.pread(memory.fileno(), 2, base) != b'MZ':
            raise ProtocolError('original mapped image header is invalid')
        raw = os.pread(memory.fileno(), 4, base + SIZE_KIND_RVA)
    if len(raw) != 4:
        raise ProtocolError('incomplete original size-kind read')
    value = struct.unpack('<i', raw)[0]
    if value not in (0, 1, 2, 3, 4, 99):
        raise ProtocolError('unknown original setup size kind')
    return value

def capture(cases, args):
    # Validate pinned source context as well as the executable fingerprint.
    text_files(args.assets, 'default')
    initial = fingerprint()
    args.artifacts.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    vision = MenuVision()
    dialog = DialogVision(vision)
    driver = None
    try:
        driver = OriginalDriver(args.assets, args.wine, work)
        results = []
        for case in cases:
            directory = work / case['id']; directory.mkdir()
            driver.reset()
            step = 0
            def menu(startup=False):
                nonlocal step
                value = observe(driver, vision, directory / f'menu-{step}.png', 60 if startup else args.timeout, startup=startup)
                step += 1
                return value
            def choose(label, startup=False):
                screen, controls = menu(startup)
                found = [row for row in controls if row['text'] == label]
                if len(found) != 1:
                    raise ProtocolError(f'cannot reach original control {label}: {screen}')
                driver.click(found[0]['x'], found[0]['y'])
            route = 'MAKE RANDOM MAP' if case['input']['route'] == 'random' else 'CUSTOMIZE RANDOM MAP'
            choose('START GAME', True); choose(route)
            prior = case['input']['prior_preset']
            if prior is not None:
                _, controls = menu()
                if len(controls) != 6:
                    raise ProtocolError('unexpected original size choice count')
                driver.click(controls[prior]['x'], controls[prior]['y']); menu(); driver.key('Escape')
                if case['input']['route'] == 'random': choose(route)
            choose('CUSTOM SIZE')
            previous = None
            deadline = time.monotonic() + args.timeout
            while time.monotonic() < deadline:
                path = directory / 'dialog.png'; driver.snapshot(path)
                try:
                    current = dialog.read(path)
                except VisionError:
                    time.sleep(.15); continue
                if current == previous: break
                previous = current; time.sleep(.15)
            else: raise VisionError('untouched dialog failed to stabilize')
            opened = {'kind': 'dimension-dialog', 'caption': current['caption'], 'values': current['values']}
            trace = [{'stage': 'open', 'size_kind': read_kind(driver), 'screen': opened}]
            action = case['input']['close']
            if action != 'wait':
                if action in ('Enter', 'Escape'): driver.key(action)
                else: driver.click(510 if action == 'OK' else 840, 738)
                after, _ = menu()
                trace.append({'stage': 'close', 'size_kind': read_kind(driver), 'screen': after})
                if case['input']['reenter']:
                    if action in ('Enter', 'OK'):
                        driver.key('Escape'); after, _ = menu()
                        trace.append({'stage': 'back', 'size_kind': read_kind(driver), 'screen': after})
                    if route in after['entries']:
                        choose(route)
                        after, _ = menu()
                        trace.append({'stage': 'reentry', 'size_kind': read_kind(driver), 'screen': after})
            output = {'trace': trace}; validate_output(output)
            (directory / 'observed.json').write_text(json.dumps(output, indent=2) + '\n')
            results.append({'id': case['id'], 'status': 'ok', 'output': output})
        if fingerprint() != initial:
            raise ProtocolError('original observer changed during capture')
        return dict(driver.metadata, adapter_sha256=initial, contract=ALGORITHM,
                    readonly_fields=[{'name': 'setup size kind', 'rva': hex(SIZE_KIND_RVA), 'bytes': 4}],
                    observation='actual untouched custom dialog, setup kind, navigation and highlighted reentry choice',
                    ocr_version=vision.version, ocr_model_sha256=vision.model_sha256), results
    finally:
        if driver: driver.close()
        vision.close()

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--assets', type=Path, required=True);p.add_argument('--wine', default='wine')
    p.add_argument('--timeout', type=float, default=15)
    p.add_argument('--artifacts', type=Path, default=DIRECTORY.parent / '.build/size-kind-original')
    args=p.parse_args();cases=load_request()['cases']
    supported=[case for case in cases if case['algorithm']==ALGORITHM]
    for case in supported: validate_input(case['input'])
    if not 0 < args.timeout <= 120: raise ProtocolError('invalid observation deadline')
    metadata, rows=({'name':'size-kind-original','kind':'adapter'},[])
    if supported: metadata,rows=capture(supported,args)
    iterator=iter(rows)
    write_response(metadata,[next(iterator) if c['algorithm']==ALGORITHM else {'id':c['id'],'status':'unsupported','reason':'unknown custom-size kind contract'} for c in cases])
if __name__=='__main__':
    try:main()
    except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as error:
        print(f'Original size-kind observation failed: {error}',file=sys.stderr);sys.exit(1)
