#!/usr/bin/env python3
"""Execute and audit complete native terrain/traversal observations.

The declared candidate fixture checks observer coverage and real command debit.
It does not compare against an original game or complete the action inventory.
"""
import argparse
import json
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fast import parse_output
from protocol import ProtocolError, canonical, decode_json, fingerprint
from state_trace.native_capture import ROOT, NativeCaptureError, capture_script
from state_trace.terrain_observation import (fields, integer, number, observed_deltas,
                                           require, validate_quote, validate_snapshot)

SCRIPT = Path(__file__).with_name('_terrain_observation_candidate.gls.js')
ACTORS = {'former': 'Formers', 'native': 'MindWorms', 'conventional': 'ScoutPatrol'}
STAGES = ('initial',) + tuple(actor + '-' + phase for actor in ACTORS
                              for phase in ('before', 'during', 'after'))
UNSUPPORTED = ('original terrain/state agreement', 'original raw elevation byte/class mapping',
               'all 26 primitive action completions', 'all 10 compound/automation commands',
               'UI controls/selection/focus', 'animation duration/progress', 'audio/music/video',
               'general movement policy agreement with original')


def _rows(log):
    for line in log.splitlines():
        match = re.search(r'(?:^|\] )(TERRAIN_[A-Z_]+)(?:\|(.*))?$', line)
        if match:
            yield match.groups()


def _derived_quote_changes(before, after, actor, changed_details):
    """Explain opponent quote changes using only observed occupancy changes.

    A move changes the passability view of adjacent foreign units without
    mutating those units. Costs, source geometry and every native detail remain
    exact; only the foreign-occupancy guard may change on the actor's two tiles.
    """
    units = {row['id']: row for row in before['units']}
    moved = units[actor]
    arrived = next(row for row in after['units'] if row['id'] == actor)
    affected = {(moved['x'], moved['y']), (arrived['x'], arrived['y'])}
    explained = []
    reason = 'Destination tile contains foreign units (combat not implemented yet)'
    for identity in changed_details:
        if identity == actor:
            continue
        old = before['terrain_trace']['unit_details'][identity]
        new = after['terrain_trace']['unit_details'][identity]
        require(canonical({k: v for k, v in old.items() if k != 'quotes'}) ==
                canonical({k: v for k, v in new.items() if k != 'quotes'}),
                'Traversal altered an unrelated native unit detail')
        unit = units[identity]
        for direction, quote in old['quotes'].items():
            current = new['quotes'][direction]
            if canonical(quote) == canonical(current):
                continue
            require(canonical({k: v for k, v in quote.items() if k not in ('allowed_now', 'reason')}) ==
                    canonical({k: v for k, v in current.items() if k not in ('allowed_now', 'reason')}),
                    'Traversal changed an unrelated quote cost or geometry')
            destination = quote['destination']
            require(quote['source'] == dict(x=unit['x'], y=unit['y']) and
                    (destination['x'], destination['y']) in affected,
                    'Changed opponent quote is unrelated to the actual move')
            def occupied(snapshot):
                return any(row['owner'] != unit['owner'] and
                           (row['x'], row['y']) == (destination['x'], destination['y'])
                           for row in snapshot['units'])
            old_foreign, new_foreign = occupied(before), occupied(after)
            require(old_foreign != new_foreign and
                    quote['allowed_now'] == (not old_foreign) and
                    current['allowed_now'] == (not new_foreign) and
                    quote['reason'] == (reason if old_foreign else None) and
                    current['reason'] == (reason if new_foreign else None),
                    'Changed opponent quote is not the observed foreign-occupancy guard')
            explained.append(dict(unit_id=identity, direction=direction, destination=destination,
                                  before=quote, after=current))
    return explained


