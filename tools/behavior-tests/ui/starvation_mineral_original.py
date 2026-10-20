"""Record mineral stores through actual original controls in fresh games."""
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
from ui import base_hud_capture_original as full
from ui import base_resource_hud_original as hud
from ui.starvation_dialog_original import NoticeVision, fingerprint as notice_fingerprint
from ui.vision import VisionError
from ui import starvation_mineral_contract as contract

base = full.base


class MineralVision(base.FormerVision):
    def wait(self, driver, reader, path, timeout):
        if path.name != 'preferences.png':
            return super().wait(driver, reader, path, timeout)
        # The shared setup can toggle F7 while its prior window is closing.
        # Recover only the independently identified Social Engineering panel;
        # require the actual selected-unit map before opening preferences again.
        deadline = time.monotonic() + timeout
        previous = None
        recovered = False
        while time.monotonic() < deadline:
            driver.snapshot(path)
            image = self.Image.open(path).convert('RGB')
            try:
                result = reader(image)
                if result == previous: return result
                previous = result
            except (VisionError, OSError, ValueError):
                previous = None
                if not recovered:
                    try: self.require_text(image, (265, 575, 760, 605), 'SOCIAL ENGINEERING')
                    except VisionError: pass
                    else:
                        base.raw_key(driver, 'Escape')
                        base.settled(driver, self, path.with_name('preferences-map-recovery.png'), min(15, timeout), 1)
                        base.raw_key(driver, 'ctrl+p')
                        recovered = True
            time.sleep(.15)
        raise ProtocolError('Original preferences did not settle: ' + str(path))


def fingerprint():
    digest = hashlib.sha256(notice_fingerprint().encode())
    digest.update(Path(__file__).read_bytes())
    digest.update(Path(contract.__file__).read_bytes())
    return digest.hexdigest()


