"""Record actual original menus and orders after initial native Tab navigation."""
import argparse
import fcntl
import os
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response, canonical, decode_json, validate_response
from ui import unit_menu_orders_original as previous
from ui.vision import VisionError, consensus
from ui import unit_menu_context_contract as contract
from ui import unit_menu_context_inputs as inputs


# The wizard filename is fixture transport, outside the recorded game contract.
# PLANET avoids the ambiguous lowercase zz glyphs that OCR read as digits. Its
# exact visible filename is still required; all native world/context guards stay.
class ContextVision(previous.MineralVision):
    def map_choice(self, image):
        crop = image.convert('RGB').crop((391, 217, 510, 233))
        mask = self.Image.new('L', crop.size, 255)
        mask.putdata([0 if max(pixel) < 95 else 255 for pixel in crop.getdata()])
        mask = self.vision.ImageOps.expand(mask, 8, 255)
        readings = [self.vision.text(mask.resize((mask.width * scale, mask.height * scale), self.Image.Resampling.LANCZOS)).replace(' ', '')
                    for scale in (2, 3, 4)]
        if consensus(readings) != 'PLANET.MP':
            raise VisionError('Declared original fixture filename not observed: ' + repr(readings))
        return True


# One real press/release with fixed timing. The old 12 ms xdotool pulse left
# one final Tab unconsumed in the retained repeat; never retry based on selection.
_original_raw_key = previous.base.raw_key

def paced_key(driver, key):
    # One fixed physical press/release, also for wizard setup. Never synthesize
    # a second key based on the selected faction, menu or resulting unit state.
    subprocess.run(['xdotool', 'keydown', '--clearmodifiers', key, 'sleep', '.18',
                    'keyup', key, 'sleep', '.20'], env=driver.env, check=True, timeout=10)

class ContextDriver(previous.rename.RenameDriver):
    def __init__(self, *args, **kwargs):
        # The retained two-prefix attempt timed out during concurrent wineboot;
        # isolated startup completed. Serialize OS bootstrap only, then allow two
        # independent game workers. No observed gameplay outcome controls retries.
        lock_path = os.environ.get('GLSMAC_CONTEXT_BOOTSTRAP_LOCK')
        if not lock_path:
            super().__init__(*args, **kwargs)
            return
        with open(lock_path, 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            try:
                super().__init__(*args, **kwargs)
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)

    def click(self, x, y):
        # The retained faction screenshot still showed the old roster after
        # the .20s pointer dwell. Use the same longer physical dwell proven
        # on the menu headers; no result-dependent reclicks.
        paced_menu_click(self, x, y, park=(10, 10))

    def key(self, key):
        aliases = {'Escape':'Escape', 'Enter':'Return', 'ArrowUp':'Up',
                   'ArrowDown':'Down', 'Home':'Home', 'End':'End'}
        paced_key(self, aliases[key])

def paced_menu_click(driver, x, y, park=(700, 620)):
    # The retained header-click trace left the parent visible with no child.
    # Fixed physical edges for every menu control; no reclick or desired-state
    # wait. Row identity/rectangle still comes from the actual preceding image.
    subprocess.run(['xdotool', 'mousemove', '--sync', str(x), str(y), 'sleep', '.80',
                    'mousedown', '1', 'sleep', '.18', 'mouseup', '1',
                    'sleep', '1.0', 'mousemove', str(park[0]), str(park[1])],
                   env=driver.env, check=True, timeout=10)

previous.click_menu_control = paced_menu_click
previous.base.raw_key = paced_key

