#!/usr/bin/env python3
"""Execute all source Terraform variants in isolated candidate-only workers.

Every case uses mounted application controls, authoritative native effects and
lossless seven-owner/full-map observations. These are application invariants,
never counts of original agreement. Long automation is deliberately cancelled
after actual acknowledged work/movement; completion has its own native suite.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
import struct
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fast import parse_output
from protocol import ProtocolError, canonical, decode_json
from state_trace.native_capture import ROOT, NativeCaptureError, capture_script, seed_state
from state_trace.terrain_observation import fields, integer, observed_deltas, require, validate_snapshot

PRIMITIVES = ('farm', 'soil_enricher', 'mine', 'solar', 'forest', 'road', 'mag_tube',
              'bunker', 'airbase', 'sensor', 'remove_fungus', 'plant_fungus',
              'condenser', 'mirror', 'borehole', 'aquifer', 'raise', 'lower', 'level')
SEA = ('farm', 'mine', 'solar', 'remove_fungus', 'plant_fungus', 'raise', 'lower')
COMMANDS = ('farm_solar_road', 'farm_mine_road', 'road_to', 'tube_to', 'auto_roads',
            'auto_tubes', 'auto_sensors', 'auto_remove_fungus', 'auto_home_base', 'auto_former')
CASES = tuple((f'land:{action}', action, False) for action in PRIMITIVES) + \
        tuple((f'sea:{action}', action, True) for action in SEA) + \
        tuple((f'command:{action}', action, False) for action in COMMANDS)
TEMPLATE = ROOT / 'GLSMAC_data/tests/_terraform_action_capture.gls.js'
# Existing native Config documentation example, fixed before the first seeded
# baseline. This is a declared input, never a seed search for a passing heap.
INITIAL_SEED = '1651011033:1377505029:3019448108:3247278135'
DOMAINS = ('tiles', 'unit_details', 'base_details', 'player_details')
UNSUPPORTED = ('original terrain/effect/fee agreement', 'original graphics/animation/audio parity',
               'original raw height byte/class mapping', 'original automation priorities',
               'damaged/cooperative/save-load cross-cutting gates (separate suites)',
               'full autonomous map exhaustion in this bounded trace')


def stages(action):
    middle = ('quote', 'cancelled-quote', 'draft-payment') if action in ('raise', 'lower') else ()
    return ('before',) + middle + ('queued', 'acknowledged') + (('exercised',) if action in COMMANDS else ()) + ('after',)


def audit(log, action, water):
    summary = parse_output(log)
    expected = stages(action)
    snapshots, inventories = {}, {}
    begin = end = opened = None
    finished = False
    for line in log.splitlines():
        match = re.search(r'(?:^|\] )((?:TERRAIN|TERRAFORM_ACTION)_[A-Z_]+)\|(.*)$', line)
        if not match:
            continue
        kind, body = match.groups()
        require(not finished, 'Action data appeared after its complete fence')
        if kind == 'TERRAFORM_ACTION_BEGIN':
            require(begin is None and not snapshots, 'Duplicate/late action input binding')
            begin = decode_json(body)
            continue
        if kind == 'TERRAFORM_ACTION_END':
            require(opened is None and tuple(snapshots) == expected and tuple(inventories) == expected,
                    'Action completion omitted a checkpoint or native inventory')
            end = decode_json(body); finished = True
            continue
        require(begin is not None and kind in ('TERRAIN_NATIVE', 'TERRAIN_STAGE_BEGIN', 'TERRAIN_STAGE_ROW', 'TERRAIN_STAGE_END'),
                'Unknown/unbound action trace record')
        require('|' in body, 'Malformed stage packet')
        stage, payload = body.split('|', 1); value = decode_json(payload)
        require(stage in expected, 'Unknown action checkpoint')
        if kind == 'TERRAIN_NATIVE':
            require(opened is None and stage not in inventories, 'Duplicate/interleaved native inventory')
            inventories[stage] = value
        elif kind == 'TERRAIN_STAGE_BEGIN':
            require(opened is None and stage not in snapshots and stage in inventories, 'Duplicate/unpaired stage begin')
            require(type(value) is dict and type(value.get('terrain_trace')) is dict and
                    not any(domain in value['terrain_trace'] for domain in DOMAINS), 'Malformed stage header')
            for domain in DOMAINS:
                value['terrain_trace'][domain] = {}
            snapshots[stage] = value; opened = stage
        elif kind == 'TERRAIN_STAGE_ROW':
            require(opened == stage, 'Native row outside its checkpoint')
            fields(value, ('domain', 'key', 'value'), 'action row')
            require(value['domain'] in DOMAINS and type(value['key']) is str, 'Unknown native domain/key')
            target = snapshots[stage]['terrain_trace'][value['domain']]
            require(value['key'] not in target, 'Duplicate tile/player/entity row')
            target[value['key']] = value['value']
        else:
            require(opened == stage, 'Unpaired native stage end')
            fields(value, DOMAINS, 'manifest')
            for domain in DOMAINS:
                integer(value[domain], 'manifest.' + domain, 0)
                require(value[domain] == len(snapshots[stage]['terrain_trace'][domain]), 'Missing native chunk')
            opened = None
    require(finished and begin is not None and end is not None and tuple(snapshots) == expected,
            'Incomplete action execution')
    input_fields = ('version', 'action', 'domain', 'automation', 'rates', 'treasury', 'actor_id', 'x', 'y')
    require(type(begin) is dict and type(begin.get('version')) is int and begin['version'] in (1, 2), 'Unknown input binding version')
    fields(begin, input_fields + (('rng',) if begin['version'] == 2 else ()), 'input binding')
    fields(end, ('version', 'action', 'domain', 'lifecycle', 'actor_id', 'final_order', 'final_work', 'movement'), 'complete binding')
    domain = 'sea' if water else 'land'
    for bound in (begin, end):
        require(type(bound['version']) is int and bound['version'] == (begin['version'] if bound is begin else 1) and bound['action'] == action and bound['domain'] == domain,
                'Native action/domain identity differs from requested case')
    integer(begin['actor_id'], 'input.actor_id', 1); integer(end['actor_id'], 'end.actor_id', 1)
    integer(begin['x'], 'input.x', 0); integer(begin['y'], 'input.y', 0)
    require(type(begin['automation']) is bool and begin['automation'] == (action in COMMANDS), 'Command/primitive binding differs')
    require(begin['rates'] == 'declared-one-turn' and begin['treasury'] == 'authored-additive10000', 'Undeclared input policy')
    require(end['lifecycle'] == ('bounded-exercise-and-cancel' if action in COMMANDS else 'rate-one-completed'), 'Completion scope changed')
    for stage, snapshot in snapshots.items():
        validate_snapshot(snapshot)
        trace = snapshot['terrain_trace']
        require(trace['coverage']['ui'] and trace['coverage']['all_players'], 'Mounted/all-player observation omitted')
        require(trace['policy'] == dict(version=1, ignore_technologies=True), 'Actual normal-play technology waiver differs')
        inventory = inventories[stage]
        require(type(inventory) is dict, 'Native inventory missing')
        for name in ('unit', 'base'):
            ids = inventory.get(name + '_ids')
            require(type(ids) is list and all(type(item) is int for item in ids) and len(ids) == len(set(ids)) and
                    set(ids) == {row['raw_id'] for row in snapshot[name + 's']}, 'Registered native inventory differs from captured entities')
        actors = [row for row in snapshot['units'] if row['id'] == 'actor']
        require(len(actors) == 1 and actors[0]['raw_id'] == begin['actor_id'] == end['actor_id'], 'Actor missing/replaced')
        require(trace['unit_details']['actor']['can_terraform'], 'Action was not executed by a native capable worker')
    before = snapshots['before']
    if begin['version'] == 2:
        rng = begin['rng']
        fields(rng, ('stream', 'initial_requested', 'actual_before_action', 'terrain_input'), 'rng binding')
        seed_state(rng['initial_requested']); seed_state(rng['actual_before_action'])
        require(rng['initial_requested'] == INITIAL_SEED and rng['actual_before_action'] == inventories['before'].get('rng')
                and rng['stream'] == 'native-game-shared-map-and-logic' and rng['terrain_input'] == 'declared-16x16-flat-arid',
                'Requested seed/native startup receipt or declared map binding differs')
    actor = next(row for row in before['units'] if row['id'] == 'actor')
    require((actor['x'], actor['y']) == (begin['x'], begin['y']), 'Input work coordinates differ from actual actor')
    for pure in ('quote', 'cancelled-quote', 'draft-payment', 'queued'):
        if pure in snapshots:
            old, new = before.copy(), snapshots[pure].copy()
            old['terrain_trace'] = {key: value for key, value in before['terrain_trace'].items() if key != 'ui'}
            new['terrain_trace'] = {key: value for key, value in snapshots[pure]['terrain_trace'].items() if key != 'ui'}
            require(canonical(old) == canonical(new), 'Pending UI/quote/choice changed actual native state before authoritative delivery')
    after = snapshots['after']; detail = after['terrain_trace']['unit_details']['actor']
    require(end['final_order'] == next(row['order'] for row in after['units'] if row['id'] == 'actor') and
            canonical(end['final_work']) == canonical(detail['work']), 'Final receipt differs from observed native work')
    require(end['final_order'] == 'NO_ORDERS' and not detail['work']['active'], 'Completed/cancelled action remains active')
    deltas = {stage: observed_deltas(before, snapshot) for stage, snapshot in snapshots.items() if stage != 'before'}
    debit = end['movement']
    fields(debit, ('arithmetic', 'actual_step_count', 'movement_before', 'movement_after', 'actual_debit_mp', 'before', 'after'), 'actual debit')
    require(debit['arithmetic'] == 'native-float32-subtraction', 'Movement debit arithmetic is not declared')
    integer(debit['actual_step_count'], 'actual_step_count', 0)
    old_actor = next(row for row in before['units'] if row['id'] == 'actor')
    new_actor = next(row for row in after['units'] if row['id'] == 'actor')
    for key, value in (('movement_before', old_actor['movement']), ('movement_after', new_actor['movement']),
                       ('actual_debit_mp', struct.unpack('!f', struct.pack('!f', old_actor['movement'] - new_actor['movement']))[0])):
        require(type(debit[key]) is float and debit[key] == value, 'Actual debit does not match the native before/after actor')
    require(debit['before'] == dict(x=old_actor['x'], y=old_actor['y']) and debit['after'] == dict(x=new_actor['x'], y=new_actor['y']),
            'Actual movement coordinates differ from native actor')
    if action in COMMANDS:
        exercised = next(row for row in snapshots['exercised']['units'] if row['id'] == 'actor')
        require(bool(deltas['exercised']['tiles']) or debit['actual_step_count'] > 0 or
                exercised['movement'] < old_actor['movement'], 'Automation ACK without actual work/movement is not execution')
    else:
        require(debit['actual_step_count'] == 0, 'Stationary primitive invented movement steps')
        require(bool(deltas['after']['tiles']), 'Completed primitive did not change actual terrain')
        actor_before = next(row for row in before['units'] if row['id'] == 'actor')
        actor_after = next(row for row in after['units'] if row['id'] == 'actor')
        require(actor_after['movement'] == 0.0 and actor_before['movement'] > 0.0, 'Actual work movement debit is absent')
    return dict(status='passed', scope='candidate application invariants', original_passing_cases=0,
                summary=summary, input_binding=begin, completion_binding=end, stages=snapshots,
                native_inventories=inventories, deltas=deltas, unsupported=list(UNSUPPORTED))



def fixture_source(action, water):
    require(type(water) is bool and any((action, water) == (row[1], row[2]) for row in CASES), 'Undeclared action/domain fixture input')
    source = TEMPLATE.read_text()
    require(source.count("'__ACTION__'") == source.count('__WATER__') == source.count('__INITIAL_RNG__') == 1, 'Malformed declared case template')
    return source.replace("'__ACTION__'", repr(action)).replace('__WATER__', 'true' if water else 'false').replace('__INITIAL_RNG__', INITIAL_SEED)


def execute(runtime, case, directory, timeout):
    identity, action, water = case
    source = fixture_source(action, water)
    directory.mkdir(parents=True, exist_ok=True)
    report = dict(case=identity, status='error', candidate_executed=False, original_passing_cases=0)
    log = ''
    try:
        with tempfile.TemporaryDirectory(prefix='terraform-action-') as temporary:
            script = Path(temporary) / 'declared_action.gls.js'; script.write_text(source)
            log, execution = capture_script(runtime, script, timeout=timeout, initial_seed=INITIAL_SEED)
        report.update(execution=execution, candidate_executed=execution['candidate_executed'])
        report.update(audit(log, action, water))
    except NativeCaptureError as error:
        log = error.log
        report.update(error=str(error), execution=error.execution, candidate_executed=error.execution['candidate_executed'])
    except (OSError, ProtocolError, ValueError) as error:
        report['error'] = str(error)
    report['template_sha256'] = hashlib.sha256(TEMPLATE.read_bytes()).hexdigest()
    stem = identity.replace(':', '-')
    (directory / (stem + '.log')).write_text(log)
    (directory / (stem + '.json')).write_text(json.dumps(report, indent=2, sort_keys=True) + '\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--case', choices=[case[0] for case in CASES], action='append')
    parser.add_argument('--artifacts', type=Path, required=True)
    parser.add_argument('--timeout', type=int, default=240)
    args = parser.parse_args()
    require(args.timeout > 0, 'Timeout must be positive')
    selected = [case for case in CASES if not args.case or case[0] in args.case]
    reports = []
    for case in selected:
        report = execute(args.runtime, case, args.artifacts, args.timeout); reports.append(report)
        print(case[0] + ': ' + report['status'], flush=True)
    manifest = dict(schema='game.terraform_action_capture.v1', total_inventory=36, selected=len(selected),
                    passed=sum(report['status'] == 'passed' for report in reports), original_passing_cases=0,
                    cases=[dict(case=report['case'], status=report['status'], execution=report.get('execution')) for report in reports])
    (args.artifacts / 'manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
    return int(manifest['passed'] != len(selected))


if __name__ == '__main__':
    raise SystemExit(main())