def capture(driver, observer, vision, case, path):
    path.mkdir()
    native, origin = base.prepare(driver, observer, vision, {'input': {'profile': 'stacked'}}, path, 45)
    initial = native['turn']
    town = full.city(driver, origin)
    city = town['city']
    if {key: city[key] for key in contract.INITIAL} != case['input']['initial_base']:
        raise ProtocolError('Initial mineral context differs from input')
    identity = {key: city[key] for key in ('id', 'name', 'x', 'y')}
    unit_ids = {unit['role']: unit['index'] for unit in native['units']}
    city_count = town['global_count']
    starving = case['input']['mode'] == 'starvation'
    roles = ['scout', 'former'] if starving else ['scout', 'former', 'colony']
    for index in range(2): native = base.act(driver, vision, native, 'wait', path / f'wait-{index}.png', 45)
    if starving:
        base.raw_key(driver, 'b')
        native = base.settled(driver, vision, path / 'joined.png', 45, initial)
    reader = NoticeVision(vision.vision)
    base.raw_key(driver, 'Return')
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        image_path = path / 'management.png'
        driver.snapshot(image_path)
        try:
            hud.parse_hud(vision.vision, image_path)
            image = vision.Image.open(image_path).convert('RGB')
            if vision.line_at(image, (280, 576, 726, 620)) != identity['name'].upper(): raise VisionError('Management title differs')
            if reader.project(image) != 'FORMERS': raise VisionError('Observed project is not Formers')
            break
        except (VisionError, ProtocolError): time.sleep(.25)
    else: raise ProtocolError('Management did not fully open')
    base.raw_key(driver, 'Escape')
    native = base.settled(driver, vision, path / 'closed.png', 45, initial)
    for index in range(len(roles)):
        native = base.act(driver, vision, native, 'hold', path / f'held-{index}.png', 45)

    def state(stage):
        current = base.native(driver)
        town = full.city(driver, origin)
        c = town['city']
        if ({key: c[key] for key in identity} != identity or town['global_count'] != city_count
                or town['owned_count'] != 1 or current['turn'] not in (initial, initial + 1)
                or current['selected'] is not None or [u['role'] for u in current['units']] != roles):
            raise ProtocolError('Mineral city/unit context changed')
        if any(u['index'] != unit_ids[u['role']] or (u['x'], u['y']) != origin
               or u['order_code'] != 2 or u['movement_spent'] != 0 for u in current['units']):
            raise ProtocolError('Mineral companions changed')
        return dict(stage=stage, year_delta=current['turn'] - initial,
                    **{key: c[key] for key in ('population', 'workers', 'doctors', 'worked_tiles', 'minerals')},
                    units=[{key: u[key] for key in ('role', 'order_code', 'movement_spent')} for u in current['units']])

    trace = [state('before-turn')]
    driver.click(890, 584)

    def settled(stage, notice=False, selected=None):
        deadline = time.monotonic() + 45
        previous = None
        while time.monotonic() < deadline:
            image_path = path / (stage + ('-selected' if selected is not None else '') + '.png')
            driver.snapshot(image_path)
            image = vision.Image.open(image_path).convert('RGB')
            row = state(stage)
            if row['year_delta'] != 1: previous = None; time.sleep(.25); continue
            try:
                if notice:
                    observed = reader.read(image, identity['name'])
                    if observed['selected'] != (0 if selected is None else selected): raise VisionError('Notification choice differs')
                else:
                    if reader.paint(image) in (((120, 164, 212), (103, 91, 181)), ((103, 91, 181), (120, 164, 212))): raise VisionError('Notification still pending')
                    try: title = vision.line_at(image, (280, 576, 726, 620))
                    except VisionError: title = None
                    if title == identity['name'].upper(): raise VisionError('Management remains open')
                    if base.dismiss_research(driver, vision, image): previous = None; time.sleep(.25); continue
                    vision.require_text(image, (786, 575, 1012, 597), 'TURN COMPLETE')
            except (VisionError, ProtocolError): previous = None; time.sleep(.25); continue
            if row == previous: return row
            previous = row; time.sleep(.3)
        raise ProtocolError('Mineral checkpoint did not settle: ' + stage)

    if starving:
        trace.append(settled('notice', notice=True))
        base.raw_key(driver, 'Down')
        settled('notice', notice=True, selected=1)
        base.raw_key(driver, 'Return')
    trace.append(settled('after-turn'))
    output = dict(trace=trace)
    contract.validate_output(output, case['input']['mode'])
    (path / 'trace.json').write_text(json.dumps(output, indent=2) + '\n')
    return output


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--assets', type=Path, required=True)
    p.add_argument('--wine', required=True)
    p.add_argument('--artifacts', type=Path, required=True)
    args = p.parse_args()
    cases = load_request()['cases']
    initial = fingerprint()
    for case in cases:
        if case['algorithm'] != contract.ALGORITHM: raise ProtocolError('Unknown mineral contract')
        contract.validate_input(case['input'])
    args.artifacts.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    observer, vision, driver = base.FactionVision(), MineralVision(), None
    try:
        driver = base.OriginalDriver(args.assets, args.wine, work)
        for path in (driver.work / 'game/maps').iterdir():
            if path.is_file() and path.suffix.lower() == '.mp': path.unlink()
        (driver.work / 'game/maps/zzterraform.MP').write_bytes(base.arid_map())
        inputs = base.bundle(args.assets)
        for name, raw in inputs.items():
            target = driver.work / 'game' / name
            if target.is_symlink(): target.unlink()
            target.write_bytes(raw)
        rows = []
        for case in cases:
            if driver.process and driver.process.poll() is None: driver.process.kill(); driver.process.wait(timeout=5)
            output = capture(driver, observer, vision, case, work / case['id'])
            rows.append(dict(id=case['id'], status='ok', output=output))
            print('Captured original mineral credit: ' + case['id'], file=sys.stderr, flush=True)
        if fingerprint() != initial: raise ProtocolError('Mineral observer changed during capture')
        digest = hashlib.sha256(base.arid_map())
        for name, raw in sorted(inputs.items()): digest.update(name.encode() + b'\0' + raw)
        write_response(dict(driver.metadata, contract=contract.ALGORITHM, adapter_sha256=initial, source_profiles_sha256=digest.hexdigest(),
                            observation='Actual W/W, optional B, complete Enter/Escape management, held units, TURN COMPLETE and guarded Proceed; read-only native mineral/citizen/year/unit checkpoints with full HUD/project and map guards',
                            fixture='Fresh independent Gaians/Citizen/standard flat arid games; declared one Doctor, food0/minerals9 and visible incomplete Formers project',
                            boundaries='One income turn only; production price/completion, nutrient-counter meaning, general economy/starvation rules, suppression and other notification sources excluded',
                            units='Native mineral accumulator integers, citizen counts, native order ordinals and movement spent in thirds'), rows)
    finally:
        if driver: driver.close()
        observer.vision.close(); vision.vision.close()


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, ProtocolError, VisionError, subprocess.SubprocessError) as error:
        print('Original mineral capture failed:', error, file=sys.stderr); sys.exit(1)
