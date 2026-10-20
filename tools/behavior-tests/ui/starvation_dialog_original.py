"""Capture actual original starvation controls in private, fresh installations."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui import base_hud_capture_original as full
from ui import base_resource_hud_original as hud
from ui import starvation_dialog_contract as contract
from ui.dimension_dialog_original import text_files
from ui.vision import VisionError, consensus

base = full.base
DIRECTORY = Path(__file__).resolve().parent


def fingerprint():
    digest = hashlib.sha256(full.fingerprint().encode())
    for name in ('starvation_dialog_original.py', 'starvation_dialog_contract.py', 'base_resource_hud_original.py', 'dimension_dialog_original.py'):
        digest.update((DIRECTORY / name).read_bytes())
    return digest.hexdigest()


def patch_notice(raw, definition):
    lines = raw.decode('latin1').splitlines(keepends=True)
    starts = [i for i, line in enumerate(lines) if line.strip() == '#STARVE']
    if len(starts) != 1: raise ProtocolError('Ambiguous original STARVE block')
    start = starts[0]
    end = next((i for i in range(start + 1, len(lines)) if re.fullmatch(r'#[A-Z][A-Z0-9_]*', lines[i].strip())), len(lines))
    captions = [i for i in range(start + 1, end) if lines[i].startswith('#caption ')]
    body = [i for i in range(start + 1, end) if lines[i].strip() and not lines[i].startswith(('#', ';'))]
    if len(captions) != 1 or len(body) != 2: raise ProtocolError('Unsupported original STARVE structure')
    lines[captions[0]] = '#caption ' + definition['caption'] + '\r\n'
    for index, text in zip(body, definition['lines'], strict=True): lines[index] = text + '\r\n'
    return ''.join(lines).encode('latin1')


def profiles(assets):
    originals = text_files(assets, 'default')
    result = {}
    for profile in contract.PROFILES:
        files = dict(originals)
        for name, raw in originals.items():
            if name.lower() == 'script.txt' and profile in ('common', 'both'):
                files[name] = patch_notice(raw, contract.SOURCE_TEXT['common'])
            if name.lower() == 'xscript.txt' and profile in ('expansion', 'both'):
                files[name] = patch_notice(raw, contract.SOURCE_TEXT['expansion'])
            if name.lower() == 'labels.txt' and profile in ('expansion', 'both'):
                lines = raw.decode('latin1').splitlines(keepends=True)
                starts = [i for i, line in enumerate(lines) if line.strip() == '#LABELS']
                if len(starts) != 1 or lines[starts[0] + 1].strip() != '1131': raise ProtocolError('Unsupported original label table')
                for ordinal, value in contract.EDITED_LABELS.items(): lines[starts[0] + 2 + ordinal] = value + '\r\n'
                files[name] = ''.join(lines).encode('latin1')
        result[profile] = files
    return result


class NoticeVision:
    def __init__(self, vision): self.vision = vision

    def text(self, image, box, black=False, blank=False):
        v = self.vision
        crop = image.crop(box)
        mask = v.Image.new('L', crop.size, 255)
        for y in range(crop.height):
            for x in range(crop.width):
                r, g, b = crop.getpixel((x, y))
                if ((r, g, b) == (0, 0, 0)) if black else (r > 80 and g > 110 and b > 140):
                    mask.putpixel((x, y), 0)
        bounds = mask.point(lambda value: 255 - value).getbbox()
        if bounds is None:
            if blank: return ''
            raise VisionError('No notification glyphs')
        mask = v.ImageOps.expand(mask.crop(bounds), 8, 255)
        return consensus([v.text(mask.resize((mask.width * scale, mask.height * scale), v.Image.Resampling.LANCZOS)).replace('\u2019', "'") for scale in (3, 4, 5)])

    @staticmethod
    def paint(image):
        return tuple(image.getpixel((800, y)) for y in (430, 452))

    def read(self, image, name):
        if image.size != (1024, 768): raise VisionError('Unexpected notification viewport')
        palettes = {((120, 164, 212), (103, 91, 181)): 0, ((103, 91, 181), (120, 164, 212)): 1}
        paint = self.paint(image)
        if paint not in palettes: raise VisionError('Unknown notification selection paint')
        body = ' '.join(filter(None, [self.text(image, box, blank=True) for box in ((386, 289, 841, 308), (386, 309, 841, 331))]))
        if body.count(name.upper()) != 1: raise VisionError('Native city name absent or ambiguous in notification')
        return dict(caption=self.text(image, (175, 258, 845, 281)), body=body.replace(name.upper(), '{BASE}'),
                    choices=[self.text(image, box, black=True) for box in ((184, 421, 838, 439), (184, 443, 838, 460))],
                    selected=palettes[paint], buttons=[self.text(image, box, black=True) for box in ((185, 473, 506, 492), (516, 473, 837, 492))])

    def project(self, image):
        v = self.vision
        crop = image.crop((10, 637, 135, 653))
        mask = v.Image.new('L', crop.size, 255)
        mask.putdata([0 if pixel == (53, 61, 115) else 255 for pixel in crop.getdata()])
        mask = v.ImageOps.expand(mask, 8, 255)
        return consensus([v.text(mask.resize((mask.width * scale, mask.height * scale), v.Image.Resampling.LANCZOS)) for scale in (3, 4, 5)])


def capture_case(driver, observer, vision, case, path):
    path.mkdir()
    native, origin = base.prepare(driver, observer, vision, {'input': {'profile': 'stacked'}}, path, 45)
    initial = native['turn']
    initial_city = full.city(driver, origin)
    if {k: initial_city['city'][k] for k in contract.INITIAL} != case['input']['initial_base']:
        raise ProtocolError('Original initial starvation city differs from declared input')
    identity = {k: initial_city['city'][k] for k in ('id', 'name', 'x', 'y')}
    ids = {u['role']: u['index'] for u in native['units']}
    for index in range(2): native = base.act(driver, vision, native, 'wait', path / f'wait-{index}.png', 45)
    base.raw_key(driver, 'b')
    native = base.settled(driver, vision, path / 'joined.png', 45, initial)
    base.raw_key(driver, 'Return')
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        image_path = path / 'management.png'
        driver.snapshot(image_path)
        try:
            hud.parse_hud(vision.vision, image_path)
            image = vision.Image.open(image_path).convert('RGB')
            if vision.line_at(image, (280, 576, 726, 620)) != identity['name'].upper(): raise VisionError('Management title differs')
            # The current project is an explicitly observed incomplete Formers;
            # this contract does not infer its mineral price or turn algorithm.
            if NoticeVision(vision.vision).project(image) != 'FORMERS': raise VisionError('Original project is not Formers')
            break
        except (VisionError, ProtocolError): time.sleep(.25)
    else: raise ProtocolError('Original management did not fully open')
    base.raw_key(driver, 'Escape')
    native = base.settled(driver, vision, path / 'closed.png', 45, initial)
    for index in range(2): native = base.act(driver, vision, native, 'hold', path / f'held-{index}.png', 45)
    if native['selected'] is not None or any(u['order_code'] != 2 for u in native['units']): raise ProtocolError('Companions not held')
    driver.click(890, 584)
    reader = NoticeVision(vision.vision)

    def observe(index, require_notice=False):
        deadline = time.monotonic() + 45
        previous = None
        while time.monotonic() < deadline:
            image_path = path / f'checkpoint-{index + 1}.png'
            driver.snapshot(image_path)
            image = vision.Image.open(image_path).convert('RGB')
            native = base.native(driver)
            town = full.city(driver, origin)
            c = town['city']
            if native['turn'] > initial + 1 or town['global_count'] != initial_city['global_count'] or town['owned_count'] != 1 or {k: c[k] for k in identity} != identity:
                raise ProtocolError('Starvation city/year identity guard failed')
            if native['turn'] != initial + 1: previous = None; time.sleep(.25); continue
            if [u['role'] for u in native['units']] != ['scout', 'former'] or any(u['index'] != ids[u['role']] or (u['x'], u['y']) != origin for u in native['units']):
                raise ProtocolError('Starvation companions changed identities/positions')
            dialog = None
            try:
                if require_notice:
                    dialog = reader.read(image, identity['name']); screen = 'notice'
                else:
                    # Never treat an outstanding known notification as a map.
                    if reader.paint(image) in (((120, 164, 212), (103, 91, 181)), ((103, 91, 181), (120, 164, 212))):
                        dialog = reader.read(image, identity['name']); screen = 'notice'
                    else:
                        try: title = vision.line_at(image, (280, 576, 726, 620))
                        except VisionError: title = None
                        if title == identity['name'].upper(): hud.parse_hud(vision.vision, image_path); screen = 'base'
                        else:
                            if base.dismiss_research(driver, vision, image): previous = None; time.sleep(.25); continue
                            vision.require_text(image, (786, 575, 1012, 597), 'TURN COMPLETE')
                            screen = 'map'
                state = dict(after_action=index, year_delta=native['turn'] - initial, screen=screen,
                             base=dict({k: c[k] for k in ('population', 'workers', 'doctors', 'worked_tiles')}, owned_count=town['owned_count']),
                             units=[{k: u[k] for k in ('role', 'order_code', 'movement_spent')} for u in native['units']], dialog=dialog)
            except (VisionError, ProtocolError): previous = None; time.sleep(.25); continue
            if state == previous: return state
            previous = state; time.sleep(.3)
        raise ProtocolError('Original starvation checkpoint did not settle: ' + str(image_path))

    trace = [observe(-1, True)]
    confirmed = False
    for index, action in enumerate(case['input']['actions']):
        base.raw_key(driver, {'down': 'Down', 'up': 'Up', 'confirm': 'Return', 'close': 'Escape'}[action])
        if action == 'confirm': confirmed = True
        time.sleep(.5)
        trace.append(observe(index, not confirmed))
        (path / 'trace-progress.json').write_text(json.dumps({'trace': trace}, indent=2) + '\n')
    result = {'trace': trace}
    contract.validate_output(result, case['input']['actions'])
    return result


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--assets', type=Path, required=True)
    p.add_argument('--wine', required=True)
    p.add_argument('--artifacts', type=Path, required=True)
    args = p.parse_args()
    cases = load_request()['cases']
    initial = fingerprint()
    for case in cases:
        if case['algorithm'] != contract.ALGORITHM: raise ProtocolError('Unknown starvation contract')
        contract.validate_input(case['input'])
    sources = profiles(args.assets)
    args.artifacts.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    observer, vision, driver = base.FactionVision(), base.FormerVision(), None
    try:
        driver = base.OriginalDriver(args.assets, args.wine, work)
        for path in (driver.work / 'game/maps').iterdir():
            if path.is_file() and path.suffix.lower() == '.mp': path.unlink()
        (driver.work / 'game/maps/zzterraform.MP').write_bytes(base.arid_map())
        inputs = base.bundle(args.assets)
        rows = []
        for case in cases:
            if driver.process and driver.process.poll() is None: driver.process.kill(); driver.process.wait(timeout=5)
            for name, raw in dict(inputs, **sources[case['input']['text_profile']]).items():
                target = driver.work / 'game' / name
                if target.is_symlink(): target.unlink()
                target.write_bytes(raw)
            output = capture_case(driver, observer, vision, case, work / case['id'])
            rows.append(dict(id=case['id'], status='ok', output=output))
            print('Captured original starvation: ' + case['id'], file=sys.stderr, flush=True)
        if fingerprint() != initial: raise ProtocolError('Starvation observer changed during capture')
        digest = hashlib.sha256(base.arid_map())
        for profile, files in sources.items():
            digest.update(profile.encode())
            for name, raw in sorted(dict(inputs, **files).items()): digest.update(name.encode() + b'\0' + raw)
        write_response(dict(driver.metadata, contract=contract.ALGORITHM, adapter_sha256=initial, source_profiles_sha256=digest.hexdigest(),
                            observation='Real W/W/B, complete Enter/Escape management, H/H, TURN COMPLETE, notification Up/Down/Enter and Escape; independent OCR caption/body/choices/buttons/selection; actual native citizen and companion records with identity/year guards',
                            fixture='Fresh Gaians/Citizen/standard flat arid three-unit stack; declared initial one Doctor, food0/minerals9; visible incomplete Formers project; join and management create the observed two-Doctor pre-notice city',
                            boundaries='First starvation notice only, one owned Headquarters and held companions. Raw nutrient counter, mineral income/price/order, audio, suppression button, Escape on notice, other sources/populations and general economy excluded. Map continuation uses absence of known notice paint/base title plus visible TURN COMPLETE, not year alone.',
                            units='Role/order ordinal and spent movement thirds; native citizens/worked tiles; visible wording uppercase whitespace-normalized with typographic apostrophe folded to ASCII; actual native base-name substitution normalized to {BASE}; three-scale Lanczos OCR consensus'), rows)
    finally:
        if driver: driver.close()
        observer.vision.close(); vision.vision.close()


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, ProtocolError, VisionError, subprocess.SubprocessError) as error:
        print('Original starvation capture failed:', error, file=sys.stderr); sys.exit(1)
