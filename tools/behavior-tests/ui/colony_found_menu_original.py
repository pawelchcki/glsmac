"""Observe real free-tile Action naming controls and guarded native founding."""
import argparse
import hashlib
import inspect
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
from types import FunctionType

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui import colony_menu_original as shared
from ui import colony_join_original as membership
from ui import colony_found_menu_contract as contract
from ui import colony_found_menu_inputs as inputs
from ui.base_rename_original import click_control, RenameCaretVisible
from ui.faction_setup_native import NativeMemory
from ui.starvation_dialog_original import NoticeVision
from ui.vision import VisionError, consensus

base, previous, transport = shared.base, shared.previous, shared.transport
# Bind source-label lookup without mutating the archived/shared observer's
# module globals or changing its fingerprint halfway through a capture.
row_click = FunctionType(shared.row_click.__code__, dict(shared.row_click.__globals__, inputs=inputs))
# Reuse the existing read-only BASE layout observer, permitting the second
# actual owned city and selecting by its controlled coordinate. Signed raw
# food is retained privately as a guard, not claimed by this UI contract.
_source = inspect.getsource(membership.city)
_source = _source.replace('not 0<=food<=100000', 'not (0-100000)<=food<=100000')
_old = "if len(own)!=1 or (own[0]['x'],own[0]['y'])!=origin:raise ProtocolError('Expected one owned city at the actual initial stack')"
_new = "matches=[c for c in own if (c['x'],c['y'])==origin]\n  if not 1<=len(own)<=2 or len(matches)!=1:raise ProtocolError('Expected one controlled city at requested position')"
if _old not in _source:
    raise ProtocolError('Original BASE observer shape changed')
_source = _source.replace(_old, _new).replace("'city':own[0]", "'city':matches[0]")
_namespace = dict(vars(membership))
exec(_source, _namespace)
city = _namespace['city']
# During the actual founding announcement the original clears VehID to -1
# while InVehMode remains 1. Accept that observed no-selection state only
# after precisely the declared Pod disappears; arbitrary missing/foreign IDs
# still fail, and city/global membership is checked independently below.
_native_source = membership.source
_native_old = "if mode == 1 and len(selected) != 1:"
_native_new = "if mode == 1 and len(selected) != 1 and not (len(units) == 2 and selected_id == -1 and CONSUMED_POD_ID not in [unit['index'] for unit in units]):"
if _native_old not in _native_source:
    raise ProtocolError('Original selected-unit observer shape changed')
_native_source = _native_source.replace(_native_old, _native_new)
_native_source = _native_source.replace("selected[0] if mode == 1 else None", "selected[0] if mode == 1 and len(selected) == 1 else None")
_native_namespace = dict(membership.namespace, CONSUMED_POD_ID=None)
exec(_native_source, _native_namespace)
native_current = _native_namespace['native_join']



def fingerprint():
    digest = hashlib.sha256(shared.fingerprint().encode() + membership.fingerprint().encode())
    for module in (contract, inputs):
        digest.update(Path(module.__file__).read_bytes())
    digest.update(Path(__file__).read_bytes())
    return digest.hexdigest()


def patch_block(raw, declaration, marker):
    """Install only synthetic input fields; preserve other installed sections."""
    lines = raw.decode('latin1').splitlines(keepends=True)
    starts = [i for i, line in enumerate(lines) if line.strip() == marker]
    if len(starts) != 1:
        raise ProtocolError('Ambiguous founding input section: ' + marker)
    start = starts[0]
    end = next((i for i in range(start + 1, len(lines))
                if re.fullmatch(r'#[A-Z][A-Z0-9_]*', lines[i].strip())), len(lines))
    block = declaration.split('#END')[0].replace('\n', '\r\n')
    return (''.join(lines[:start]) + block + ''.join(lines[end:])).encode('latin1')


