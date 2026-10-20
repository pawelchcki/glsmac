#!/usr/bin/env python3
"""Record original roster and editor controls in a private Wine installation."""
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
from ui.vision import MenuVision, VisionError, normalize
from ui.dimension_dialog_original import DialogVision, text_files
from ui.faction_setup_contract import ALGORITHM, validate_input, validate_frame, validate_output
from ui.faction_setup_native import NativeMemory, FactionControls
from ui.probe import observe

DIRECTORY = Path(__file__).resolve().parent


def fingerprint():
    digest = hashlib.sha256()
    for name in ('faction_setup_original.py', 'faction_setup_native.py', 'faction_setup_contract.py',
                 'faction_setup_sources.py', 'drivers.py', 'size_kind_original.py',
                 'dimension_dialog_original.py', 'dimension_dialog_contract.py', 'probe.py', 'vision.py'):
        digest.update((DIRECTORY / name).read_bytes())
    return digest.hexdigest()


class FactionVision:
    def __init__(self):
        self.vision = MenuVision()
        self.dialog = DialogVision(self.vision)
        self.regions = {}

    def region(self, image, box, black=False):
        crop = image.crop(box)
        key = (crop.size, black, hashlib.sha256(crop.tobytes()).hexdigest())
        if key not in self.regions:
            self.regions[key] = self.dialog.read_region(image, box, black)
        return self.regions[key]

    @staticmethod
    def border(image, y):
        # Green frame pixels identify an actual title bar, not its expected text.
        columns = range(350, 1000, 7)
        return any(sum(1 for x in columns
                       if (lambda p: 30 <= p[0] <= 95 and p[1] >= p[0] + 15 and p[1] > p[2] + 15)(image.getpixel((x, row))))
                   >= len(columns) * .85 for row in range(y - 2, y + 3))

    @staticmethod
    def button_present(image, x):
        return sum(1 for column in range(x + 3, x + 200, 7) for y in (732, 734, 743, 745)
                   if (lambda p: p[2] > 100 and p[0] > 35)(image.getpixel((column, y)))) > 35

    def read(self, driver, path):
        driver.snapshot(path)
        image = self.vision.Image.open(path).convert('RGB')
        if image.size != (1024, 768):
            raise ProtocolError('original faction capture requires the declared viewport')
        memory = NativeMemory(driver)
        try:
            controls = FactionControls(memory)
            custom = self.border(image, 513)
            if custom or self.border(image, 652):
                count = 7 if custom else 1
                values = [controls.focused_value()]
                caption = self.region(image, (342, 514, 1012, 538) if custom else (342, 653, 1012, 677))
                labels = []
                for index in range(count):
                    top = (548 if custom else 688) + 23 * index
                    text = self.region(image, (347, top, 431 if custom else 1007, top + 20))
                    if not custom and ':' not in text:
                        raise VisionError('name label delimiter was not observed')
                    labels.append(text.split(':', 1)[0].strip())
                buttons = [self.region(image, (x + 1, 733, x + 212, 746), black=True)
                           for x in (347, 569, 795) if self.button_present(image, x)]
                frame = {'screen': 'customize' if custom else 'name', 'caption': caption,
                         'items': [], 'selected': -1, 'random': False, 'labels': labels,
                         'values': values, 'buttons': buttons}
            else:
                # Real sliding-menu observations take precedence over stale
                # data retained by the inactive faction control.
                try:
                    menu, _ = self.vision.read(path)
                except VisionError:
                    menu = None
                if menu is not None:
                    frame = {'screen': 'menu', 'caption': menu['caption'], 'items': menu['entries'],
                             'selected': menu['entries'].index(menu['selected'][0]), 'random': False,
                             'labels': [], 'values': [], 'buttons': []}
                else:
                    frame = {'screen': 'factions', 'caption': self.region(image, (12, 13, 788, 35)),
                             **controls.roster(), 'labels': [], 'values': [],
                             'buttons': [self.region(image, (x, 279, x + 185, 292), black=True)
                                         for x in (12, 206, 400, 594)]}
            validate_frame(frame)
            return frame
        finally:
            memory.close()

    def wait(self, driver, path, timeout):
        previous, last = None, 'no observation'
        deadline = time.monotonic() + timeout
        time.sleep(.2)
        while time.monotonic() < deadline:
            try:
                current = self.read(driver, path)
                if current == previous:
                    return current
                previous, last = current, 'controls did not stabilize'
            except (VisionError, ProtocolError) as error:
                previous, last = None, str(error)
            time.sleep(.15)
        raise VisionError('original faction observation timed out: ' + last)