def audit(log):
    summary = parse_output(log)
    snapshots, native, movements, completed = {}, {}, [], 0
    opened = None; domains = ('tiles', 'unit_details', 'base_details', 'player_details')
    for kind, body in _rows(log):
        require(completed == 0, 'Terrain data appeared after the completion fence')
        if kind in ('TERRAIN_STAGE_BEGIN', 'TERRAIN_STAGE_ROW', 'TERRAIN_STAGE_END', 'TERRAIN_NATIVE'):
            require(body is not None and '|' in body, 'Native stage record is malformed')
            stage, value = body.split('|', 1); value = decode_json(value)
            require(stage in STAGES, 'Unknown native stage')
            if kind == 'TERRAIN_NATIVE':
                require(opened is None and stage not in native, 'Duplicate/interleaved native inventory')
                native[stage] = value
            elif kind == 'TERRAIN_STAGE_BEGIN':
                require(opened is None and stage not in snapshots, 'Duplicate/interleaved native stage')
                require(type(value) is dict and type(value.get('terrain_trace')) is dict and
                        not any(domain in value['terrain_trace'] for domain in domains), 'Malformed native stage header')
                for domain in domains: value['terrain_trace'][domain] = {}
                snapshots[stage] = value; opened = stage
            elif kind == 'TERRAIN_STAGE_ROW':
                require(opened == stage, 'Native row outside its open stage')
                fields(value, ('domain', 'key', 'value'), 'native row')
                require(value['domain'] in domains and type(value['key']) is str, 'Unknown native row domain/key')
                target = snapshots[stage]['terrain_trace'][value['domain']]
                require(value['key'] not in target, 'Duplicate native terrain/entity row')
                target[value['key']] = value['value']
            else:
                require(opened == stage, 'Native end outside its open stage')
                fields(value, domains, 'native stage manifest')
                for domain in domains:
                    integer(value[domain], 'manifest.' + domain, 0)
                    require(value[domain] == len(snapshots[stage]['terrain_trace'][domain]), 'Native row count differs from manifest')
                opened = None
        elif kind == 'TERRAIN_MOVEMENT':
            require(opened is None and len(movements) < len(ACTORS), 'Movement record inside an incomplete stage')
            actor = tuple(ACTORS)[len(movements)]
            require(actor + '-after' in snapshots, 'Movement result appeared before its actual checkpoints')
            movements.append(decode_json(body))
        elif kind == 'TERRAIN_OBSERVATION_COMPLETE':
            require(body is None and opened is None and len(snapshots) == len(STAGES) and len(movements) == len(ACTORS),
                    'Completion marker has unexpected payload or incomplete observations')
            completed += 1
        else: raise ProtocolError('Unknown terrain transport record ' + kind)
    require(tuple(snapshots) == STAGES and tuple(native) == STAGES and completed == 1 and opened is None,
            'All ordered before/during/after native checkpoints are required exactly once')
    require(len(movements) == len(ACTORS), 'Every declared movement kind must execute exactly once')
    inventories = None
    for stage, snapshot in snapshots.items():
        validate_snapshot(snapshot)
        require(snapshot['terrain_trace']['policy'] == dict(version=1, ignore_technologies=True),
                'Actual default technology policy differs from declared probe inputs')
        inventory = native[stage]
        for domain in ('unit', 'base'):
            ids = inventory.get(domain + '_ids') if type(inventory) is dict else None
            raw_ids = [row['raw_id'] for row in snapshot[domain + 's']]
            require(type(ids) is list and all(type(identity) is int for identity in ids) and
                    len(ids) == len(set(ids)) and set(ids) == set(raw_ids),
                    'Native registered inventory differs from captured ' + domain + 's')
        require(len(snapshot['bases']) == 7 and len(snapshot['units']) == 9,
                'Declared world did not create all seven bases/seven startup units plus two actors')
        roster = {(row['id'], row['raw_id']) for row in snapshot['players']}
        owner_ids = {identity for identity, raw_id in roster}
        require((snapshot['width'], snapshot['height']) == (16, 16) and
                {row['owner'] for row in snapshot['bases']} == owner_ids and
                {row['owner'] for row in snapshot['units']} == owner_ids,
                'Declared complete world dimensions/opponent city/unit coverage differ')
        current = (roster, set(inventory['unit_ids']), set(inventory['base_ids']))
        if inventories is None: inventories = current
        require(current == inventories, 'Owner/entity inventory changed during read/movement capability probe')
        require(inventory.get('dangling_unit_updates') == 0, 'Native pending updates reference retired units')
    evidence = []
    baseline = snapshots['initial']
    actors = {row['id']: row for row in baseline['units'] if row['id'] in ACTORS}
    require(set(actors) == set(ACTORS) and len({row['owner'] for row in actors.values()}) == 1 and
            len({(row['x'], row['y']) for row in actors.values()}) == 1,
            'Declared three actor bindings must retain the same owner/start tile')
    preceding = baseline
    for movement, (actor, definition) in zip(movements, ACTORS.items()):
        fields(movement, ('unit_id', 'source', 'destination', 'movement_before', 'movement_after',
                         'actual_debit_mp', 'movement_successful', 'actual_step_count',
                         'before_checkpoint', 'after_checkpoint', 'quote'), 'movement')
        require(movement['unit_id'] == actor and movement['before_checkpoint'] == actor + '-before' and
                movement['after_checkpoint'] == actor + '-after', 'Movement is missing/reordered/rebound')
        before, after = snapshots[actor + '-before'], snapshots[actor + '-after']
        require(canonical(preceding) == canonical(before), 'Unaccounted mutation occurred between command checkpoints')
        preceding = after
        old = {row['id']: row for row in before['units']}[actor]
        new = {row['id']: row for row in after['units']}[actor]
        detail = before['terrain_trace']['unit_details'][actor]
        require(detail['definition_id'] == definition and detail['movement_kind'] == 'land' and
                detail['can_terraform'] == (actor == 'former'), 'Actor native definition/ability differs from authored inputs')
        require(old['raw_id'] == new['raw_id'] and old['owner'] == new['owner'], 'Movement changed native unit identity/owner')
        for field in ('movement_before', 'movement_after', 'actual_debit_mp'): number(movement[field], field, 0)
        require(movement['movement_before'] == old['movement'] and movement['movement_after'] == new['movement'],
                'Reported debit does not use actual before/after native movement credits')
        require(movement['actual_debit_mp'] == old['movement'] - new['movement'], 'Actual movement debit is inconsistent')
        require(type(movement['movement_successful']) is bool and type(movement['actual_step_count']) is int and
                movement['actual_step_count'] == int(movement['movement_successful']), 'Actual result/path step count differs')
        source = dict(x=old['x'], y=old['y']); destination = movement['destination']
        require(movement['source'] == source and dict(x=new['x'], y=new['y']) ==
                (destination if movement['movement_successful'] else source), 'Actual command position/result differs')
        quote = validate_quote(movement['quote'], before['width'], before['height'], 'movement.quote')
        require(quote['source'] == source and quote['destination'] == destination and quote['allowed_now'] and
                any(canonical(quote) == canonical(edge) for edge in detail['quotes'].values()),
                'Movement quote is not the actual captured source edge')
        changes = observed_deltas(before, after)
        require(not any(changes[key] for key in ('tiles', 'player_details', 'base_details', 'players', 'bases', 'research'))
                and not changes['policy_changed'], 'Traversal unexpectedly altered terrain/treasury/research/cities/roster/policy')
        require(changes['units'] == [actor], 'Actual move is missing or altered an unrelated native unit')
        derived_quotes = _derived_quote_changes(before, after, actor, changes['unit_details'])
        # Whole-map checks above are independent of the quoted debit; no quote
        # is used to fabricate or approve a native command result.
        evidence.append(dict(actor=actor, definition=definition, actual=movement, derived_quote_changes=derived_quotes,
                             before_sha256=fingerprint(before), after_sha256=fingerprint(after), changes=changes))
    coverage = baseline['terrain_trace']['coverage']
    unsupported = list(UNSUPPORTED)
    for capability in ('canonical_height', 'energy_initialization', 'automation_context', 'automation_phase', 'home_identity', 'improvement_owners'):
        if not coverage[capability]: unsupported.append('runtime lacks native ' + capability + ' capability')
    return dict(schema='game.terrain_capture.v2', status='passed',
                verified_scope='native-observer-purity-and-actual-three-actor-traversal', native_summary=summary,
                original_comparison_executed=False, original_matches=0,
                full_action_inventory_complete=False, checkpoint_count=len(snapshots),
                players_per_checkpoint=7, terrain_tiles_per_checkpoint=len(baseline['terrain_trace']['tiles']),
                actual_movement_commands=len(evidence), movement_evidence=evidence,
                unsupported=unsupported, coverage=coverage, snapshots=snapshots, native_bookkeeping=native)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--runtime', type=Path)
    group.add_argument('--log', type=Path, help='validate recorded bytes only; does not launch candidate')
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args(argv)
    report = dict(candidate_executed=False, validation_only=bool(args.log), original_comparison_executed=False)
    log = ''
    try:
        if args.runtime:
            log, execution = capture_script(args.runtime, SCRIPT)
            report.update(candidate_executed=True, execution=execution)
        else: log = args.log.read_text()
        report.update(audit(log)); code = 0
    except NativeCaptureError as error:
        report.update(status='error', candidate_executed=error.execution['candidate_executed'],
                      execution=error.execution, error=str(error), native_log=error.log); code = 2
    except (OSError, ValueError, ProtocolError, KeyError, TypeError) as error:
        report.update(status='error', error=str(error), native_log=log); code = 2
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, sort_keys=True, indent=2, allow_nan=False) + '\n')
    print(canonical({key: value for key, value in report.items() if key not in ('snapshots', 'native_bookkeeping', 'native_log')}))
    return code


if __name__ == '__main__': sys.exit(main())