def profiles(assets):
    result = {}
    for profile in contract.PROFILES:
        files = dict(previous.ref.text_files(assets, 'default'), **base.bundle(assets))
        for name, source in inputs.declarations(profile).items():
            paths = [path for path in assets.iterdir() if path.is_file() and path.name.lower() == name]
            if len(paths) != 1:
                raise ProtocolError('Missing or ambiguous founding input: ' + name)
            path = paths[0]
            if name == 'alphax.txt':
                raw = previous.patch_terrain(path.read_bytes(), source)
            elif name in ('script.txt', 'gaians.txt'):
                installed = files.get(path.name, path.read_bytes())
                raw = patch_block(installed, source, '#NEWBASE' if name == 'script.txt' else '#BASES')
            else:
                raw = source.encode('ascii')
            files[path.name] = raw
        result[profile] = files
    return result


class NamingVision:
    def __init__(self, vision):
        self.reader = NoticeVision(vision)
        self.vision = vision
        self.field_left = None

    @staticmethod
    def present(image):
        return (image.getpixel((270, 290)) == (49, 78, 44)
                and image.getpixel((752, 320)) == (49, 78, 44)
                and all(image.getpixel(point) == (103, 91, 181)
                        for point in ((280, 335), (520, 335))))

    def draft(self, image):
        # Same original edit-control palette as the separately observed Rename
        # field, at this dialog's actual geometry. A caret-on frame is rejected,
        # never repaired or replaced from the declared pool or typed input.
        v = self.vision
        selected = (100, 81, 63)
        band = image.crop((270, 292, 751, 317))
        selected_x = [x for y in range(band.height) for x in range(band.width)
                      if band.getpixel((x, y)) == selected]
        if selected_x:
            self.field_left = 270 + min(selected_x)
        if self.field_left is None:
            raise VisionError('Actual naming field origin not observed')
        crop = image.crop((self.field_left, 292, 751, 317))
        points = [(x, y) for y in range(crop.height) for x in range(crop.width)
                  if crop.getpixel((x, y)) == selected]
        if points:
            left, right = min(x for x, y in points), max(x for x, y in points) + 1
            top, bottom = min(y for x, y in points), max(y for x, y in points) + 1
            crop = crop.crop((left, top, right, bottom))
            ink = {(x, y) for y in range(crop.height) for x in range(crop.width)
                   if crop.getpixel((x, y)) == (0, 0, 0)}
        else:
            ink = {(x, y) for y in range(crop.height) for x in range(crop.width)
                   if crop.getpixel((x, y)) == (120, 164, 212)}
            columns = {}
            for x, y in ink:
                columns.setdefault(x, set()).add(y)
            if any(len(ys) >= 18 and max(ys) - min(ys) >= 18 for ys in columns.values()):
                raise RenameCaretVisible('Naming caret overlays draft')
        if not ink:
            return ''
        mask = v.Image.new('L', crop.size, 255)
        for point in ink:
            mask.putpixel(point, 0)
        bounds = mask.point(lambda value: 255-value).getbbox()
        mask = v.ImageOps.expand(mask.crop(bounds), 8, 255)
        return consensus([v.text(mask.resize((mask.width*scale, mask.height*scale), v.Image.Resampling.LANCZOS))
                          for scale in (3, 4, 5)])

    def read(self, driver, image):
        value = self.draft(image)
        return dict(caption=self.reader.text(image, (264, 259, 755, 283)),
                    label=self.reader.text(image, (270, 292, self.field_left - 1, 318)), value=value,
                    buttons=[self.reader.text(image, box, black=True)
                             for box in ((276, 335, 504, 353), (520, 335, 747, 353))])


