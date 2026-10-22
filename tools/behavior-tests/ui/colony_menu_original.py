"""Original owned-city Colony Action row, actual clicks and native membership."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui import terraform_menu_original as shared
from ui import colony_menu_contract as contract
from ui import colony_menu_inputs as inputs
from ui.vision import VisionError

base, previous, transport = shared.base, shared.previous, shared.transport


def fingerprint():
    digest = hashlib.sha256(shared.fingerprint().encode())
    for module in (contract, inputs):
        digest.update(Path(module.__file__).read_bytes())
    digest.update(Path(__file__).read_bytes())
    return digest.hexdigest()


def row_click(driver, vision, menu_vision, path, profile):
    image = vision.Image.open(path).convert('RGB')
    menu = menu_vision.read(image)
    if menu is None or menu['child'] is None or menu['child']['header_index'] != 4:
        raise ProtocolError('Actual Action child absent before Colony command')
    label = previous.contract.presentation.normalize(inputs.source_label(profile).replace('&', ''))
    matches = [index for index, row in enumerate(menu['child']['rows']) if row.get('label') == label]
    if len(matches) != 1:
        raise ProtocolError('Declared Colony source label absent or ambiguous')
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
        raise ProtocolError('Actual Colony Action child rectangle absent')
    right = Counter(end for _, end in runs).most_common(1)[0][0]
    top = min(y for y, end in runs if end == right)
    y = top + 20 * matches[0] + 10
    if not 0 <= y < image.height:
        raise ProtocolError('Actual Colony target outside viewport')
    transport.click(driver, 140 + min(40, (right - 140) // 2), y)


def capture(driver, observer, vision, menu_vision, case, path):
    path.mkdir()
    first, origin = base.prepare(driver, observer, vision, case, path, 60)
    initial_town = previous.ref.full.city(driver, origin)
    city = initial_town['city']
    if {key: city[key] for key in contract.INITIAL} != case['input']['initial_base']:
        raise ProtocolError('Original Colony city differs from declared setup')
    identity = {key: city[key] for key in ('id', 'x', 'y', 'name')}
    unit_ids = {unit['role']: unit['index'] for unit in first['units']}
    companions = [{key: unit[key] for key in ('index', 'role', 'x', 'y', 'order_code', 'movement_spent')}
                  for unit in first['units'] if unit['role'] != 'colony']
    def observe(index):
        deadline = time.monotonic() + 30
        last = None
        while time.monotonic() < deadline:
            image_path = path / f'checkpoint-{index}.png'
            driver.snapshot(image_path)
            native = base.native(driver)
            town = previous.ref.full.city(driver, origin)
            city = town['city']
            if (native['turn'] != first['turn'] or town['global_count'] != initial_town['global_count']
                    or town['owned_count'] != 1 or {key: city[key] for key in identity} != identity
                    or any(unit['index'] != unit_ids[unit['role']] or (unit['x'], unit['y']) != origin
                           for unit in native['units'])
                    or [{key: unit[key] for key in ('index', 'role', 'x', 'y', 'order_code', 'movement_spent')}
                        for unit in native['units'] if unit['role'] != 'colony'] != companions):
                raise ProtocolError('Colony command changed guarded year/base/companion/identity/position')
            try:
                image = vision.Image.open(image_path).convert('RGB')
                if native['selected'] is not None and vision.line_at(image, (10, 637, 135, 653)) != base.ROLE_LABEL[native['selected']]:
                    raise VisionError('Actual Colony selected-name/native disagreement')
                menu = menu_vision.read(image)
                state = dict(year_delta=0, selected=native['selected'],
                             base=dict({key: city[key] for key in ('population', 'workers', 'doctors', 'worked_tiles', 'nutrients', 'minerals')}, owned_count=town['owned_count']),
                             units=[{key: unit[key] for key in ('role', 'order_code', 'movement_spent')} for unit in native['units']],
                             root_open=menu is not None,
                             child_header=menu['child']['header_index'] if menu and menu['child'] else None)
            except VisionError:
                last = None
                time.sleep(.25)
                continue
            if state == last:
                return state
            last = state
            time.sleep(.3)
        raise ProtocolError('Original Colony menu checkpoint did not settle: ' + str(image_path))
    trace = [observe(0)]
    for index, action in enumerate(case['input']['actions'], 1):
        if action == 'tab':
            base.raw_key(driver, 'Tab')
        elif action == 'menu':
            transport.click(driver, 60, 539)
        elif 'header' in action:
            if not trace[-1]['root_open']:
                raise ProtocolError('Root absent before actual Colony header')
            transport.click(driver, 27, 355 + 18 * action['header'])
        else:
            row_click(driver, vision, menu_vision, path / f'checkpoint-{index-1}.png', case['input']['text_profile'])
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
            raise ProtocolError('Unknown Colony menu contract')
        contract.validate_input(case['input'])
    initial_hash = fingerprint()
    profiles = {}
    for profile in contract.PROFILES:
        files = dict(previous.ref.text_files(args.assets, 'default'), **base.bundle(args.assets))
        for name, source in inputs.declarations(profile).items():
            installed = [path for path in args.assets.iterdir() if path.is_file() and path.name.lower() == name]
            if len(installed) != 1:
                raise ProtocolError('Missing/ambiguous Colony declared source')
            path = installed[0]
            files[path.name] = previous.patch_terrain(path.read_bytes(), source) if name == 'alphax.txt' else source.encode('ascii')
        profiles[profile] = files
    args.artifacts.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    observer = base.FactionVision()
    vision = shared.TerraformVision()
    menu_vision = shared.glyphs.IngameMenuVision()
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
        if fingerprint() != initial_hash:
            raise ProtocolError('Colony reference observer changed during capture')
        digest = hashlib.sha256(base.arid_map())
        for profile, files in profiles.items():
            digest.update(profile.encode())
            for name, raw in sorted(files.items()):
                digest.update(name.encode() + b'\0' + raw)
        write_response(dict(driver.metadata, adapter_sha256=initial_hash, contract=contract.ALGORITHM,
                            source_profiles_sha256=digest.hexdigest(),
                            fixture_transport='guarded-original-created-save' if shared.saved else 'fresh-wizard',
                            observation='Actual Tab/Tab/MENU/Action/source1/Tab; independently observed row glyphs/geometry and read-only native selection, citizens, stores, unit consumption; city identity/year/companion guards',
                            boundaries='Healthy owned-city Colony Pod only, two synthetic label profiles; no new-city founding, limits, turn income, AI or full Action-menu parity'), results)
    finally:
        if driver:
            driver.close()
        observer.vision.close()
        vision.vision.close()
        menu_vision.close()


if __name__ == '__main__':
    main()