def parallel_capture(args, cases, initial_hash):
    # Exactly two independent app workers; each retains a private Wine prefix,
    # starts a fresh original process per trace and keeps complete child receipts.
    groups = [cases[:6], cases[6:]]
    def capture_group(item):
        index, group = item
        root = args.artifacts / ('worker-' + str(index))
        root.mkdir(parents=True, exist_ok=True)
        request = dict(version=1, cases=group)
        command = [sys.executable, str(Path(__file__).resolve()), '--child', '--assets', str(args.assets),
                   '--wine', args.wine, '--artifacts', str(root)]
        args.artifacts.mkdir(parents=True, exist_ok=True)
        child_env = dict(os.environ, GLSMAC_CONTEXT_BOOTSTRAP_LOCK=str(args.artifacts / 'wine-bootstrap.lock'))
        result = subprocess.run(command, input=canonical(request), text=True, capture_output=True, timeout=580, env=child_env)
        (root / 'request.json').write_text(canonical(request))
        (root / 'response.json').write_text(result.stdout)
        (root / 'stderr.log').write_text(result.stderr)
        if result.returncode:
            raise ProtocolError('Original context worker failed: ' + str(root) + '; ' + result.stderr[-1500:])
        response = decode_json(result.stdout)
        validate_response(response, request)
        return response
    with ThreadPoolExecutor(max_workers=2) as workers:
        responses = list(workers.map(capture_group, enumerate(groups)))
    if fingerprint() != initial_hash or responses[0]['implementation'] != responses[1]['implementation']:
        raise ProtocolError('Original context worker metadata/source changed')
    rows = {row['id']: row for response in responses for row in response['results']}
    if len(rows) != len(cases):
        raise ProtocolError('Incomplete original context workers')
    metadata = dict(responses[0]['implementation'], recording_workers=2)
    write_response(metadata, [rows[case['id']] for case in cases])


def fingerprint():
    digest = hashlib.sha256(previous.fingerprint().encode())
    for module in (contract, inputs):
        digest.update(Path(module.__file__).read_bytes())
    digest.update(Path(__file__).read_bytes())
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--wine', required=True)
    parser.add_argument('--artifacts', type=Path, required=True)
    parser.add_argument('--child', action='store_true')
    args = parser.parse_args()
    cases = load_request()['cases']
    initial_hash = fingerprint()
    for case in cases:
        if case['algorithm'] != contract.ALGORITHM:
            raise ProtocolError('Unknown Action-menu context algorithm')
        contract.validate_input(case['input'])
    if not args.child and len(cases) > 6:
        parallel_capture(args, cases, initial_hash)
        return
    sources = previous.profiles(args.assets)
    args.artifacts.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    observer = previous.base.FactionVision()
    vision = ContextVision()
    menu_vision = previous.glyphs.IngameMenuVision()
    driver = None
    try:
        driver = ContextDriver(args.assets, args.wine, work)
        for path in (driver.work / 'game/maps').iterdir():
            if path.is_file() and path.suffix.lower() == '.mp':
                path.unlink()
        (driver.work / 'game/maps/PLANET.MP').write_bytes(previous.base.arid_map())
        fixture_files = previous.base.bundle(args.assets)
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
                    output = previous.capture(driver, observer, vision, menu_vision, case, path)
                    break
                except previous.rename.InitialManagementUnavailable:
                    if attempt:
                        raise
                    print('Retrying fresh fixture before any context action: ' + case['id'], file=sys.stderr, flush=True)
            contract.validate_output(output, case['input']['actions'])
            rows.append(dict(id=case['id'], status='ok', output=output))
            print('Captured original Action-menu context: ' + case['id'], file=sys.stderr, flush=True)
        if fingerprint() != initial_hash:
            raise ProtocolError('Original context observer changed during capture')
        digest = hashlib.sha256(previous.base.arid_map())
        for profile, files in sources.items():
            digest.update(profile.encode())
            for name, raw in sorted(dict(fixture_files, **files).items()):
                digest.update(name.encode() + b'\0' + raw)
        write_response(dict(driver.metadata, contract=contract.ALGORITHM, adapter_sha256=initial_hash,
                            source_profiles_sha256=digest.hexdigest(),
                            observation='Actual initial Tab navigation, MENU, Action source-label row click and Tab; independent glyph/context and read-only native unit guards',
                            boundaries='Twelve declared stacked healthy unspent unit contexts, native orders/movement/selection and unchanged city/year. No work cancellation, other commands, contexts or turn advancement'), rows)
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
        print('Original Action-menu context capture failed:', error, file=sys.stderr)
        sys.exit(1)