def prepare(driver, observer, vision, case, path):
    # Every step is actual input, beginning with the existing fresh saved
    # fixture's verified one-city/three-unit setup. No state writes or grants.
    first, origin = base.prepare(driver, observer, vision,
                                 dict(input=dict(profile='spread')), path, 60)
    initial = city(driver, origin)
    saved_setup = json.loads((path / 'saved-fixture-transport.json').read_text())
    if {key: saved_setup['town']['city'][key] for key in contract.INITIAL} != case['input']['initial_base']:
        raise ProtocolError('Actual original starting city differs from declared input')
    for _ in range(2):
        base.raw_key(driver, 'Tab')
        time.sleep(.6)
    current = base.native(driver)
    if current['selected'] != 'colony':
        raise ProtocolError('Actual preparation did not select the Pod')
    current = base.act(driver, vision, current, 'southwest', path / 'prepare-distant.png', 30)
    for index in range(8):
        ready = [unit for unit in current['units'] if unit['order'] == 'none' and unit['movement_spent'] < 3]
        if not ready:
            break
        current = base.act(driver, vision, current, 'tab' if current['selected'] is None else 'hold',
                           path / f'prepare-hold-{index}.png', 30)
    else:
        raise ProtocolError('Actual preparation could not finish controlled units')
    current = base.act(driver, vision, current, 'advance', path / 'prepare-next-year.png', 60)
    for index in range(4):
        if current['selected'] == 'colony':
            break
        current = base.act(driver, vision, current, 'tab', path / f'prepare-pod-{index}.png', 30)
    expected = {'scout': (0, 0, 2), 'former': (1, 1, 2), 'colony': (-2, 2, 0)}
    if current['selected'] != 'colony':
        raise ProtocolError('Actual distant Pod not selected')
    for unit in current['units']:
        relative = ((unit['x'] - origin[0] + 20) % 40 - 20, unit['y'] - origin[1], unit['order_code'])
        if relative != expected[unit['role']] or unit['movement_spent'] != 0:
            raise ProtocolError('Actual distant fixture differs from declared positions/orders')
    # The original one-city fixture was independently checked before these
    # preparation turns; their mineral income is outside this naming contract.
    if initial['owned_count'] != 1:
        raise ProtocolError('Actual preparation has extra owned cities')
    return current, origin


