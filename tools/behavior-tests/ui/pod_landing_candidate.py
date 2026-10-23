#!/usr/bin/env python3
"""Optional real-browser landing replay using privately installed source frames."""
import json
import os
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, decode_json, load_request, validate_response
from ui.pod_landing_contract import ALGORITHM, FRAME_SAMPLES, validate_input, validate_output
from ui.pod_landing_vision import templates, locate
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]


def observe(directory, assets, raw):
    pending = templates(assets / 'drop_pod.flc', FRAME_SAMPLES)
    found = {}
    order = []
    for capture_index, path in enumerate(sorted(directory.glob('video-*.png'))):
        with Image.open(path) as image:
            for index, anchors in list(pending.items()):
                origin = locate(image, anchors)
                if origin is not None:
                    found[index] = (origin, capture_index)
                    order.append(index)
                    del pending[index]
    frames = []
    if FRAME_SAMPLES[0] in found:
        first_x = found[FRAME_SAMPLES[0]][0][0]
        frames = [dict(index=index, motion_x=(found[index][0][0] > first_x) - (found[index][0][0] < first_x)) for index in order]
    first_name = raw['first_name_capture']
    after = bool(found) and first_name is not None and first_name > max(value[1] for value in found.values())
    completed = (raw['failure'] is None and not pending and order == list(FRAME_SAMPLES)
                 and [phase['phase'] for phase in raw['phases']] == ['planetfall', 'landing', 'first-base-name'] and after)
    return dict(phases=raw['phases'], frames=frames, name_after_animation=after, completed=completed,
                failure=None if completed else raw['failure'] or 'Actual rendered landing trace incomplete: missing frames ' + str(sorted(pending)))


def main():
    request = load_request()
    for case in request['cases']:
        if case['algorithm'] != ALGORITHM:
            raise ProtocolError('Unsupported pod landing algorithm')
        validate_input(case['input'])
    assets = Path(os.environ['SMAC_ASSETS_DIR'])
    artifacts = Path(os.environ.get('POD_LANDING_ARTIFACTS', ROOT / 'tools/wasm-tests/build/artifacts/pod-landing'))
    process = subprocess.run([os.environ.get('NODE', 'node'), str(Path(__file__).with_name('pod_landing_browser.mjs'))],
                             input=json.dumps(request), text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             cwd=ROOT, timeout=240)
    if process.stderr:
        print(process.stderr, file=sys.stderr, end='')
    if process.returncode:
        raise ProtocolError('Rendered landing worker failed: ' + process.stdout[-2000:])
    response = decode_json(process.stdout)
    results = validate_response(response, request)
    capture_root = Path(response['implementation']['capture_root']).resolve()
    if capture_root.parent != artifacts.resolve() or not capture_root.name.startswith('run-'):
        raise ProtocolError('Browser captures must belong to this configured artifact root')
    for case in request['cases']:
        result = results[case['id']]
        if result['status'] == 'ok':
            result['output'] = observe(capture_root / case['id'], assets, result['output'])
            validate_output(result['output'], case)
    print(json.dumps(response))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
        print('Candidate landing failed: ' + str(error), file=sys.stderr)
        sys.exit(2)
