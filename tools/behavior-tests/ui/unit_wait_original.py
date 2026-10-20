#!/usr/bin/env python3
"""Observe wait-state flags after real original selection controls."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui import unit_selection_original as base
from ui.unit_wait_contract import ALGORITHM, validate_input, validate_output


def fingerprint():
    digest = hashlib.sha256(base.fingerprint().encode())
    for name in ('unit_wait_original.py', 'unit_wait_contract.py'):
        digest.update(Path(__file__).with_name(name).read_bytes())
    return digest.hexdigest()


def output(driver, current, initial):
    memory = base.NativeMemory(driver)
    try:
        flags = {}
        for unit in current['units']:
            raw = memory.read(memory.address(0x00952828) + unit['index'] * 52, 52)
            if base.TYPE_ROLE.get(struct.unpack_from('<h', raw, 10)[0]) != unit['role']:
                raise ProtocolError('Original wait-state unit identity changed')
            # Verified public VEH field layout: state is uint32 at offset 4.
            # This flag is observed from the original, never calculated here.
            flags[unit['role']] = bool(struct.unpack_from('<I', raw, 4)[0] & 2)
        return {'year_delta': current['turn'] - initial, 'selected': current['selected'], 'deferred': flags}
    finally:
        memory.close()


def run_case(driver, observer, vision, case, directory, timeout):
    directory.mkdir()
    current, _ = base.prepare(driver, observer, vision, case, directory, timeout)
    initial = current['turn']; trace = [output(driver, current, initial)]
    for index, action in enumerate(case['input']['actions']):
        current = base.act(driver, vision, current, action, directory / f'{index:02d}-{action}.png', timeout)
        trace.append(output(driver, current, initial))
        (directory / 'trace-progress.json').write_text(json.dumps({'trace': trace}, indent=2) + '\n')
    result = {'trace': trace}; validate_output(result, case['input']['actions'])
    (directory / 'observed.json').write_text(json.dumps(result, indent=2) + '\n')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, required=True); parser.add_argument('--wine', default='wine')
    parser.add_argument('--timeout', type=float, default=45); parser.add_argument('--artifacts', type=Path, required=True)
    args = parser.parse_args(); cases = load_request()['cases']
    for case in cases:
        if case['algorithm'] != ALGORITHM: raise ProtocolError('Unknown unit wait-state contract')
        validate_input(case['input'])
    initial = fingerprint(); inputs = base.bundle(args.assets)
    args.artifacts.mkdir(parents=True, exist_ok=True)
    directory = Path(tempfile.mkdtemp(prefix='capture-', dir=args.artifacts))
    observer = base.FactionVision(); vision = base.FormerVision(); driver = None
    try:
        driver = base.OriginalDriver(args.assets, args.wine, directory)
        for path in (driver.work / 'game/maps').iterdir():
            if path.is_file() and path.suffix.lower() == '.mp': path.unlink()
        (driver.work / 'game/maps/zzterraform.MP').write_bytes(base.arid_map())
        for name, raw in inputs.items(): (driver.work / 'game' / name).write_bytes(raw)
        rows = []
        for case in cases:
            rows.append({'id': case['id'], 'status': 'ok', 'output': run_case(driver, observer, vision, case, directory / case['id'], args.timeout)})
            print('Captured original wait state: ' + case['id'], file=sys.stderr, flush=True)
        if fingerprint() != initial: raise ProtocolError('Wait-state observer changed during capture')
        digest = hashlib.sha256(base.arid_map())
        for name, raw in sorted(inputs.items()): digest.update(name.encode() + b'\0' + raw)
        write_response(dict(driver.metadata, contract=ALGORITHM, adapter_sha256=initial,
                            source_profiles_sha256=digest.hexdigest(),
                            observation='Read-only native Console selection, visible name agreement and actual VEH state bit 0x2 after real W/Tab',
                            fixture='Same fresh three-unit Gaians/Citizen/standard stacked fixture as unit_selection.v1; all ready, Scout selected, pause at end on, tutorials off',
                            units='Boolean original vehicle state bit 0x2 per role; native turn difference',
                            ocr_version=vision.vision.version, ocr_model_sha256=vision.vision.model_sha256), rows)
    finally:
        if driver: driver.close()
        observer.vision.close(); vision.vision.close()


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, ProtocolError, base.VisionError, subprocess.SubprocessError) as error:
        print('Original wait-state capture failed:', error, file=sys.stderr); sys.exit(1)