def capture(driver, observer, vision, menu_vision, case, path):
    path.mkdir()
    first, origin = prepare(driver, observer, vision, case, path)
    before = city(driver, origin)
    unit_ids = {unit['role']: unit['index'] for unit in first['units']}
    _native_namespace['CONSUMED_POD_ID'] = unit_ids['colony']
    positions = {unit['role']: (unit['x'], unit['y']) for unit in first['units']}
    companions = [unit for unit in first['units'] if unit['role'] != 'colony']
    naming = NamingVision(vision.vision)

    def observe(index):
        deadline = time.monotonic() + 30
        last, last_error = None, None
        while time.monotonic() < deadline:
            image_path = path / f'checkpoint-{index}.png'
            driver.snapshot(image_path)
            native = native_current(driver)
            town = city(driver, origin)
            if (native['turn'] != first['turn'] or town['city'] != before['city']
                    or town['global_count'] - before['global_count'] != town['owned_count'] - 1
                    or any(unit['index'] != unit_ids[unit['role']]
                           or (unit['x'], unit['y']) != positions[unit['role']] for unit in native['units'])
                    or [unit for unit in native['units'] if unit['role'] != 'colony'] != companions):
                raise ProtocolError('Founding changed guarded year/old-city/companion/identity/position')
            new_city = city(driver, positions['colony'])['city'] if town['owned_count'] == 2 else None
            try:
                image = vision.Image.open(image_path).convert('RGB')
                dialog = naming.read(driver, image) if naming.present(image) else None
                menu = menu_vision.read(image)
                state = dict(year_delta=0, selected=native['selected'], owned_count=town['owned_count'],
                    new_base={key: new_city[key] for key in ('name', 'population', 'workers', 'doctors', 'worked_tiles')} if new_city else None,
                    units=[{key: unit[key] for key in ('role', 'order_code', 'movement_spent')} for unit in native['units']],
                    root_open=menu is not None,
                    child_header=menu['child']['header_index'] if menu and menu['child'] else None,
                    dialog=dialog)
            except RenameCaretVisible as error:
                last_error = str(error)
                time.sleep(.15)
                continue
            except (VisionError, ProtocolError) as error:
                last, last_error = None, str(error)
                time.sleep(.25)
                continue
            if state == last:
                return state
            last = state
            time.sleep(.3)
        raise ProtocolError('Original founding checkpoint did not settle: ' + str(image_path) + '; ' + str(last_error))

    trace = [observe(0)]
    for index, action in enumerate(case['input']['actions'], 1):
        state = trace[-1]
        if action == 'menu':
            transport.click(driver, 60, 539)
        elif isinstance(action, dict) and 'header' in action:
            if not state['root_open'] or state['dialog'] is not None:
                raise ProtocolError('Actual root absent/covered before founding header')
            transport.click(driver, 27, 355 + 18 * action['header'])
        elif isinstance(action, dict) and 'row_source' in action:
            row_click(driver, vision, menu_vision, path / f'checkpoint-{index-1}.png', case['input']['text_profile'])
        elif isinstance(action, dict) and 'edit' in action:
            if state['dialog'] is None:
                raise ProtocolError('Actual naming input absent before edit')
            click_control(driver, 400, 306)
            subprocess.run(['xdotool', 'key', '--clearmodifiers', '--repeat', '80', '--delay', '2', 'BackSpace'],
                           env=driver.env, check=True, timeout=10)
            if action['edit']:
                subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '12', action['edit']],
                               env=driver.env, check=True, timeout=10)
        elif action in ('button-ok', 'button-cancel'):
            if state['dialog'] is None:
                raise ProtocolError('Actual naming buttons absent')
            click_control(driver, 385 if action == 'button-ok' else 630, 345)
        else:
            if state['dialog'] is None:
                raise ProtocolError('Actual naming keyboard target absent')
            base.raw_key(driver, {'cancel': 'Escape', 'confirm': 'Return'}[action])
        time.sleep(.6)
        trace.append(observe(index))
        (path / 'trace-progress.json').write_text(json.dumps(dict(trace=trace), indent=2) + '\n')
    output = dict(trace=trace)
    contract.validate_output(output, case['input']['actions'])
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--wine', required=True)
    parser.add_argument('--artifacts', type=Path, required=True)
    args = parser.parse_args()
    cases = load_request()['cases']
    if shared.shared.saved is None:
        raise ProtocolError('Founding recorder requires the guarded original-created saved fixture')
    for case in cases:
        if case['algorithm'] != contract.ALGORITHM:
            raise ProtocolError('Unknown Colony founding contract')
        contract.validate_input(case['input'])
    initial_hash = fingerprint()
    sources = profiles(args.assets)
    args.artifacts.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    observer, vision = base.FactionVision(), shared.shared.TerraformVision()
    menu_vision = shared.shared.glyphs.IngameMenuVision()
    driver = None
    # Fixture transport and glyph-target click only; independent new evidence
    # is read from the actual dialog/native world above, never legacy answers.
    try:
        driver = transport.base.ContextDriver(args.assets, args.wine, work)
        for path in (driver.work / 'game/maps').iterdir():
            if path.is_file() and path.suffix.lower() == '.mp':
                path.unlink()
        (driver.work / 'game/maps/PLANET.MP').write_bytes(base.arid_map())
        results = []
        for case in cases:
            if driver.process and driver.process.poll() is None:
                driver.process.kill()
                driver.process.wait(timeout=5)
            for name, raw in sources[case['input']['text_profile']].items():
                target = driver.work / 'game' / name
                if target.is_symlink():
                    target.unlink()
                target.write_bytes(raw)
            output = capture(driver, observer, vision, menu_vision, case, work / case['id'])
            results.append(dict(id=case['id'], status='ok', output=output))
        if fingerprint() != initial_hash:
            raise ProtocolError('Founding reference observer changed during capture')
        digest = hashlib.sha256(base.arid_map())
        for profile, files in sources.items():
            digest.update(profile.encode())
            for name, raw in sorted(files.items()):
                digest.update(name.encode() + b'\0' + raw)
        write_response(dict(driver.metadata, adapter_sha256=initial_hash, contract=contract.ALGORITHM,
            source_profiles_sha256=digest.hexdigest(), fixture_transport='guarded-original-created-save',
            observation='Actual MENU/Action/source0/edit/cancel/reopen/edit/confirm; independently observed dialog pixels and visible draft glyphs; old-city/year/companion/unit identity and position guards; actual new-city count and membership',
            boundaries='Healthy unspent land Pod two tiles southwest of one owned city, held Scout/Former, flat arid fixture and two synthetic source profiles; no adjacency policy, general name allocation, raw economy, AI, post-confirm announcement/artwork/management or complete founding parity'), results)
    finally:
        if driver:
            driver.close()
        observer.vision.close()
        vision.vision.close()
        menu_vision.close()


if __name__ == '__main__':
    main()
