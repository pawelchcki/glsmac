"""Record actual original Action-menu commands and native effects."""
import argparse
import hashlib
import json
from pathlib import Path
from collections import Counter
import re
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui import unit_menu_orders_contract as contract
from ui import unit_menu_orders_inputs as inputs
from ui import ingame_menu_vision as glyphs
from ui import base_rename_original as rename
from ui.starvation_mineral_original import MineralVision
from ui.vision import VisionError

base = rename.base
ref = rename.ref


def fingerprint():
    digest = hashlib.sha256(rename.fingerprint().encode())
    for module in (contract, inputs, glyphs, contract.presentation, inputs.base_inputs):
        digest.update(Path(module.__file__).read_bytes())
    digest.update(Path(__file__).read_bytes())
    return digest.hexdigest()


def profiles(assets):
    originals = ref.text_files(assets, 'default')
    menu_names = [path.name for path in assets.iterdir() if path.is_file() and path.name.lower() == 'menu.txt']
    if len(menu_names) != 1:
        raise ProtocolError('Expected one installed menu.txt input')
    result = {}
    terrain_paths = [path for path in assets.iterdir() if path.is_file() and path.name.lower() == 'alphax.txt']
    if len(terrain_paths) != 1:
        raise ProtocolError('Expected one installed alphax.txt input')
    for profile in contract.PROFILES:
        files = dict(originals)
        files[menu_names[0]] = inputs.declarations(profile)['menu.txt'].encode('ascii')
        files[terrain_paths[0].name] = patch_terrain(terrain_paths[0].read_bytes(), inputs.declarations(profile)['alphax.txt'])
        result[profile] = files
    return result


def patch_terrain(raw, declaration):
    """Replace only the declared input block, preserving other installed rules."""
    lines = raw.decode('latin1').splitlines(keepends=True)
    starts = [i for i, line in enumerate(lines) if line.strip() == '#TERRAIN']
    if len(starts) != 1:
        raise ProtocolError('Ambiguous installed TERRAIN input block')
    start = starts[0]
    end = next((i for i in range(start + 1, len(lines))
                if re.fullmatch(r'#[A-Z][A-Z0-9_]*', lines[i].strip())), len(lines))
    replacement = declaration.split('#END')[0].replace('\n', '\r\n') + '\r\n'
    return (''.join(lines[:start]) + replacement + ''.join(lines[end:])).encode('latin1')


def click_menu_control(driver, x, y):
    # Keep the pointer over the control while the original dispatches its
    # queued click. Immediate move-away can invalidate a polled hit target;
    # holding the button introduces a separate repeat-input boundary.
    # Always one click, with no outcome-dependent input retries. A fixed
    # hover interval lets the original poll the MENU hit target. Park over
    # blank bottom-bar space to avoid world hover/edge panning between steps.
    edges = (['sleep', '.80', 'mousedown', '1', 'sleep', '.60', 'mouseup', '1']
             if (x, y) == (60, 539) else ['click', '1'])
    subprocess.run(['xdotool', 'mousemove', '--sync', str(x), str(y), *edges,
                    'sleep', '1.0', 'mousemove', '700', '620'],
                   env=driver.env, check=True, timeout=10)


