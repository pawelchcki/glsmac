"""Strict offline acceptance for one normal candidate move; no Native/game credit.

The producer never decodes census JSON. Endpoint/intermediate gates are OFFLINE,
not claimed runtime triggers. Existing strict census/terrain schemas remain used.
"""
import argparse
import copy
import hashlib
import json
import math
import re
from pathlib import Path
from protocol import ProtocolError, canonical, decode_json
from state_trace import unit_body_census as census
from state_trace.unit_body_census_proof import _world

require = census.require
SCHEMA = 'application.unit-body-movement-observation.v1'
BUDGETS = dict(node_ms=180000, observation_ms=120000, outer_seconds=190, term_seconds=3,
               kill_wait_seconds=5, cleanup_seconds=8, postkill_seconds=2,
               census_calls=32, sample_delay_ms=10)
FATAL = re.compile(r'UM_UNSUPPORTED|UM_ERROR|TRACE_UNSUPPORTED|Unhandled exception|Uncaught|Unsupported image format|'
                   r'Assertion failed|Aborted\(|RuntimeError:|(?:worker|Pthread[^\n]*) sent an error!|\[Error\]', re.I)

class SamplingIncomplete(ProtocolError):
    """Sampling did not establish movement; never a passing animation case."""

class MovementInvariantMismatch(ProtocolError):
    """Complete controlled observation differs from the pinned current-source effect."""


