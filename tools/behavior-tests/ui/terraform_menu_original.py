"""Observe actual original Terraform row clicks and native work receipts."""
import argparse
from collections import Counter
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
sys.path.insert(0, str(Path(__file__).resolve().parent / 'reference-archives/unit-menu-context-saved-v26'))
from protocol import ProtocolError, load_request, write_response
import unit_menu_context_message_original as transport
from ui import terraform_menu_contract as contract
from ui import terraform_menu_inputs as inputs
from ui import unit_menu_orders_original as previous
from ui import ingame_menu_vision as glyphs
from ui.faction_setup_native import NativeMemory
from ui.former_work_original import ORDER_NAMES
from ui.vision import VisionError, consensus

saved = None
if os.environ.get('SMAC_UI_SAVED_FIXTURE_ROOT'):
    import unit_menu_context_saved_original as saved
base = transport.base.previous.base


def snapshot(driver, path):
    # Actual XCB root pixels, with a bounded read deadline covering original
    # load-dialog X-server stalls seen in retained capture-v3. Never retry an
    # input or infer the image from native state.
    subprocess.run([sys.executable, str(transport.screenshot_helper), driver.env['DISPLAY'], str(path)],
                   env=driver.env, stdout=driver.log, stderr=driver.log, check=True, timeout=30)


transport.base.ContextDriver.snapshot = snapshot


class TerraformVision(transport.base.ContextVision):
    def line_at(self, image, box):
        if box != (10, 637, 135, 653):
            return super().line_at(image, box)
        crop = image.convert('RGB').crop(box)
        mask = self.Image.new('L', crop.size, 255)
        mask.putdata([0 if (g > 85 and g > r * 1.2 and g > b * 1.2
                           or r > 100 and r > g * 1.5 and r > b * 1.5)
                      else 255 for r, g, b in crop.getdata()])
        mask = self.vision.ImageOps.expand(mask, 8, 255)
        return consensus([self.vision.text(mask.resize((mask.width * scale, mask.height * scale), method))
                          for scale, method in ((2, self.Image.Resampling.LANCZOS),
                                                (4, self.Image.Resampling.BILINEAR),
                                                (5, self.Image.Resampling.BILINEAR))])


if saved:
    # Preserve the archived transport unchanged. Retained native pixels show
    # that its old filename scales read the final V as Y. Three independent
    # preparations read the full actual filename; no label substitutions or
    # outcome-dependent action retries are used.
    _saved_globals = saved.recorded['setup'].__globals__
    _saved_text = _saved_globals['text']

    def saved_text(vision, image, box, kind):
        if box != (393, 238, 550, 256) or kind != 'dark':
            return _saved_text(vision, image, box, kind)
        crop = image.convert('RGB').crop(box)
        mask = vision.Image.new('L', crop.size, 255)
        mask.putdata([0 if max(pixel) < 95 else 255 for pixel in crop.getdata()])
        mask = vision.vision.ImageOps.expand(mask, 8, 255)
        return consensus([vision.vision.text(mask.resize((mask.width * scale, mask.height * scale), method)).replace(' ', '')
                          for scale, method in ((4, vision.Image.Resampling.LANCZOS),
                                                (4, vision.Image.Resampling.BILINEAR),
                                                (3, vision.Image.Resampling.NEAREST))])

    _saved_globals['text'] = saved_text


def fingerprint():
    digest = hashlib.sha256(transport.fingerprint().encode())
    for module in (contract, inputs, previous, glyphs):
        digest.update(Path(module.__file__).read_bytes())
    digest.update(Path(__file__).read_bytes())
    return digest.hexdigest()