def click_action_row(driver, vision, menu_vision, previous, profile, slot, image_path):
    menu = previous['menu']
    if menu is None or menu['child'] is None or menu['child']['header_index'] != 4:
        raise ProtocolError('Actual Action child absent before row selection')
    label = contract.presentation.normalize(inputs.source_label(profile, slot).replace('&', ''))
    matches = [index for index, row in enumerate(menu['child']['rows']) if row.get('label') == label]
    if len(matches) != 1:
        raise ProtocolError('Declared Action source label lacks one observed row: ' + label)
    # Locate the actual native child rectangle, independently of row counts or
    # desired effects. Twenty-pixel slots are the measured observation geometry
    # also used by the existing independent glyph observer.
    image = vision.Image.open(image_path).convert('RGB')
    pixels = image.load(); left = 140; runs = []
    for y in range(image.height):
        if pixels[left, y] != menu_vision.PURPLE:
            continue
        right = left
        while right < 950 and pixels[right, y] == menu_vision.PURPLE:
            right += 1
        if right - left >= 80:
            runs.append((y, right))
    if not runs:
        raise ProtocolError('Actual Action child rectangle absent')
    right = Counter(end for _, end in runs).most_common(1)[0][0]
    top = min(y for y, end in runs if end == right)
    x = left + min(40, (right - left) // 2)
    y = top + 20 * matches[0] + 10
    if not 0 <= y < image.height:
        raise ProtocolError('Actual Action row lies outside viewport')
    click_menu_control(driver, x, y)


def capture(driver, observer, vision, menu_vision, case, path):
    path.mkdir()
    try:
        native, origin = base.prepare(driver, observer, vision, {'input': {'profile': 'stacked'}}, path, 45)
    except ProtocolError as error:
        # This bounded wizard timeout occurs before the first declared menu
        # action. Context/identity errors and all actual menu failures remain
        # fatal and are never retried.
        if str(error) == 'original citizen-job observation timed out: ' + str(path / 'base-name.png'):
            raise rename.InitialManagementUnavailable(str(error)) from error
        raise
    initial_year = native['turn']
    initial_town = ref.full.city(driver, origin)
    initial_city = initial_town['city']
    if {key: initial_city[key] for key in contract.INITIAL} != case['input']['initial_base']:
        raise ProtocolError('Original menu initial city differs from declared input')
    identity = {key: initial_city[key] for key in ('id', 'name', 'x', 'y')}
    ids = {unit['role']: unit['index'] for unit in native['units']}

    # Establish the complete management panel before returning to the map.
    # Raw fixture state alone does not prove that initial UI setup finished.
    base.raw_key(driver, 'Return')
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        driver.snapshot(path / 'initial-management.png')
        try:
            ref.hud.parse_hud(vision.vision, path / 'initial-management.png')
            break
        except (VisionError, ProtocolError):
            time.sleep(.25)
    else:
        raise rename.InitialManagementUnavailable('Complete initial menu management unavailable')
    base.raw_key(driver, 'Escape')

    def observe(index):
        deadline = time.monotonic() + 30
        previous = None
        last_error = None
        while time.monotonic() < deadline:
            image_path = path / f'checkpoint-{index+1}.png'
            driver.snapshot(image_path)
            image = vision.Image.open(image_path).convert('RGB')
            current = base.native(driver)
            town = ref.full.city(driver, origin)
            city = town['city']
            if (current['turn'] != initial_year or town['global_count'] != initial_town['global_count']
                    or town['owned_count'] != 1 or {key: city[key] for key in identity} != identity
                    or city['nutrients'] != contract.INITIAL['nutrients']
                    or city['minerals'] != contract.INITIAL['minerals']
                    or [unit['role'] for unit in current['units']] != ['scout', 'former', 'colony']
                    or any(unit['index'] != ids[unit['role']] or (unit['x'], unit['y']) != origin
                           for unit in current['units'])):
                raise ProtocolError('Original menu city/unit/year/fixture guard failed')
            try:
                if current['selected'] is None:
                    raise VisionError('Original selected map unit absent')
                if vision.line_at(image, (10, 637, 135, 653)) != base.ROLE_LABEL[current['selected']]:
                    raise VisionError('Actual selected map label absent')
                menu = menu_vision.read(image)
                state = dict(after_action=index, screen='map' if menu is None else 'menu', year_delta=0,
                             selected=current['selected'],
                             base=dict({key: city[key] for key in ('name', 'population', 'workers', 'doctors', 'worked_tiles')},
                                       owned_count=town['owned_count']),
                             units=[{key: unit[key] for key in ('role', 'order_code', 'movement_spent')}
                                    for unit in current['units']], menu=menu)
            except (VisionError, ProtocolError) as error:
                previous = None
                last_error = str(error)
                time.sleep(.25)
                continue
            if state == previous:
                return state
            previous = state
            time.sleep(.3)
        if index == -1:
            raise rename.InitialManagementUnavailable('Complete initial selected map unavailable: ' + str(last_error))
        raise ProtocolError('Original menu checkpoint failed: ' + str(image_path) + '; ' + str(last_error))

    trace = [observe(-1)]
    if trace[0]['menu'] is not None:
        raise ProtocolError('Initial actual map has unexpected menu controls')
    for index, action in enumerate(case['input']['actions']):
        previous = trace[-1]
        if action == 'menu':
            click_menu_control(driver, 60, 539)
        elif isinstance(action, dict) and 'header' in action:
            if previous['menu'] is None:
                raise ProtocolError('Actual original header control absent')
            click_menu_control(driver, 27, 355 + 18 * action['header'])
        elif isinstance(action, dict) and 'row_source' in action:
            click_action_row(driver, vision, menu_vision, previous, case['input']['text_profile'],
                             action['row_source'], path / f'checkpoint-{index}.png')
        elif action == 'tab':
            base.raw_key(driver, 'Tab')
        else:
            raise ProtocolError('Unknown bounded Action-menu input')
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
    initial_hash = fingerprint()
    for case in cases:
        if case['algorithm'] != contract.ALGORITHM:
            raise ProtocolError('Unknown Action-menu algorithm')
        contract.validate_input(case['input'])
    sources = profiles(args.assets)
    args.artifacts.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    observer = base.FactionVision()
    vision = MineralVision()
    menu_vision = glyphs.IngameMenuVision()
    driver = None
    try:
        driver = rename.RenameDriver(args.assets, args.wine, work)
        for path in (driver.work / 'game/maps').iterdir():
            if path.is_file() and path.suffix.lower() == '.mp':
                path.unlink()
        (driver.work / 'game/maps/zzterraform.MP').write_bytes(base.arid_map())
        fixture_files = base.bundle(args.assets)
        rows = []
        for case in cases:
            for attempt in range(2):
                if driver.process and driver.process.poll() is None:
                    driver.process.kill()
                    driver.process.wait(timeout=5)
                files = dict(fixture_files, **sources[case['input']['text_profile']])
                for name, raw in files.items():
                    target = driver.work / 'game' / name
                    if target.is_symlink():
                        target.unlink()
                    target.write_bytes(raw)
                path = work / (case['id'] + ('-setup-retry' if attempt else ''))
                try:
                    output = capture(driver, observer, vision, menu_vision, case, path)
                    break
                except rename.InitialManagementUnavailable:
                    if attempt:
                        raise
                    print('Retrying fresh fixture before any menu action: ' + case['id'], file=sys.stderr, flush=True)
            rows.append(dict(id=case['id'], status='ok', output=output))
            print('Captured original Action-menu command: ' + case['id'], file=sys.stderr, flush=True)
        if fingerprint() != initial_hash:
            raise ProtocolError('Original menu observer changed during capture')
        digest = hashlib.sha256(base.arid_map())
        for profile, files in sources.items():
            digest.update(profile.encode())
            for name, raw in sorted(dict(fixture_files, **files).items()):
                digest.update(name.encode() + b'\0' + raw)
        write_response(dict(driver.metadata, contract=contract.ALGORITHM, adapter_sha256=initial_hash,
                            source_profiles_sha256=digest.hexdigest(),
                            observation='Actual MENU, Action header, observed source-label row click and Tab; independent glyph/context and read-only native unit order/movement/selection guards',
                            boundaries='Six declared healthy Scout Action-menu source-slot sequences; native orders/movement/selection and unchanged city/year guards. No other commands, contexts, hints, accelerators, hover/focus, turn advancement or full-game claims'), rows)
    except BaseException as error:
        (work / 'capture-error.txt').write_text(type(error).__name__ + ': ' + str(error) + '\n')
        raise
    finally:
        if driver:
            driver.close()
        observer.vision.close()
        vision.vision.close()
        menu_vision.close()


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, VisionError, subprocess.SubprocessError) as error:
        print('Original in-game menu capture failed:', error, file=sys.stderr)
        sys.exit(1)
