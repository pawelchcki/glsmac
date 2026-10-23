#!/usr/bin/env python3
"""Actual Chromium/SDL opening-art probe; requires installed assets and an app runtime.

Use SMAC_ASSETS_DIR and WASM_APP_DIR. OPENING_ART_ARTIFACTS selects the private
screenshot/log directory; NODE selects Node.js. No original assets enter reports.
"""
import json
import os
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, decode_json, load_request, validate_response
from ui.opening_art_contract import ALGORITHM, validate_input, validate_output

ROOT = Path(__file__).resolve().parents[3]


def main():
    try:
        request = load_request()
        for case in request['cases']:
            if case['algorithm'] != ALGORITHM:
                raise ProtocolError('Unsupported rendered opening algorithm: ' + case['algorithm'])
            validate_input(case['input'])
        process = subprocess.run(
            [os.environ.get('NODE', 'node'), str(Path(__file__).with_name('opening_art_browser.mjs'))],
            input=json.dumps(request), text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            cwd=ROOT, timeout=230,
        )
        if process.stderr:
            print(process.stderr, file=sys.stderr, end='')
        if process.returncode:
            raise ProtocolError('Rendered opening worker failed: ' + process.stdout[-2000:])
        response = decode_json(process.stdout)
        results = validate_response(response, request)
        for case in request['cases']:
            if results[case['id']]['status'] == 'ok':
                validate_output(results[case['id']]['output'], case)
        print(json.dumps(response))
        return 0
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        print('Candidate opening artwork failed: ' + str(error), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
