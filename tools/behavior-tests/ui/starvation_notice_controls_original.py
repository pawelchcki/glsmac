"""Capture first-notice controls in fresh original-game fixtures."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui import starvation_dialog_original as ref
from ui.starvation_mineral_original import MineralVision, fingerprint as mineral_fingerprint
from ui.vision import VisionError
from ui import starvation_notice_controls_contract as contract

base = ref.base
ALGORITHM = contract.ALGORITHM


def fingerprint():
    return hashlib.sha256(mineral_fingerprint().encode() + Path(__file__).read_bytes() + Path(contract.__file__).read_bytes()).hexdigest()


def capture(driver, observer, vision, case, path):
    data = case['input']
    setup = dict(case, input=dict(data, actions=[]))
    output = ref.capture_case(driver, observer, vision, setup, path)
    native = base.native(driver); origin = native['units'][0]['x'], native['units'][0]['y']
    town = ref.full.city(driver, origin); name = town['city']['name']; initial_year = native['turn'] - 1
    identity = {key: town['city'][key] for key in ('id', 'name', 'x', 'y')}
    unit_ids = {unit['role']: unit['index'] for unit in native['units']}
    count = town['global_count']; reader = ref.NoticeVision(vision.vision)

    def observe(index):
        deadline = time.monotonic() + 45; previous = None
        while time.monotonic() < deadline:
            image_path = path / f'control-{index}.png'; driver.snapshot(image_path)
            image = vision.Image.open(image_path).convert('RGB')
            current = base.native(driver); town = ref.full.city(driver, origin); c = town['city']
            if (current['turn'] != initial_year + 1 or town['owned_count'] != 1 or town['global_count'] != count
                    or {key: c[key] for key in identity} != identity or [u['role'] for u in current['units']] != ['scout', 'former']
                    or any(u['index'] != unit_ids[u['role']] or (u['x'], u['y']) != origin for u in current['units'])):
                raise ProtocolError('Notice-control city/unit/year guard failed')
            dialog = None
            try:
                if reader.paint(image) in (((120, 164, 212), (103, 91, 181)), ((103, 91, 181), (120, 164, 212))):
                    dialog = reader.read(image, name); screen = 'notice'
                else:
                    try: title = vision.line_at(image, (280, 576, 726, 620))
                    except VisionError: title = None
                    if title == name.upper(): ref.hud.parse_hud(vision.vision, image_path); screen = 'base'
                    else:
                        if base.dismiss_research(driver, vision, image): previous = None; time.sleep(.25); continue
                        vision.require_text(image, (786, 575, 1012, 597), 'TURN COMPLETE'); screen = 'map'
                state = dict(after_action=index, year_delta=current['turn'] - initial_year, screen=screen,
                             base=dict({key: c[key] for key in ('population', 'workers', 'doctors', 'worked_tiles')}, owned_count=town['owned_count']),
                             units=[{key: u[key] for key in ('role', 'order_code', 'movement_spent')} for u in current['units']], dialog=dialog)
            except (VisionError, ProtocolError): previous = None; time.sleep(.25); continue
            if state == previous: return state
            previous = state; time.sleep(.3)
        raise ProtocolError('Notice-control checkpoint did not settle: ' + str(image_path))

    for index, action in enumerate(data['actions']):
        if action == 'suppress': driver.click(350, 482)
        else: base.raw_key(driver, {'down': 'Down', 'escape': 'Escape', 'shift-escape': 'shift+Escape'}[action])
        output['trace'].append(observe(index))
        (path / 'controls-trace.json').write_text(json.dumps(output, indent=2) + '\n')
    contract.validate_output(output, data['actions'])
    return output


def main():
    p = argparse.ArgumentParser(); p.add_argument('--artifacts', type=Path, required=True)
    p.add_argument('--assets', type=Path, required=True); p.add_argument('--wine', required=True); args = p.parse_args()
    cases = load_request()['cases']; initial = fingerprint()
    for case in cases:
        if case['algorithm'] != ALGORITHM: raise ProtocolError('Unknown notice-controls algorithm')
        contract.validate_input(case['input'])
    args.artifacts.mkdir(parents=True, exist_ok=True); work = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    assets = args.assets
    observer, vision, driver = base.FactionVision(), MineralVision(), None
    try:
        driver = base.OriginalDriver(assets, args.wine, work)
        for path in (driver.work / 'game/maps').iterdir():
            if path.is_file() and path.suffix.lower() == '.mp': path.unlink()
        (driver.work / 'game/maps/zzterraform.MP').write_bytes(base.arid_map())
        inputs = base.bundle(assets)
        for name, raw in inputs.items():
            target = driver.work / 'game' / name
            if target.is_symlink(): target.unlink()
            target.write_bytes(raw)
        rows = []
        for case in cases:
            if driver.process and driver.process.poll() is None:
                driver.process.kill(); driver.process.wait(timeout=5)
            rows.append(dict(id=case['id'], status='ok', output=capture(driver, observer, vision, case, work / case['id'])))
            print('Captured original notice controls: ' + case['id'], file=sys.stderr, flush=True)
        if fingerprint() != initial: raise ProtocolError('Notice-control observer changed during capture')
        digest = hashlib.sha256(base.arid_map())
        for name, raw in sorted(inputs.items()): digest.update(name.encode() + b'\0' + raw)
        write_response(dict(driver.metadata, contract=ALGORITHM, adapter_sha256=initial, source_profiles_sha256=digest.hexdigest(),
                            observation='Actual original W/W/B, management Enter/Escape, H/H, TURN COMPLETE and notice Escape/Down/Shift+Escape/suppression click; visible full HUD/map/notice and read-only native context guards',
                            boundaries='First owned two-Doctor notice only; suppression immediate activation, not future preference behavior; raw nutrients, minerals, project cost/completion, artwork/audio and other modifier combinations excluded'), rows)
    finally:
        if driver: driver.close()
        observer.vision.close(); vision.vision.close()


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, ProtocolError, VisionError) as error:
        print('Original notice-controls capture failed:', error, file=sys.stderr); sys.exit(1)