def action(driver, current, command):
    kind, value = next(iter(command.items()))
    screen = current['screen']
    if kind == 'key':
        if screen == 'name' and value == 'Enter':
            raise ProtocolError('name confirmation/generation is outside this control contract')
        driver.key(value)
    elif kind in ('slot', 'preset', 'mode', 'roster'):
        if screen != 'factions':
            raise ProtocolError('requested original roster control is absent')
        if kind == 'slot':
            driver.click(550, 147 + 19 * value)
        elif kind == 'preset':
            driver.click(135 if value == 'base' else 380, 88)
        elif kind == 'mode':
            driver.click(115, 147 if value == 'selected' else 172)
        else:
            driver.click(776, 147 + 19 * value['slot'])
            time.sleep(.15)
            # One semantic roster edit expands into the actual open/choose
            # mouse sequence. Option ordinals are inputs, not inferred IDs.
            driver.click(820, 160 + 19 * value['slot'] + 20 * value['option'])
    elif kind in ('focus', 'edit'):
        field = value if kind == 'focus' else value['field']
        if screen not in ('name', 'customize') or field >= (7 if screen == 'customize' else 1):
            raise ProtocolError('requested original edit field is absent')
        driver.click(700, (558 if screen == 'customize' else 698) + 23 * field)
        if kind == 'focus':
            return
        subprocess.run(['xdotool', 'key', '--clearmodifiers', '--repeat', '80', '--delay', '2', 'BackSpace'],
                       env=driver.env, check=True, timeout=10)
        if value['text']:
            subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '12', value['text']],
                           env=driver.env, check=True, timeout=10)
    elif kind == 'button':
        if screen == 'factions' and value in ('CHANGE NAME', 'OK', 'CANCEL'):
            driver.click({'CHANGE NAME': 298, 'OK': 490, 'CANCEL': 690}[value], 286)
        elif screen in ('name', 'customize'):
            roles = ('RESTORE DEFAULTS' if screen == 'customize' else 'CHANGE GENDER', 'OK', 'CANCEL')
            if value not in roles or (screen == 'name' and value == 'OK'):
                raise ProtocolError('requested original editor action is outside this contract')
            if value == roles[0] and len(current['buttons']) != 3:
                raise ProtocolError('requested original optional editor button is absent')
            driver.click((451, 677, 900)[roles.index(value)], 738)
        else:
            raise ProtocolError('requested original button is absent')


def capture(cases, args):
    from ui.faction_setup_sources import source_profiles
    initial = fingerprint()
    profiles = source_profiles(args.assets)
    args.artifacts.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    observer, driver = FactionVision(), None
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
                menu, controls = observe(driver, observer.vision, directory / f'menu-{index}.png', 60 if index == 0 else args.timeout, startup=index == 0)
                found = [control for control in controls if control['text'] == label]
                if len(found) != 1:
                    raise ProtocolError(f'cannot reach faction control {label}: {menu}')
                driver.click(found[0]['x'], found[0]['y'])
            trace = [observer.wait(driver, directory / 'state-0.png', args.timeout)]
            for index, command in enumerate(case['input']['actions'], 1):
                action(driver, trace[-1], command)
                trace.append(observer.wait(driver, directory / f'state-{index}.png', args.timeout))
            output = {'trace': trace}; validate_output(output, case)
            (directory / 'observed.json').write_text(json.dumps(output, indent=2) + '\n')
            rows.append({'id': case['id'], 'status': 'ok', 'output': output})
            with (work / 'progress.jsonl').open('a') as progress:
                progress.write(json.dumps({'complete': len(rows), 'total': len(cases), 'case': case['id']}) + '\n')
        if fingerprint() != initial:
            raise ProtocolError('original faction observer changed during capture')
        digest = hashlib.sha256()
        for name, bundle in profiles.items():
            digest.update(name.encode())
            for filename, raw in sorted(bundle.items()):
                digest.update(filename.encode() + hashlib.sha256(raw).digest())
        return dict(driver.metadata, contract=ALGORITHM, adapter_sha256=initial, source_profiles_sha256=digest.hexdigest(),
                    observation='actual native roster/edit values; rendered captions/labels/buttons; no code or memory writes',
                    ocr_version=observer.vision.version, ocr_model_sha256=observer.vision.model_sha256), rows
    finally:
        if driver:
            driver.close()
        observer.vision.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--wine', default='wine')
    parser.add_argument('--timeout', type=float, default=30)
    parser.add_argument('--artifacts', type=Path, default=DIRECTORY.parent / '.build/faction-setup-original')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported:
        validate_input(case['input'])
    metadata, rows = ({'name': 'faction-setup-original', 'kind': 'adapter'}, [])
    if supported:
        metadata, rows = capture(supported, args)
    iterator = iter(rows)
    write_response(metadata, [next(iterator) if case['algorithm'] == ALGORITHM else
                             {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown faction control contract'} for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, VisionError, subprocess.SubprocessError) as error:
        print(f'Original faction capture failed: {error}', file=sys.stderr); sys.exit(1)
