"""Strict complete native cooperation observations; never original agreement."""
import argparse
import json
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fast import parse_output
from protocol import ProtocolError, decode_json
from state_trace.native_capture import ROOT, capture_script, NativeCaptureError
from state_trace.terrain_observation import validate_snapshot, require, observed_deltas
from state_trace.terraform_actions import INITIAL_SEED

STAGES = ('partial-all-owners', 'paused-opponent', 'fresh-peer-contribution', 'stale-after-terrain')
PROBE = ROOT / 'GLSMAC_data/tests/terraforming_cooperation_observation.gls.js'


def audit(log):
    summary = parse_output(log)
    snapshots, native = {}, {}
    complete = False
    for line in log.splitlines():
        found = re.search(r'(?:^|\] )(TERRAIN_COOPERATIVE_[A-Z]+)(?:\|(.*))?$', line)
        if not found:
            continue
        require(not complete, 'Cooperative data appeared after its completion fence')
        kind, body = found.groups()
        if kind == 'TERRAIN_COOPERATIVE_COMPLETE':
            require(body is None and tuple(snapshots) == STAGES and tuple(native) == STAGES, 'Incomplete cooperative native observations')
            complete = True
            continue
        require(body is not None and '|' in body, 'Malformed cooperative packet')
        stage, payload = body.split('|', 1)
        require(stage in STAGES, 'Unexpected cooperative observation')
        value = decode_json(payload)
        if kind == 'TERRAIN_COOPERATIVE_NATIVE':
            require(stage not in native and len(snapshots) == len(native) and stage == STAGES[len(native)], 'Missing/duplicate/out-of-order native fence')
            native[stage] = value
        else:
            require(kind == 'TERRAIN_COOPERATIVE_JSON' and stage in native and stage not in snapshots and stage == STAGES[len(snapshots)], 'Missing/duplicate/out-of-order full observation')
            snapshots[stage] = validate_snapshot(value)
    require(complete, 'Cooperative cleanup/Finish completion fence missing')
    for stage, state in snapshots.items():
        require(len(state['players']) == 7 and len(state['bases']) == 7 and len(state['units']) == 22, 'The actual shared seven-owner fixture inventory changed')
        for domain in ('unit', 'base'):
            ids = native[stage].get(domain + '_ids')
            require(type(ids) is list and all(type(raw) is int for raw in ids) and len(ids) == len(set(ids)) and set(ids) == {row['raw_id'] for row in state[domain + 's']}, 'Native cooperative entity inventory differs')
        details = state['terrain_trace']['unit_details']
        require(state['terrain_trace']['coverage']['cooperative_work'], 'Native cooperative observation capability is missing')
        by_owner = {}
        for unit in state['units']:
            work = details[unit['id']]['work']
            if 'job' in work:
                by_owner.setdefault(unit['owner'], []).append(details[unit['id']]['cooperative_work']['state'])
        require(set(by_owner) == {row['id'] for row in state['players']}, 'An actual local/opponent partial cohort is omitted')
        for owner, records in by_owner.items():
            raw_owner = next(player['raw_id'] for player in state['players'] if player['id'] == owner)
            if stage == 'stale-after-terrain' and raw_owner == 2:
                require(all(record is None for record in records), 'Stale actual native job retained a fabricated current cohort')
            else:
                require(all(record is not None and record['own_work_units'] == 2 and record['cohort_work_units'] == (6 if raw_owner == 1 and stage in ('fresh-peer-contribution', 'stale-after-terrain') else 4) for record in records), 'Actual partial native contributions or fresh per-observation cohort totals differ')
    deltas = observed_deltas(snapshots['fresh-peer-contribution'], snapshots['stale-after-terrain'])
    require(bool(deltas['tiles']), 'Stale-cohort checkpoint has no actual observed terrain change')
    return dict(scope='candidate native cooperation/observation invariants', original_passing_cases=0, summary=summary, stages=snapshots, native_inventories=native, stale_native_deltas=deltas)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--artifacts', type=Path, required=True)
    args = parser.parse_args(); args.artifacts.mkdir(parents=True, exist_ok=True)
    report = dict(schema='game.cooperative_capture.v1', status='error', candidate_executed=False, original_passing_cases=0); log = ''
    try:
        log, execution = capture_script(args.runtime, PROBE, timeout=180, initial_seed=INITIAL_SEED)
        report.update(execution=execution, candidate_executed=execution['candidate_executed'])
        report.update(audit(log), status='passed')
    except NativeCaptureError as error:
        log = error.log; report.update(error=str(error), execution=error.execution, candidate_executed=error.execution['candidate_executed'])
    except (OSError, ProtocolError, ValueError) as error:
        report['error'] = str(error)
    # The transport digest binds the actual pre-launch request snapshot; do
    # not relabel executed bytes by reading the source after the process exits.
    report['probe_sha256'] = report.get('execution', {}).get('probe_sha256')
    (args.artifacts / 'cooperation.log').write_text(log)
    (args.artifacts / 'cooperation.json').write_text(json.dumps(report, indent=2) + '\n')
    return int(report['status'] != 'passed')


if __name__ == '__main__':
    raise SystemExit(main())
