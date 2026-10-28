"""Offline static census acceptance. Actual native execution is a separate gate.

No movement/pixel/original oracle. Exact retained JSON is decoded in Python so
uint64 transport, Native Float types, signed zero and duplicate keys survive.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
from protocol import ProtocolError, canonical, decode_json
from state_trace import terrain_observation, unit_body_census as census

require = census.require
SCHEMA = 'application.unit-body-census-observation.v1'
FATAL = re.compile(r'UB_UNSUPPORTED|UB_ERROR|Unhandled exception|Uncaught|Unsupported image format|'
                   r'Assertion failed|Aborted\(|RuntimeError:|(?:worker|Pthread[^\n]*) sent an error!|\[Error\]', re.I)


def parse(log):
    require(type(log) is str and FATAL.search(log) is None, 'fatal/incomplete native observation')
    events, checkpoints, reads, result, order = [], [], [], [], []
    for line in log.splitlines():
        match = re.fullmatch(r'\s*(?:\[[^\]]+\]\s*)?UB_(EVENT|CHECKPOINT|CENSUS|RESULT)\|(.+)', line)
        if not match:
            continue
        kind, payload = match.groups()
        row = decode_json(payload)
        require(type(row) is dict, 'observation row must be an object')
        require(not result, 'observation after final result')
        if kind == 'EVENT':
            require(not checkpoints, 'native event occurred during static read boundary')
            events.append(row)
        elif kind == 'CHECKPOINT':
            checkpoints.append(row); order.append(('checkpoint', row.get('label')))
        elif kind == 'CENSUS':
            reads.append(row); order.append(('census', row.get('ordinal')))
        else:
            result.append(row); order.append(('result', None))
    require(order == [('checkpoint', 'before'), ('census', 1), ('census', 2),
                      ('checkpoint', 'after'), ('result', None)], 'missing/reordered/duplicate read boundary')
    require(len(result) == 1, 'missing sole final result')
    require(result[0].get('events') == events, 'final event prefix differs from emitted native events')
    for checkpoint in checkpoints:
        label = checkpoint.get('label')
        census.fields(checkpoint, {'label', 'state', 'world', 'native_unit_scalars'})
        require(checkpoint['state'] == result[0].get(label), 'final state replaced immediate checkpoint')
    return {'result': result[0], 'checkpoints': checkpoints, 'reads': reads}


def _world(checkpoint):
    world = checkpoint['world']
    terrain_observation.validate_snapshot(world)
    require(world['width'] == 16 and world['height'] == 16 and len(world['players']) == 7 and
            len(world['units']) == 9 and len(world['bases']) == 7 and
            len(world['terrain_trace']['tiles']) == 128, 'full declared native world missing')
    owners = {row['id']: row['raw_id'] for row in world['players']}
    require(all(type(value) is int and value >= 0 for value in owners.values()), 'wrong native owner type')
    for owner in owners:
        require(any(row['owner'] == owner for row in world['units']) and
                any(row['owner'] == owner for row in world['bases']), 'owner inventory omitted')
    rows = checkpoint['native_unit_scalars']
    require(type(rows) is list and len(rows) == 9, 'full typed scalar inventory missing')
    scalars = {}
    for row in rows:
        census.fields(row, {'unit_id', 'owner_id', 'id_type', 'owner_type', 'health_type',
                            'health_bits', 'movement_type', 'movement_bits'})
        uid = census.integer(row['unit_id'])
        require(uid not in scalars, 'duplicate scalar unit')
        scalars[uid] = row
    projection = []
    for unit in world['units']:
        uid = census.integer(unit['raw_id'])
        require(uid in scalars, 'typed scalar unit missing')
        expected = dict(unit_id=uid, owner_id=owners[unit['owner']], id_type='Int', owner_type='Int',
                        health_type='Float', health_bits=census.f32_bits(unit['health']),
                        movement_type='Float', movement_bits=census.f32_bits(unit['movement']))
        require(scalars[uid] == expected, 'native scalar identity/type/F32 mismatch')
        detail = world['terrain_trace']['unit_details'][unit['id']]
        projection.append(dict(unit_id=str(uid), owner_id=str(owners[unit['owner']]),
                               definition_id=detail['definition_id']))
    return world, projection


def _ui(value, actor):
    census.fields(value, {'bound_unit_id', 'rendered_unit_id', 'selected_unit_id'})
    require(census.integer(value['bound_unit_id']) == actor and
            census.integer(value['rendered_unit_id']) == actor and value['selected_unit_id'] is None,
            'mounted native UI must carry actual Int identities')


def validate_observation(record):
    result = record['result']
    census.fields(result, {'schema', 'actors', 'selection_fence', 'fence', 'reads', 'events', 'before', 'after'})
    require(result['schema'] == SCHEMA and type(result['reads']) is int and result['reads'] == 2, 'wrong proof schema/count')
    census.fields(result['actors'], {'a', 'b', 'owner'})
    a, b, owner = (census.integer(result['actors'][name], 2**63-1) for name in ('a', 'b', 'owner'))
    require(a > 0 and b > 0 and a != b, 'invalid actual Scout actor IDs')
    fence = census.integer(result['fence'])
    selection_fence = census.integer(result['selection_fence'])
    require(fence > selection_fence, 'missing fresh native selection barrier')
    events = result['events']
    require(type(events) is list and len(events) == fence, 'incomplete native event prefix')
    by_serial = {}
    for serial, event in enumerate(events, 1):
        census.fields(event, {'serial', 'kind', 'data'})
        require(type(event['serial']) is int and event['serial'] == serial, 'native event serial gap')
        require(event['kind'] in ('tile-select', 'unit-select', 'native-unit-preview', 'native-event-result'), 'unknown event')
        if event['kind'] == 'tile-select':
            census.fields(event['data'], {'x', 'y'})
            census.integer(event['data']['x']); census.integer(event['data']['y'])
        if event['kind'] in ('unit-select', 'native-unit-preview'):
            census.fields(event['data'], {'unit_id'})
            if event['data']['unit_id'] is not None:
                census.integer(event['data']['unit_id'])
        if event['kind'] == 'native-event-result':
            receipt = event['data']; census.fields(receipt, {'name', 'event_id', 'caller', 'success'})
            census.text(receipt['name'], True); census.text(receipt['event_id'], True)
            census.integer(receipt['caller']); require(receipt['success'] is True, 'native event rejected')
        by_serial[serial] = event
    ui_expected = dict(bound_unit_id=a, rendered_unit_id=a, selected_unit_id=None)
    require(canonical(result['before']) == canonical(result['after']), 'static native UI boundary changed')
    for state in (result['before'], result['after']):
        census.fields(state, {'event_serial', 'ui', 'last_preview', 'last_tile'})
        require(type(state['event_serial']) is int and state['event_serial'] == fence and
                state['ui'] == ui_expected, 'mounted native preview identity mismatch')
        _ui(state['ui'], a)
        tile, preview = state['last_tile'], state['last_preview']
        census.fields(tile, {'serial', 'x', 'y'}); census.fields(preview, {'serial', 'unit_id'})
        ts, ps = census.integer(tile['serial']), census.integer(preview['serial'])
        require(selection_fence < ts < ps <= fence and tile['x'] == 8 and tile['y'] == 8 and
                preview['unit_id'] == a, 'fresh native tile/preview barrier missing')
        require(by_serial.get(ts) == dict(serial=ts, kind='tile-select', data={'x': 8, 'y': 8}) and
                by_serial.get(ps) == dict(serial=ps, kind='native-unit-preview', data={'unit_id': a}),
                'preview barrier disagrees with actual emitted native callback')
    checkpoints = record['checkpoints']
    before, projection = _world(checkpoints[0]); after, after_projection = _world(checkpoints[1])
    require(canonical(before) == canonical(after) and projection == after_projection,
            'read-only census changed native all-owner world')
    require(canonical(checkpoints[0]['native_unit_scalars']) == canonical(checkpoints[1]['native_unit_scalars']),
            'read-only census changed native Float32 bits')
    local = next((p['id'] for p in before['players'] if p['raw_id'] == owner), None)
    require(local is not None, 'actual local owner absent')
    for uid, morale in ((a, 2), (b, 1)):
        unit = next((u for u in before['units'] if u['raw_id'] == uid), None)
        require(unit is not None and unit['owner'] == local and unit['prototype'] == 'scout-patrol' and
                unit['x'] == 8 and unit['y'] == 8 and unit['morale'] == morale and
                unit['health'] == 1.0 and unit['movement'] == 1.0 and unit['order'] == 'NO_ORDERS',
                'declared idle Scout stack missing')
        require(before['terrain_trace']['unit_details'][unit['id']]['definition_id'] == 'ScoutPatrol', 'wrong actual definition')
    decoded = []
    for ordinal, row in enumerate(record['reads'], 1):
        census.fields(row, {'ordinal', 'event_serial', 'payload', 'ui'})
        require(type(row['ordinal']) is int and row['ordinal'] == ordinal and
                type(row['event_serial']) is int and row['event_serial'] == fence and row['ui'] == ui_expected,
                'census read is outside actual native UI boundary')
        _ui(row['ui'], a)
        decoded.append(census.validate(row['payload'], projection))
    require(canonical(decoded[0]) == canonical(decoded[1]), 'two synchronous static censuses differ')
    selected = next((row for row in decoded[0]['units'] if row['unit_id'] == str(a)), None)
    require(selected is not None and selected['owner_id'] == str(owner) and selected['definition_id'] == 'ScoutPatrol' and
            selected['instance_state'] == 'present' and selected['unit_shown'] is True and selected['actor_visible'] is True,
            'actual selected Scout lacks a submitted cached native instance')
    return dict(schema='application.unit-body-census-proof.v1', complete=True, match=True,
                evaluation_only=True, candidate_executed=False, original_passing_cases=0,
                all_seven_world_unchanged=True, unit_count=9, census_reads=2, selected_unit_id=a,
                selected_resource_key=selected['resource']['key'], selected_instance_id=selected['instance_id'],
                supported=decoded[0]['supported'],
                unsupported=['GPU pixels/frame', 'movement/cadence', 'gameplay facing', 'animation/limb/tool poses',
                             'original appearance/policy', 'cross-session continuity', 'physical controls'])


def evaluate(log, acceptance):
    digest = hashlib.sha256(log.encode('utf-8')).hexdigest()
    require(acceptance.get('native_exit_code') == 0 and type(acceptance.get('native_exit_code')) is int,
            'actual application exit zero required')
    capture = acceptance.get('log', {})
    require(capture.get('sealed') is True and capture.get('partial') is False and
            capture.get('raw_sha256') == digest and capture.get('joined_chunk_sha256') == digest,
            'complete exact sealed raw/chunks required')
    hook = acceptance.get('hook', {})
    require(type(hook.get('main_acknowledgements')) is int and hook.get('main_acknowledgements') == 1 and
            type(hook.get('worker_acknowledgements')) is int and hook.get('worker_acknowledgements') == 8 and
            all(hook.get(key) is True for key in ('runtime_out_bound', 'runtime_err_bound', 'runtime_callMain_present')),
            'canonical main/all-worker runtime hook acknowledgements required')
    require(acceptance.get('browser_closed') is True and acceptance.get('server_reaped') is True,
            'owned producers must close/reap before evaluation')
    return validate_observation(parse(log))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('log', type=Path); parser.add_argument('acceptance', type=Path); parser.add_argument('output', type=Path)
    args = parser.parse_args()
    try:
        proof = evaluate(args.log.read_text(), decode_json(args.acceptance.read_text()))
    except (ProtocolError, KeyError, TypeError, StopIteration) as error:
        args.output.write_text(json.dumps({'complete': False, 'match': False, 'error': str(error),
                                          'evaluation_only': True, 'candidate_executed': False}, indent=2) + '\n')
        raise SystemExit(str(error))
    args.output.write_text(json.dumps(proof, indent=2, sort_keys=True) + '\n')