def parse(log):
    require(type(log) is str and FATAL.search(log) is None, 'fatal/incomplete observation')
    rows = []
    for line in log.splitlines():
        if re.match(r'^\s*(?:\[[^\]\n]+\]\s*)?UM_',line):
            require(re.match(r'^\s*(?:\[[^\]\n]+\]\s*)?UM_(EVENT|RECEIPT|READY|SUBMIT|CENSUS|PENDING|CHECKPOINT|RESULT|READINESS_WAIT)\|',line) is not None,'unknown movement telemetry')
    for match in re.finditer(r'^\s*(?:\[[^\]\n]+\]\s*)?UM_(EVENT|RECEIPT|READY|SUBMIT|CENSUS|PENDING|CHECKPOINT|RESULT)\|([^\n]+)$', log, re.M):
        kind, payload = match.groups(); value = decode_json(payload)
        require(type(value) is dict and value.get('seq') == len(rows) + 1 and type(value['seq']) is int,
                'missing/reordered/duplicate observation serial')
        require(not rows or rows[-1]['kind'] != 'RESULT', 'observation follows result')
        rows.append(dict(kind=kind, data=value, start_utf16=len(log[:match.start()].encode('utf-16-le'))//2,
                         end_utf16=len(log[:match.end()].encode('utf-16-le'))//2))
    require(bool(rows) and rows[-1]['kind'] == 'RESULT', 'missing final result')
    return rows


def _one(rows, kind):
    matches = [r['data'] for r in rows if r['kind'] == kind]
    require(len(matches) == 1, 'missing/duplicate ' + kind)
    return matches[0]


def _pending(row, owners):
    census.fields(row, {'seq', 'stage', 'values'})
    require(type(row['values']) is list and len(row['values']) == 7, 'missing all-owner pending vector')
    values = {}
    for entry in row['values']:
        census.fields(entry, {'owner_id', 'pending'})
        owner = census.integer(entry['owner_id'])
        require(owner not in values and type(entry['pending']) is bool, 'invalid/duplicate pending owner')
        values[owner] = entry['pending']
    require(set(values) == owners, 'pending owner set differs')
    return not any(values.values())


def _row(packet, uid):
    return next(u for u in packet['units'] if u['unit_id'] == str(uid))


def _point(row):
    require(row['instance_state'] == 'present' and row['unit_shown'] is True and row['actor_visible'] is True,
            'movement A lacks actual submitted instance')
    return {axis: census.float32(row['unit_render_coords'][axis]) for axis in 'xyz'}


def _equal(a, b):
    return canonical(a) == canonical(b)


def _callbacks(rows, ready, submit, settled, a, b):
    # Source partial order only: RefreshUnit/MoveUnit can both refresh source B;
    # completion and later RenderTile can repeat destination A. SetSelectedTile
    # itself emits no tile_select. No total order against receipt/timer samples.
    events = [r['data'] for r in rows if r['kind'] == 'EVENT' and r['data']['seq'] > ready['seq']]
    phase = 'source'; promoted = []; destination = []
    for event in events:
        require(event['seq'] > submit['seq'], 'unexpected callback between idle barrier and submission')
        require(event['kind'] == 'native-unit-preview', 'unexpected post-submit tile selection')
        uid = event['unit_id']
        if uid == b and phase == 'source': promoted.append(event['seq'])
        elif uid == a and promoted:
            phase = 'destination'; destination.append(event['seq'])
        else: require(False, 'foreign/null/regressive native preview callback')
    require(promoted and destination and destination[0] < settled,
            'source promotion then destination callback missing before settled boundary')
    return promoted[0], dict(preview_unit_id=a, source_inferred_selected_tile=dict(x=10,y=8),
                            evidence='ordered callback identities; tile inferred from source and settled world, not a final mounted UI/focus observation')


def _stationary_bodies(decoded, reads, a, b, promotion):
    baseline = decoded[0]
    initial = {row['unit_id']: row for row in baseline['units']}
    require(initial[str(b)]['instance_state'] in ('unallocated','absent') and
            initial[str(b)]['unit_shown'] is False, 'source B was not hidden behind idle A')
    visibility = {}
    for row in initial.values():
        key = row['resource']['key']
        require(key not in visibility or visibility[key] == row['actor_visible'], 'ambiguous shared actor visibility')
        visibility[key] = row['actor_visible']
    def claims(packet):
        result = {}
        for row in packet['units']:
            if row['instance_state'] == 'present':
                key=row['resource']['key']; result[key]=result.get(key,0)+1
        return result
    counts = {row['resource_key']: int(row['before']) for row in baseline['instance_counts']}
    base_claims=claims(baseline); b_allocated=initial[str(b)].get('instance_id'); b_shown=False
    for packet, read in zip(decoded, reads):
        require(packet['cache_counts_before'] == baseline['cache_counts_before'], 'movement changed cached resource inventory')
        allocated=set()
        for current in packet['units']:
            old=initial[current['unit_id']]; uid=int(current['unit_id']); key=current['resource']['key']
            keys=('unit_id','manager_unit_id','owner_id','definition_id','resource')
            require(_equal({k:old[k] for k in keys},{k:current[k] for k in keys}), 'all-owner resource identity changed')
            require(current['actor_visible'] == visibility[key], 'shared body actor visibility changed')
            if 'instance_id' in current:
                claim=(key,current['instance_id']);require(claim not in allocated, 'duplicate allocated body identity');allocated.add(claim)
            if uid != a:
                require(all(current['unit_render_coords'][axis]['bits']==old['unit_render_coords'][axis]['bits'] for axis in 'xyz'),
                        'stationary all-owner body coordinates changed')
            if current['instance_state']=='present':
                # Actual Unit SetInstance/UpdateInstance default Vec3 angle.
                require(all(current['instance_angle'][axis]['bits']==0 for axis in 'xyz'), 'static body instance angle changed')
            if uid == b:
                present=current['instance_state']=='present'
                require(current['unit_shown'] is present, 'B shown/membership disagreement')
                if b_allocated is None and 'instance_id' in current:
                    require(present, 'B allocation appeared without source promotion');b_allocated=current['instance_id']
                require(current.get('instance_id')==b_allocated, 'allocated B instance changed or disappeared')
                require(not b_shown or present, 'promoted B disappeared')
                require(read['seq'] < promotion or present, 'source preview B lacks its actual promoted body')
                b_shown |= present
            elif uid != a:
                require(all(current.get(k)==old.get(k) for k in ('instance_state','instance_id','unit_shown')),
                        'unaffected body allocation/membership changed')
        present=claims(packet)
        for count in packet['instance_counts']:
            key=count['resource_key']
            require(int(count['before'])-counts[key] == present.get(key,0)-base_claims.get(key,0),
                    'unexplained shared body instance-count transition')


def _normalized_world(world):
    result = copy.deepcopy(world)
    # Actual tile-order enumeration may change when A moves; raw identities do not.
    result['units'].sort(key=lambda row: row['raw_id'])
    return result


def _expected_world(before, a):
    expected = copy.deepcopy(before)
    unit = next(u for u in expected['units'] if u['raw_id'] == a)
    require(unit['x'] == 8 and unit['y'] == 8 and type(unit['movement']) is float and unit['movement'] == 1.0,
            'wrong initial A coordinates/MP')
    detail = expected['terrain_trace']['unit_details'][unit['id']]
    require(detail['moved_this_turn'] is False and detail['automation']['command'] == '' and
            detail['work']['active'] is False and detail['terraforming_recovery']['active'] is False,
            'non-idle controlled actor')
    tiles = expected['terrain_trace']['tiles']; source = tiles['8,8']; target = tiles['10,8']
    neighborhood = {'8,8', '10,8'}
    for tile in (source, target):
        neighborhood.update(str(p['x']) + ',' + str(p['y']) for p in tile['neighbors'].values() if p is not None)
    elevations = None
    for key in neighborhood:
        tile = tiles[key]
        require(tile['is_water'] is False and tile['locked'] is False and tile['rockiness'] == 1 and
                tile['features']['river'] is False and tile['features']['xenofungus'] is False and
                tile['terraforming']['road'] is False and tile['terraforming']['mag_tube'] is False,
                'controlled route/neighbors not clear dry unlocked land')
        values = tile['elevation']
        require(set(values.values()) == {10}, 'input render elevations are not flat')
        if elevations is None: elevations = values
        require(_equal(values, elevations), 'route/neighbors differ in elevation')
    require(not any(u['x'] == 10 and u['y'] == 8 for u in expected['units']) and
            not any(b['x'] == 10 and b['y'] == 8 for b in expected['bases']), 'target is occupied')
    directions = target['neighbors']
    require(set(detail['quotes']) == set(directions) and len(directions) == 8, 'quote direction inventory')
    for direction, quote in detail['quotes'].items():
        require(quote is not None and quote['source'] == {'x':8,'y':8} and quote['allowed_now'] is True and
                quote['reason'] is None and quote['movement_kind'] == 'land' and
                quote['nominal_mp_per_turn'] == 1.0 and quote['policy_quote_version'] == 1 and
                quote['policy_quote'] == dict(road_rate=0,base_cost=1.0,after_cost=0.0,total_cost=1.0) and
                quote['quoted_step_cost_mp'] == 1.0 and quote['quoted_tiles_per_turn'] == 1.0 and
                quote['zero_cost_quote'] is False, 'unexpected initial source movement quote')
        require(quote['destination'] == source['neighbors'][direction], 'initial quote destination drift')
        quote.update(source={'x':10,'y':8}, destination=copy.deepcopy(directions[direction]),
                     allowed_now=False, reason='Unit is out of moves')
    unit.update(x=10, movement=0.0); detail['moved_this_turn'] = True
    return expected


def validate_observation(rows):
    result = _one(rows, 'RESULT'); ready = _one(rows, 'READY'); submit = _one(rows, 'SUBMIT')
    census.fields(result, {'seq','schema','a','b','owner','reads','sampled','submit_seq','receipt_seq','physical_inputs','move_commands'})
    require(result['schema'] == SCHEMA and type(result['reads']) is int and result['reads'] == 32 and
            type(result['sampled']) is int and result['sampled'] == 29 and
            type(result['physical_inputs']) is int and result['physical_inputs'] == 0 and type(result['move_commands']) is int and result['move_commands'] == 1, 'wrong bounded movement inventory')
    a, b, owner = (census.integer(result[k], 2**63-1) for k in ('a','b','owner'))
    require(a > 0 and b > 0 and a != b, 'bad actor IDs')
    census.fields(ready, {'seq','a','b','owner','selection_fence','tile_seq','preview_seq','mounted_unit_id'})
    require(all(type(ready[k]) is int for k in ('a','b','owner','mounted_unit_id','selection_fence','tile_seq','preview_seq')) and (ready['a'],ready['b'],ready['owner'],ready['mounted_unit_id']) == (a,b,owner,a), 'mounted native identity mismatch')
    events = {r['data']['seq']:r['data'] for r in rows if r['kind']=='EVENT'}
    require(ready['selection_fence'] < ready['tile_seq'] < ready['preview_seq'] < ready['seq'], 'fresh idle UI barrier missing')
    require(events.get(ready['tile_seq']) == dict(seq=ready['tile_seq'],kind='tile-select',x=8,y=8) and
            events.get(ready['preview_seq']) == dict(seq=ready['preview_seq'],kind='native-unit-preview',unit_id=a),
            'idle identity not backed by actual callbacks')
    require(submit == dict(seq=result['submit_seq'],name='move_unit',a=a,owner=owner,x=10,y=8), 'wrong sole submitted intent')
    for row in rows:
        if row['kind']=='EVENT':
            event=row['data'];require(event.get('kind') in ('tile-select','native-unit-preview'),'unknown native event')
            if event['kind']=='tile-select':
                census.fields(event, {'seq','kind','x','y'});census.integer(event['x']);census.integer(event['y'])
            else:
                census.fields(event, {'seq','kind','unit_id'})
                if event['unit_id'] is not None:census.integer(event['unit_id'])
        if row['kind']=='RECEIPT':
            value=row['data'];census.fields(value, {'seq','name','event_id','caller','success'})
            census.text(value['name'],True);census.text(value['event_id'],True);census.integer(value['caller']);require(value['success'] is True,'native receipt rejected')
    receipts = [r['data'] for r in rows if r['kind']=='RECEIPT' and r['data']['seq']>submit['seq']]
    require(len(receipts)==1, 'missing/extra post-submission receipt')
    receipt=receipts[0]; census.fields(receipt, {'seq','name','event_id','caller','success'})
    require(receipt['seq']==result['receipt_seq'] and receipt['name']=='move_unit' and
            type(receipt['caller']) is int and receipt['caller']==owner and receipt['success'] is True,
            'wrong/rejected native move receipt')
    census.text(receipt['event_id'],True)
    checkpoints=[r['data'] for r in rows if r['kind']=='CHECKPOINT']
    require(len(checkpoints)==2 and [c['label'] for c in checkpoints]==['before','after'], 'full before/after missing')
    for c in checkpoints: census.fields(c, {'seq','label','world','state','native_unit_scalars','pending'})
    require(all(c['state']=={} for c in checkpoints), 'unrecognized mounted UI checkpoint observation')
    before, projection=_world(checkpoints[0]); after, after_projection=_world(checkpoints[1])
    require(projection and sorted(projection,key=lambda r:int(r['unit_id']))==sorted(after_projection,key=lambda r:int(r['unit_id'])),
            'world identity changed')
    owners={p['raw_id'] for p in before['players']}
    for c in checkpoints: require(_pending(dict(seq=c['seq'],stage=c['label'],values=c['pending']),owners), 'checkpoint is not settled')
    local=next((p['id'] for p in before['players'] if p['raw_id']==owner),None)
    for uid,morale in ((a,2),(b,1)):
        u=next((u for u in before['units'] if u['raw_id']==uid),None)
        require(u is not None and u['owner']==local and u['x']==8 and u['y']==8 and u['morale']==morale and
                u['prototype']=='scout-patrol' and u['order']=='NO_ORDERS' and u['health']==1.0 and u['movement']==1.0,
                'wrong declared Scout stack')
    reads=[r['data'] for r in rows if r['kind']=='CENSUS']
    require(len(reads)==32 and all(type(r['ordinal']) is int for r in reads) and [r['ordinal'] for r in reads]==list(range(1,33)), 'census cap/ordinal mismatch')
    require([r['stage'] for r in reads]==['baseline']+['sample']*29+['settled','confirm'], 'sampler stage/order mismatch')
    decoded=[]
    for row in reads:
        census.fields(row, {'seq','ordinal','stage','payload'}); decoded.append(census.validate(row['payload'],projection))
    initial=_row(decoded[0],a); start=_point(initial)
    identity={k:initial[k] for k in ('unit_id','manager_unit_id','owner_id','definition_id','resource','instance_id')}
    require(initial['owner_id']==str(owner) and initial['definition_id']=='ScoutPatrol', 'wrong actual A resource owner')
    points=[]
    for packet in decoded:
        actor=_row(packet,a); require(_equal({k:actor.get(k) for k in identity},identity), 'actual A resource/instance identity changed')
        points.append(_point(actor))
    promotion, callback_state = _callbacks(rows,ready,submit,reads[30]['seq'],a,b)
    _stationary_bodies(decoded,reads,a,b,promotion)
    end=dict(x=start['x']+1.0,y=start['y'],z=start['z'])
    require(ready['seq']<checkpoints[0]['seq']<reads[0]['seq']<submit['seq']<reads[1]['seq'], 'baseline/submit order missing')
    pending=[r['data'] for r in rows if r['kind']=='PENDING']; require(bool(pending), 'no actual pending barrier')
    polls=[p for p in pending if p['stage']=='poll']; captures=[p for p in pending if p['stage']=='capture']; confirms=[p for p in pending if p['stage']=='confirm']
    require(1<=len(polls)<=600 and len(captures)==len(confirms)==1 and len(pending)==len(polls)+2, 'pending stage budget')
    require(reads[29]['seq'] < polls[0]['seq'] and receipt['seq'] < polls[0]['seq'], 'pending false before samples/accepted apply')
    for p in polls[:-1]: require(not _pending(p,owners), 'poll continued after first settled false')
    for p in (polls[-1],captures[0],confirms[0]): require(_pending(p,owners), 'pending at settled barrier')
    require(polls[-1]['seq']<captures[0]['seq']<reads[30]['seq']<checkpoints[1]['seq']<confirms[0]['seq']<reads[31]['seq']<result['seq'],
            'settled world/confirmation order mismatch')
    # Endpoints must be actual samples BEFORE any backend pending query. This is
    # an offline acceptance gate; producer phase uses fixed29 samples + receipt.
    if points[28]!=end or points[29]!=end:
        raise SamplingIncomplete('last two independent in-flight samples did not establish actual destination')
    require(points[30]==end and points[31]==end, 'settled endpoint does not match independently defined destination')
    # Every observation must belong to this one flat eastward route. One
    # intermediate point cannot excuse an overshoot, off-route point or later
    # regression. Repeated positions are allowed; acquisition is not all-ticks.
    previous=start['x']
    for point in points[1:]:
        require(start['x']<=point['x']<=end['x'] and point['y']==end['y'] and point['z']==end['z'],
                'sampled point is outside the declared flat route')
        require(point['x']>=previous, 'sampled progress regressed')
        previous=point['x']
    intermediate=[reads[i]['ordinal'] for i in range(1,30) if start['x']<points[i]['x']<end['x'] and points[i]['y']==end['y'] and points[i]['z']==end['z']]
    if not intermediate: raise SamplingIncomplete('no actual submitted intermediate point was sampled')
    expected=_expected_world(before,a)
    expected_scalars=copy.deepcopy(checkpoints[0]['native_unit_scalars'])
    next(row for row in expected_scalars if row['unit_id']==a)['movement_bits']=0
    if not _equal(_normalized_world(expected),_normalized_world(after)) or not _equal(sorted(expected_scalars,key=lambda r:r['unit_id']),sorted(checkpoints[1]['native_unit_scalars'],key=lambda r:r['unit_id'])):
        raise MovementInvariantMismatch('complete observed world differs from sole A move/MP/moved/exact quote effect')
    return dict(schema='application.unit-body-movement-proof.v1',complete=True,match=True,evaluation_only=True,
                candidate_executed=False,original_passing_cases=0,unit_count=9,census_reads=32,moving_unit_id=a,
                sampled_intermediate_ordinals=intermediate,endpoint_sample_ordinals=[29,30],
                before_after_all_seven_guarded=True,receipt_event_id=receipt['event_id'],
                final_callback_state=callback_state,
                unsupported=['final mounted UI/selection/focus','GPU/pixels','native timestamps/cadence/all-ticks','backend animation cause ID','facing/poses/clips','original parity'])


def _envelope(log,acceptance):
    digest=hashlib.sha256(log.encode()).hexdigest()
    require(type(acceptance.get('native_exit_code')) is int and acceptance['native_exit_code']==0 and
            acceptance.get('browser_closed') is True and acceptance.get('server_reaped') is True,'actual APP0 and producer cleanup required')
    transport=acceptance.get('log',{})
    require(transport.get('sealed') is True and transport.get('partial') is False and transport.get('raw_sha256')==digest==transport.get('joined_chunk_sha256'),'sealed complete raw required')
    hook=acceptance.get('hook',{})
    require(type(hook.get('main_acknowledgements')) is int and hook['main_acknowledgements']==1 and
            type(hook.get('worker_acknowledgements')) is int and hook['worker_acknowledgements']==8 and
            all(hook.get(k) is True for k in ('runtime_out_bound','runtime_err_bound','runtime_callMain_present')),'canonical ACK/binding missing')
    require(acceptance.get('budgets')==BUDGETS and acceptance.get('native_watchdog_supported') is False,'unbound executable budgets/native watchdog claim')
    clock=acceptance.get('observation_clock',{})
    require(all(type(clock.get(k)) in (int,float) and math.isfinite(clock[k]) for k in ('start_ms','deadline_ms','exit_ms')) and
            clock['deadline_ms']==clock['start_ms']+120000 and clock['start_ms']<=clock['exit_ms']<=clock['deadline_ms'], 'host observation deadline missing/exceeded')
    packets=acceptance.get('acquisition',[]);offset=0;previous=-1
    require(type(packets) is list and bool(packets),'missing acquisition offsets/timestamps')
    for packet in packets:
        census.fields(packet, {'start_utf16','end_utf16','acquired_monotonic_ms'})
        require(type(packet['start_utf16']) is int and packet['start_utf16']==offset and type(packet['end_utf16']) is int and packet['end_utf16']>offset,'acquisition gap/order')
        stamp=packet['acquired_monotonic_ms']; require(type(stamp) in (int,float) and math.isfinite(stamp) and stamp>=previous,'acquisition clock/order')
        previous=stamp;offset=packet['end_utf16']
    require(offset==len(log.encode('utf-16-le'))//2,'acquisition coverage incomplete')


def evaluate(log,acceptance):
    _envelope(log,acceptance)
    return validate_observation(parse(log))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('log',type=Path);parser.add_argument('acceptance',type=Path);parser.add_argument('output',type=Path)
    args=parser.parse_args()
    try: result=evaluate(args.log.read_text(),decode_json(args.acceptance.read_text()))
    except (ProtocolError,KeyError,TypeError,StopIteration) as error:
        category='incomplete-sampling' if isinstance(error,SamplingIncomplete) else ('complete-invariant-mismatch' if isinstance(error,MovementInvariantMismatch) else 'setup-or-invalid-observation')
        args.output.write_text(json.dumps(dict(complete=isinstance(error,MovementInvariantMismatch),match=False,status=category,error=str(error),candidate_executed=False,evaluation_only=True,original_passing_cases=0),indent=2)+'\n')
        raise SystemExit(1)
    args.output.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')

if __name__=='__main__': main()
