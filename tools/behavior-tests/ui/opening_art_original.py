#!/usr/bin/env python3
"""Fresh original screenshots for bounded opening-backdrop pixel observations."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui.drivers import OriginalDriver
from ui.opening_art_contract import ALGORITHM, validate_input, validate_output
from ui.probe import observe
from ui.vision import MenuVision, VisionError

DIRECTORY = Path(__file__).resolve().parent


def fingerprint():
    digest = hashlib.sha256()
    for name in ['opening_art_original.py', 'opening_art_contract.py', 'drivers.py', 'probe.py', 'vision.py']:
        digest.update((DIRECTORY / name).read_bytes())
    return digest.hexdigest()


def capture(cases, args):
    initial = fingerprint()
    args.artifacts.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    vision = MenuVision(); driver = None
    try:
        driver = OriginalDriver(args.assets.resolve(), args.wine, work)
        results = []
        for case in cases:
            directory = work / case['id']; directory.mkdir()
            driver.reset(); frames = []
            for index in range(len(case['input']['actions']) + 1):
                path = directory / f'{index:02}.png'
                menu, controls = observe(driver, vision, path, 60 if index == 0 else 30, startup=index == 0)
                image = vision.Image.open(path).convert('RGB')
                frame = {'viewport': list(image.size),
                         'pixels': [list(image.getpixel(tuple(point))) for point in case['input']['probes']]}
                frames.append(frame)
                path.with_suffix('.json').write_text(json.dumps({'menu': menu, 'controls': controls}, indent=2)+'\n')
                if index < len(case['input']['actions']):
                    label = case['input']['actions'][index]['choose']
                    matches = [control for control in controls if control['text'] == label]
                    if len(matches) != 1:
                        raise ProtocolError('Opening artwork cannot find actual control: '+label)
                    driver.click(matches[0]['x'], matches[0]['y'])
            output = {'frames': frames}; validate_output(output, case)
            results.append({'id': case['id'], 'status': 'ok', 'output': output})
            print('Captured original opening artwork: '+case['id'], file=sys.stderr, flush=True)
        if fingerprint() != initial:
            raise ProtocolError('Opening artwork observer changed during capture')
        return dict(driver.metadata, contract=ALGORITHM, adapter_sha256=initial,
                    viewport=[1024,768], observation='RGB read directly from original screenshots after actual menu clicks',
                    boundaries='Declared backdrop pixel coordinates only; no full-frame, typography, chrome, animation, intro, map or first-round parity claim',
                    ocr_version=vision.version, ocr_model_sha256=vision.model_sha256), results
    finally:
        if driver: driver.close()
        vision.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--wine', required=True)
    parser.add_argument('--artifacts', type=Path, required=True)
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported: validate_input(case['input'])
    metadata, rows = capture(supported, args) if supported else ({'name':'opening-art-original','kind':'adapter'}, [])
    iterator = iter(rows)
    write_response(metadata, [next(iterator) if case['algorithm'] == ALGORITHM else
                             {'id':case['id'],'status':'unsupported','reason':'unknown opening artwork contract'} for case in cases])


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, ProtocolError, VisionError) as error:
        print('Original opening artwork failed: '+str(error), file=sys.stderr); sys.exit(1)