def native(driver):
    memory = NativeMemory(driver)
    try:
        mask = memory.read(memory.address(0x9A64E8), 1)[0]
        if mask not in (2, 4, 8, 16, 32, 64, 128):
            raise ProtocolError('Terraform fixture requires exactly one human')
        owner = mask.bit_length() - 1
        width, height = memory.image_word(0x949870), memory.image_word(0x949874)
        count = memory.image_word(0x9A64C8)
        if (width, height) != (40, 80) or not 0 <= count <= 2048:
            raise ProtocolError('Terraform native map/unit bounds changed')
        units = []
        terrain = None
        for index in range(count):
            raw = memory.read(memory.address(0x952828) + index * 52, 52)
            if raw[14] != owner:
                continue
            kind = struct.unpack_from('<h', raw, 10)[0]
            x, y = struct.unpack_from('<hh', raw)
            if (kind not in base.TYPE_ROLE or raw[16] or raw[17] not in ORDER_NAMES
                    or raw[40] > 3 or raw[37] > 128
                    or not 0 <= x < width or not 0 <= y < height or (x + y) % 2):
                raise ProtocolError('Unrecognized Terraform fixture unit')
            role = base.TYPE_ROLE[kind]
            units.append(dict(id=index, role=role, x=x, y=y, order=ORDER_NAMES[raw[17]],
                              movement_spent=raw[40], work_units=raw[37]))
            if role == 'former':
                tile = memory.read(memory.image_word(0x94A30C) + (y * (width // 2) + x // 2) * 44, 44)
                flags = struct.unpack_from('<I', tile, 8)[0]
                if tile[0] >> 5 < 3 or (tile[0] >> 3) & 3 or tile[5] >> 6 or flags & 0x21:
                    raise ProtocolError('Former is outside declared flat arid nonbase land')
                terrain = {name: bool(flags & bit) for name, bit in
                           (('road', 4), ('farm', 0x8000), ('mine', 0x10), ('forest', 0x200000))}
        if len(units) != 3 or {unit['role'] for unit in units} != {'scout', 'former', 'colony'}:
            raise ProtocolError('Terraform native owned-unit membership changed')
        mode = memory.image_word(0x939288, signed=True)
        selected_id = memory.image_word(0x93928C, signed=True)
        selected = [unit['role'] for unit in units if unit['id'] == selected_id]
        if mode not in (0, 1) or mode == 0 and selected_id != -1 or mode == 1 and len(selected) != 1:
            raise ProtocolError('Unrecognized Terraform native selection')
        return dict(year=memory.image_word(0x9A64D4), selected=selected[0] if mode else None,
                    units=units, terrain=terrain)
    finally:
        memory.close()


def click_row(driver, vision, menu_vision, image_path, profile, row):
    image = vision.Image.open(image_path).convert('RGB')
    menu = menu_vision.read(image)
    if menu is None or menu['child'] is None or menu['child']['header_index'] != 5:
        raise ProtocolError('Actual Terraform child absent before requested click')
    label = previous.contract.presentation.normalize(inputs.source_label(profile, row).replace('&', ''))
    matches = [index for index, item in enumerate(menu['child']['rows'])
               if item.get('label') == label or item.get('label', '').startswith(label + ' (')]
    if len(matches) != 1:
        raise ProtocolError('Declared Terraform target absent or ambiguous: ' + label)
    pixels = image.load()
    runs = []
    for y in range(image.height):
        if pixels[140, y] != menu_vision.PURPLE:
            continue
        right = 140
        while right < 950 and pixels[right, y] == menu_vision.PURPLE:
            right += 1
        if right - 140 >= 80:
            runs.append((y, right))
    if not runs:
        raise ProtocolError('Actual Terraform child rectangle absent')
    right = Counter(end for _, end in runs).most_common(1)[0][0]
    top = min(y for y, end in runs if end == right)
    y = top + 20 * matches[0] + 10
    if not 0 <= y < image.height:
        raise ProtocolError('Terraform target outside actual viewport')
    transport.click(driver, 140 + min(40, (right - 140) // 2), y)


def capture(driver, observer, vision, menu_vision, case, path):
    path.mkdir()
    _prepared, origin = base.prepare(driver, observer, vision, case, path, 60)
    base.raw_key(driver, 'Tab')
    initial = native(driver)
    if initial['selected'] != 'former':
        raise ProtocolError('Declared ready Former not selected after one Tab')
    town = previous.ref.full.city(driver, origin)
    initial_units = initial['units']
    def observe(index):
        deadline = time.monotonic() + 30
        last = None
        last_error = None
        while time.monotonic() < deadline:
            image_path = path / f'checkpoint-{index}.png'
            driver.snapshot(image_path)
            current = native(driver)
            if current['year'] != initial['year'] or previous.ref.full.city(driver, origin) != town:
                raise ProtocolError('Terraform command changed guarded city/year')
            for unit, before in zip(current['units'], initial_units, strict=True):
                if (any(unit[key] != before[key] for key in ('id', 'role', 'x', 'y'))
                        or unit['role'] != 'former' and unit != before):
                    raise ProtocolError('Terraform command changed guarded identity/position/companion')
            try:
                image = vision.Image.open(image_path).convert('RGB')
                if current['selected'] is not None and vision.line_at(image, (10, 637, 135, 653)) != base.ROLE_LABEL[current['selected']]:
                    raise VisionError('Actual selected unit label disagrees with native selection')
                menu = menu_vision.read(image)
                former = next(unit for unit in current['units'] if unit['role'] == 'former')
                state = {key: former[key] for key in ('order', 'movement_spent', 'work_units')}
                state.update(year_delta=0, selected=current['selected'], terrain=current['terrain'],
                             root_open=menu is not None,
                             child_header=menu['child']['header_index'] if menu and menu['child'] else None)
            except VisionError as error:
                last_error = str(error)
                last = None
                time.sleep(.25)
                continue
            if state == last:
                return state
            last = state
            time.sleep(.3)
        raise ProtocolError('Original Terraform checkpoint timed out: ' + str(image_path) + '; ' + str(last_error))
    trace = [observe(0)]
    for index, action in enumerate(case['input']['actions'], 1):
        if action == 'menu':
            transport.click(driver, 60, 539)
        elif action == 'tab':
            base.raw_key(driver, 'Tab')
        elif action == 'escape':
            base.raw_key(driver, 'Escape')
        elif 'header' in action:
            if not trace[-1]['root_open']:
                raise ProtocolError('Actual root menu absent before header click')
            transport.click(driver, 27, 355 + 18 * action['header'])
        else:
            click_row(driver, vision, menu_vision, path / f'checkpoint-{index-1}.png',
                      case['input']['text_profile'], action['terrain_index'])
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
    for case in cases:
        if case['algorithm'] != contract.ALGORITHM:
            raise ProtocolError('Unknown Terraform menu algorithm')
        contract.validate_input(case['input'])
    initial_hash = fingerprint()
    stock = previous.ref.text_files(args.assets, 'default')
    profiles = {}
    for profile in contract.PROFILES:
        files = dict(stock, **base.bundle(args.assets))
        for name, source in inputs.declarations(profile).items():
            installed = [path for path in args.assets.iterdir() if path.is_file() and path.name.lower() == name]
            if len(installed) != 1:
                raise ProtocolError('Missing or ambiguous installed source: ' + name)
            target = installed[0]
            files[target.name] = previous.patch_terrain(target.read_bytes(), source) if name == 'alphax.txt' else source.encode('ascii')
        profiles[profile] = files
    args.artifacts.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    observer = base.FactionVision()
    vision = TerraformVision()
    menu_vision = glyphs.IngameMenuVision()
    driver = None
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
            for name, raw in profiles[case['input']['text_profile']].items():
                target = driver.work / 'game' / name
                if target.is_symlink():
                    target.unlink()
                target.write_bytes(raw)
            output = capture(driver, observer, vision, menu_vision, case, work / case['id'])
            results.append(dict(id=case['id'], status='ok', output=output))
            print('Captured actual Terraform menu: ' + case['id'], file=sys.stderr, flush=True)
        if fingerprint() != initial_hash:
            raise ProtocolError('Original Terraform observer changed during capture')
        digest = hashlib.sha256(base.arid_map())
        for profile, files in profiles.items():
            digest.update(profile.encode())
            for name, raw in sorted(files.items()):
                digest.update(name.encode() + b'\0' + raw)
        write_response(dict(driver.metadata, adapter_sha256=initial_hash, contract=contract.ALGORITHM,
                            source_profiles_sha256=digest.hexdigest(),
                            fixture_transport='guarded-original-created-save' if saved else 'fresh-wizard',
                            observation='Actual MENU, Terraform header, independently observed row rectangle/label, one pointer click and Tab; read-only native work/movement/terrain/selection and city/companion guards',
                            boundaries='Healthy unspent arid Former, four declared work rows and two synthetic source-label profiles; setup city stores guarded locally after spread preparation, not compared across engines; no later turns, replacement dialogs, AI or full Terraform coverage'), results)
    finally:
        if driver:
            driver.close()
        observer.vision.close()
        vision.vision.close()
        menu_vision.close()


if __name__ == '__main__':
    main()
