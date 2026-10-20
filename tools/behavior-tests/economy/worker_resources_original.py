#!/usr/bin/env python3
"""Execute original crop/mine/energy routines on declared non-base land tiles."""
import argparse
import hashlib
from pathlib import Path
import struct
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import original
from protocol import ProtocolError, load_request, write_response
from economy.worker_resources_contract import ALGORITHM, PROFILES, IMPROVEMENTS, validate_input, validate_output

DIRECTORY = Path(__file__).resolve().parent
DEPENDENCIES = original.BASE_RESOURCE_DEPENDENCIES + ((0x005B9F20, 0x005B9F89),)


def fingerprint():
    digest = hashlib.sha256()
    for path in (DIRECTORY / 'worker_resources_original.py', DIRECTORY / 'worker_resources_contract.py',
                 DIRECTORY.parent / 'original.py', DIRECTORY.parent / 'protocol.py'):
        digest.update(path.read_bytes())
    return digest.hexdigest()


def fixture(data):
    profile = PROFILES[data['profile']]
    base = dict(faction_id=data['faction_id'], base_id=0, x=data['x'], y=data['y'],
                land=True, river=False, headquarters=False, recycling_tanks=False)
    result = list(original.OriginalOracle.base_square_fixture(base))
    offset = (data['y'] * 2 + data['x'] // 2) * 44
    for index, (address, raw) in enumerate(result):
        if address == 0x009F0000:
            tiles = bytearray(raw)
            tiles[offset] = 3 * 32 + data['rainfall'] * 8
            tiles[offset + 5] = data['rockiness'] << 6
            struct.pack_into('<I', tiles, offset + 8, IMPROVEMENTS[data['improvement']])
            result[index] = (address, bytes(tiles))
        elif address == 0x0097D040:
            bases = bytearray(raw)
            # Query a worker square, never the base center. The otherwise empty
            # context base provides an explicit facility/social context.
            opposite = 2 if data['x'] == 0 else 0
            struct.pack_into('<hh', bases, 0, opposite, opposite)
            result[index] = (address, bytes(bases))
    technology = original.OriginalOracle.technology_fixture([{
        'id': 0, 'prerequisites': [-1, -1],
        'owners': (1 << data['faction_id']) if data['cap_tech_owned'] else 0,
    }])
    result.extend((
        (0x00945F80, struct.pack('<iii', *profile['forest'])),
        (0x00945FA0, struct.pack('<i', profile['farm_nutrients'])),
        (0x0094975C, struct.pack('<ii', profile['mine_without_road_limit'], profile['mine_nutrients'])),
        # One declared synthetic technology independently gates all three caps.
        (0x00949784, struct.pack('<iii', 0, 0, 0)),
        (0x0090E998, struct.pack('<i', 0)),  # per-query terraform-reduction scratch
    ))
    result.extend(technology)
    return tuple(result)


def probe(oracle, data):
    validate_input(data)
    arguments = (data['faction_id'], 0, data['x'], data['y'], 0)
    fields = fixture(data)
    result = {resource: oracle.execute(original.BASE_SQUARE_RESOURCES, arguments, fields, function=function,
                                      dependencies=DEPENDENCIES,
                                      mutable=((original.BASE_RESOURCE_CACHE, original.BASE_RESOURCE_CACHE + 4),
                                               (0x0090E998, 0x0090E99C)),
                                      allow_argument_writes=True)
              for resource, function in original.BASE_RESOURCE_FUNCTIONS.items()}
    validate_output(result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe', type=Path, required=True)
    args = parser.parse_args()
    cases = load_request()['cases']
    for case in cases:
        if case['algorithm'] == ALGORITHM:
            validate_input(case['input'])
    initial = fingerprint()
    oracle = original.OriginalOracle(original.load_image(args.exe))
    rows = [{'id': case['id'], 'status': 'ok', 'output': probe(oracle, case['input'])}
            if case['algorithm'] == ALGORITHM else
            {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown land-worker resource contract'} for case in cases]
    if fingerprint() != initial:
        raise ProtocolError('land-worker observer changed during capture')
    metadata = oracle.metadata((original.BASE_SQUARE_RESOURCES,))
    metadata.update(name='smacx-original-land-worker-resources', contract=ALGORITHM, adapter_sha256=initial,
                    fixture='4x4 map; one non-base land tile; empty context base elsewhere; no bonus, river, fungus, facilities, economy rating, events or projects',
                    rules='Explicit default/altered forest, farm and mine inputs; synthetic technology zero gates all three yield caps',
                    dependencies=[{'start': hex(start), 'end': hex(end)} for start, end in DEPENDENCIES])
    write_response(metadata, rows)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, original.ProbeError, ProtocolError) as error:
        print('Original land-worker resource probe failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
