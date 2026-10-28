"""Asset-free synthetic boundaries; no game/original credit.

The existing terrain validator is independently exercised. Synthetic worlds here
isolate new effect/order logic; an unmocked rejection prevents schema bypass.
"""
import copy
import hashlib
import json
import unittest
from unittest.mock import patch
from protocol import ProtocolError
from state_trace import unit_body_movement_proof as proof
from state_trace import unit_body_census_proof as static
from test_unit_body_census_proof import fixture as static_fixture
from test_unit_body_census import number, vec

DIRECTIONS=dict(N=(0,-2),NE=(1,-1),E=(2,0),SE=(1,1),S=(0,2),SW=(-1,1),W=(-2,0),NW=(-1,-1))


def fixture():
    old=static_fixture(); checkpoint=old['checkpoints'][0]; world=checkpoint['world']
    world['terrain_trace']['ui']=None
    for i,base in enumerate(world['bases']):base.update(x=i*2,y=2)
    tiles={}
    for y in range(16):
        for x in range(y%2,16,2):
            tiles[f'{x},{y}']=dict(x=x,y=y,is_water=False,locked=False,rockiness=1,
                features=dict(river=False,xenofungus=False),terraforming=dict(road=False,mag_tube=False),
                elevation=dict(center=10,left=10,right=10,top=10,bottom=10),
                neighbors={d:dict(x=(x+dx)%16,y=max(0,min(15,y+dy))) for d,(dx,dy) in DIRECTIONS.items()})
    world['terrain_trace']['tiles']=tiles
    for u in world['units']:
        if u['raw_id']<8:u.update(x=(u['raw_id']-1)*2,y=2)
        detail=world['terrain_trace']['unit_details'][u['id']]
        detail.update(moved_this_turn=False,automation=dict(command=''),work=dict(active=False),terraforming_recovery=dict(active=False),quotes={})
        for direction,destination in tiles[f"{u['x']},{u['y']}"]['neighbors'].items():
            detail['quotes'][direction]=dict(source=dict(x=u['x'],y=u['y']),destination=destination,movement_kind='land',nominal_mp_per_turn=1.0,allowed_now=True,reason=None,
                policy_quote_version=1,quoted_step_cost_mp=1.0,quoted_tiles_per_turn=1.0,zero_cost_quote=False,
                policy_quote=dict(road_rate=0,base_cost=1.0,after_cost=0.0,total_cost=1.0))
    pending=[dict(owner_id=i,pending=False) for i in range(7)]
    checkpoint.update(label='before',state={},pending=copy.deepcopy(pending))
    census=json.loads(old['reads'][0]['payload']);a=census['units'][7]
    a['unit_render_coords']=vec(0.5,0.75,-0.0);a['instance_position']=vec(0.625,0.5,-0.0)
    rows=[]
    def add(tag,**data):
        data['seq']=len(rows)+1;rows.append(dict(kind=tag,data=data));return data['seq']
    ts=add('EVENT',kind='tile-select',x=8,y=8);ps=add('EVENT',kind='native-unit-preview',unit_id=8)
    add('READY',a=8,b=9,owner=0,selection_fence=0,tile_seq=ts,preview_seq=ps,mounted_unit_id=8)
    add('CHECKPOINT',**checkpoint)
    add('CENSUS',ordinal=1,stage='baseline',payload=json.dumps(census))
    submit=add('SUBMIT',name='move_unit',a=8,owner=0,x=10,y=8)
    receipt=add('RECEIPT',name='move_unit',event_id='opaque-local-token',caller=0,success=True)
    add('EVENT',kind='native-unit-preview',unit_id=9)
    for i in range(1,30):
        packet=copy.deepcopy(census);row=packet['units'][7];x=0.5+min(i/5,1.0)
        row['unit_render_coords']['x']=number(x);row['instance_position']['x']=number(x+0.125)
        # Source B promotion and actual map growth across calls are legitimate.
        other=packet['units'][8];other['instance_state']='present';other['unit_shown']=True
        other['instance_position']=copy.deepcopy(census['units'][7]['instance_position'])
        other['instance_angle']=vec(0.0,0.0,0.0) # Actual default Native Vec3, including +0 z.
        packet['instance_counts'][0].update(before='2',after='2')
        if i==5:add('EVENT',kind='native-unit-preview',unit_id=8)
        add('CENSUS',ordinal=i+1,stage='sample',payload=json.dumps(packet))
    add('PENDING',stage='poll',values=copy.deepcopy(pending))
    add('PENDING',stage='capture',values=copy.deepcopy(pending))
    endpoint=packet
    add('CENSUS',ordinal=31,stage='settled',payload=json.dumps(endpoint))
    after=copy.deepcopy(checkpoint);after['label']='after';after['world']=copy.deepcopy(world)
    actor=next(u for u in after['world']['units'] if u['raw_id']==8);actor.update(x=10,movement=0.0)
    detail=after['world']['terrain_trace']['unit_details']['unit:8'];detail['moved_this_turn']=True
    for direction,quote in detail['quotes'].items():
        quote.update(source=dict(x=10,y=8),destination=copy.deepcopy(tiles['10,8']['neighbors'][direction]),allowed_now=False,reason='Unit is out of moves')
    next(r for r in after['native_unit_scalars'] if r['unit_id']==8)['movement_bits']=0
    add('CHECKPOINT',**after)
    add('PENDING',stage='confirm',values=copy.deepcopy(pending))
    add('CENSUS',ordinal=32,stage='confirm',payload=json.dumps(endpoint))
    add('RESULT',schema=proof.SCHEMA,a=8,b=9,owner=0,reads=32,sampled=29,submit_seq=submit,receipt_seq=receipt,physical_inputs=0,move_commands=1)
    return rows


def text(rows):return ''.join('UM_'+r['kind']+'|'+json.dumps(r['data'])+'\n' for r in rows)


def acceptance(log):
    digest=hashlib.sha256(log.encode()).hexdigest()
    return dict(native_exit_code=0,browser_closed=True,server_reaped=True,
        log=dict(sealed=True,partial=False,raw_sha256=digest,joined_chunk_sha256=digest),
        hook=dict(main_acknowledgements=1,worker_acknowledgements=8,runtime_out_bound=True,runtime_err_bound=True,runtime_callMain_present=True),
        budgets=dict(proof.BUDGETS),native_watchdog_supported=False,
        observation_clock=dict(start_ms=1.0,deadline_ms=120001.0,exit_ms=100.0),
        acquisition=[dict(start_utf16=0,end_utf16=len(log.encode('utf-16-le'))//2,acquired_monotonic_ms=101.0)])


def kind(rows,tag):return [r['data'] for r in rows if r['kind']==tag]


def change_packet(row, mutate):
    packet=json.loads(row['payload']);mutate(packet);row['payload']=json.dumps(packet)


def insert_event(rows,index,**data):
    # Model a coherent new callback, not a serial-gap rejection.
    mapping={r['data']['seq']:i+1+(i>=index) for i,r in enumerate(rows)}
    for row in rows:
        value=row['data'];value['seq']=mapping[value['seq']]
        for key in ('tile_seq','preview_seq','submit_seq','receipt_seq'):
            if key in value:value[key]=mapping[value[key]]
    rows.insert(index,dict(kind='EVENT',data=dict(seq=index+1,**data)))


class MovementProofTests(unittest.TestCase):
    def evaluate(self,rows):
        log=text(rows)
        with patch.object(static.terrain_observation,'validate_snapshot',side_effect=lambda world:world) as validator:
            result=proof.evaluate(log,acceptance(log));self.assertEqual(validator.call_count,2);return result

    def test_synthetic_complete_sampled_move_and_cross_read_map_growth(self):
        result=self.evaluate(fixture());self.assertTrue(result['match']);self.assertFalse(result['candidate_executed'])
        self.assertEqual(result['census_reads'],32);self.assertTrue(result['sampled_intermediate_ordinals']);self.assertEqual(result['original_passing_cases'],0)
        self.assertEqual(result['final_callback_state']['preview_unit_id'],8)
        self.assertEqual(result['moving_unit_id'],8);self.assertNotIn('selected_unit_id',result)
        self.assertIn('final mounted UI/selection/focus',result['unsupported'])

    def test_legitimate_B_first_allocation_and_repeated_source_destination_callbacks(self):
        rows=fixture()
        def unallocated(p):
            row=p['units'][8];row['instance_state']='unallocated';del row['instance_id']
        change_packet(kind(rows,'CENSUS')[0],unallocated)
        source=next(i for i,r in enumerate(rows) if r['kind']=='EVENT' and r['data'].get('unit_id')==9)
        insert_event(rows,source+1,kind='native-unit-preview',unit_id=9)
        insert_event(rows,len(rows)-1,kind='native-unit-preview',unit_id=8)
        self.assertTrue(self.evaluate(rows)['match'])

    def test_finite_stationary_displacement_angle_membership_and_shared_counts_reject(self):
        for mode in ('foreign-displaced','B-displaced','angle','angle-sign','unaffected-shown','B-hidden','B-id','B-unallocated','shared-visible','extra-instance'):
            rows=fixture()
            def bad(p):
                row=p['units'][8 if mode.startswith('B-') else 0]
                if mode.endswith('displaced'):
                    row['unit_render_coords']['x']=number(0.75)
                    if row['instance_state']=='present':row['instance_position']['x']=number(0.875)
                elif mode=='angle':p['units'][8]['instance_angle']['x']=number(0.125)
                elif mode=='angle-sign':p['units'][8]['instance_angle']['z']=number(-0.0)
                elif mode=='unaffected-shown':row['unit_shown']=True
                elif mode in ('B-hidden','B-unallocated'):
                    row.update(instance_state='absent' if mode=='B-hidden' else 'unallocated',unit_shown=False)
                    del row['instance_position'];del row['instance_angle']
                    if mode=='B-unallocated':del row['instance_id']
                    p['instance_counts'][0].update(before='1',after='1')
                elif mode=='B-id':row['instance_id']='99'
                elif mode=='shared-visible':row['actor_visible']=False
                else:p['instance_counts'][0].update(before='3',after='3')
            change_packet(kind(rows,'CENSUS')[8],bad)
            with self.subTest(mode=mode),self.assertRaises(ProtocolError):self.evaluate(rows)

    def test_source_justified_callback_order_rejects_coherent_unrelated_or_late_events(self):
        for mode in ('foreign','null','tile','regression','before-source','late-tile'):
            rows=fixture()
            if mode=='before-source':
                event=next(r for r in rows if r['kind']=='EVENT' and r['data'].get('unit_id')==9)
                event['data']['unit_id']=8
            else:
                data=dict(kind='tile-select',x=10,y=8) if mode in ('tile','late-tile') else dict(kind='native-unit-preview',unit_id={'foreign':7,'null':None,'regression':9}[mode])
                insert_event(rows,len(rows)-1 if mode in ('regression','late-tile') else 11,**data)
            with self.subTest(mode=mode),self.assertRaises(ProtocolError):self.evaluate(rows)

    def test_unknown_telemetry_or_malformed_native_callback_is_not_ignored(self):
        log=text(fixture()).replace('UM_READY|','UM_UNKNOWN|',1)
        with self.assertRaises(ProtocolError):proof.parse(log)
        rows=fixture();kind(rows,'EVENT')[0]['x']=8.0
        with self.assertRaises(ProtocolError):self.evaluate(rows)

    def test_actual_terrain_schema_is_not_bypassed(self):
        log=text(fixture())
        with self.assertRaises(ProtocolError):proof.evaluate(log,acceptance(log))

    def test_an_early_off_route_or_reversing_point_cannot_hide_behind_a_later_intermediate(self):
        for mode in ('behind-start','overshoot','regression','off-route-y','off-route-z'):
            rows=fixture();index=3 if mode=='regression' else 2
            def bad(p):
                row=p['units'][7]
                if mode in ('behind-start','overshoot','regression'):
                    x={'behind-start':0.25,'overshoot':1.75,'regression':0.625}[mode]
                    row['unit_render_coords']['x']=number(x);row['instance_position']['x']=number(x+0.125)
                elif mode=='off-route-y':
                    row['unit_render_coords']['y']=number(0.875);row['instance_position']['y']=number(0.625)
                else:
                    row['unit_render_coords']['z']=number(0.125);row['instance_position']['z']=number(0.125)
            change_packet(kind(rows,'CENSUS')[index],bad)
            # Other real synthetic intermediates and both final endpoints remain
            # intact; only the anomalous point must prevent acceptance.
            with self.subTest(mode=mode),self.assertRaisesRegex(ProtocolError,'outside the declared flat route|progress regressed'):
                self.evaluate(rows)

    def test_repeated_progress_is_allowed_without_inventing_cadence(self):
        rows=fixture();samples=kind(rows,'CENSUS')
        samples[2]['payload']=samples[1]['payload']
        self.assertTrue(self.evaluate(rows)['match'])

    def test_missing_intermediate_is_incomplete_not_mismatch_or_pass(self):
        rows=fixture()
        for row in kind(rows,'CENSUS')[1:30]:
            def endpoint(p):
                p['units'][7]['unit_render_coords']['x']=number(1.5);p['units'][7]['instance_position']['x']=number(1.625)
            change_packet(row,endpoint)
        with self.assertRaises(proof.SamplingIncomplete):self.evaluate(rows)

    def test_missing_pre_pending_endpoint_pair_is_incomplete(self):
        rows=fixture()
        def moved(p):p['units'][7]['unit_render_coords']['x']=number(1.0);p['units'][7]['instance_position']['x']=number(1.125)
        change_packet(kind(rows,'CENSUS')[28],moved)
        with self.assertRaises(proof.SamplingIncomplete):self.evaluate(rows)

    def test_predispatch_pending_false_and_wrong_receipt_are_rejected(self):
        for mode in ('early-pending','missing-receipt','wrong-caller','rejection','duplicate','token-type','stale-fence'):
            rows=fixture();receipt=kind(rows,'RECEIPT')[0]
            if mode=='early-pending':kind(rows,'PENDING')[0]['seq']=4
            elif mode=='missing-receipt':rows[:]=[r for r in rows if r['kind']!='RECEIPT']
            elif mode=='wrong-caller':receipt['caller']=1
            elif mode=='rejection':receipt['success']=False
            elif mode=='duplicate':rows.insert(7,copy.deepcopy(rows[6]))
            elif mode=='token-type':receipt['event_id']=90
            else:kind(rows,'RESULT')[0]['submit_seq']=receipt['seq']+1
            with self.subTest(mode=mode),self.assertRaises(ProtocolError):self.evaluate(rows)

    def test_source_world_and_foreign_mutations_are_complete_mismatch(self):
        for mode in ('foreign-health','energy','actor-extra','quote','tile'):
            rows=fixture();world=kind(rows,'CHECKPOINT')[1]['world']
            if mode=='foreign-health':world['units'][6]['order']='HOLD'
            elif mode=='energy':world['players'][1]['extra']=1
            elif mode=='actor-extra':next(u for u in world['units'] if u['raw_id']==8)['morale']=3
            elif mode=='quote':world['terrain_trace']['unit_details']['unit:8']['quotes']['E']['reason']='anything'
            else:world['terrain_trace']['tiles']['0,0']['features']['river']=True
            with self.subTest(mode=mode),self.assertRaises(proof.MovementInvariantMismatch):self.evaluate(rows)

    def test_native_scalar_type_f32_or_identity_failure_rejects(self):
        for mode in ('bits','type','missing-owner','missing-unit','sign'):
            rows=fixture();c=kind(rows,'CHECKPOINT')[1]
            if mode=='bits':c['native_unit_scalars'][6]['health_bits']^=1
            elif mode=='type':c['native_unit_scalars'][6]['movement_type']='Int'
            elif mode=='missing-owner':c['world']['players'].pop()
            elif mode=='missing-unit':c['world']['units'].pop()
            else:c['native_unit_scalars'][7]['movement_bits']=2147483648
            with self.subTest(mode=mode),self.assertRaises(ProtocolError):self.evaluate(rows)

    def test_instance_identity_normalization_counts_and_ownership_fail_closed(self):
        for mode in ('id','owner','bits','count','hidden','missing-row','unknown-key'):
            rows=fixture()
            def bad(p):
                row=p['units'][7]
                if mode=='id':row['instance_id']='99'
                elif mode=='owner':row['owner_id']='1'
                elif mode=='bits':row['instance_position']['x']['bits']^=1
                elif mode=='count':p['instance_counts'][0]['after']='9'
                elif mode=='hidden':row['unit_shown']=False
                elif mode=='missing-row':p['units'].pop()
                else:row['invented_facing']='east'
            change_packet(kind(rows,'CENSUS')[3],bad)
            with self.subTest(mode=mode),self.assertRaises(ProtocolError):self.evaluate(rows)

    def test_sampling_call_limit_stage_and_phase_order_are_strict(self):
        for mode in ('count','phase','post-result','confirmation','pending-after-false'):
            rows=fixture()
            if mode=='count':kind(rows,'RESULT')[0]['reads']=33
            elif mode=='phase':kind(rows,'CENSUS')[10]['stage']='settled'
            elif mode=='post-result':rows.append(copy.deepcopy(rows[-3]))
            elif mode=='confirmation':kind(rows,'PENDING')[-1]['values'][2]['pending']=True
            else:kind(rows,'PENDING')[1]['stage']='poll'
            with self.subTest(mode=mode),self.assertRaises(ProtocolError):self.evaluate(rows)

    def test_real_flat_dry_input_is_required(self):
        for mode in ('height','road','river','occupied'):
            rows=fixture();world=kind(rows,'CHECKPOINT')[0]['world']
            if mode=='height':world['terrain_trace']['tiles']['8,8']['elevation']['top']=11
            elif mode=='road':world['terrain_trace']['tiles']['10,8']['terraforming']['road']=True
            elif mode=='river':world['terrain_trace']['tiles']['10,8']['features']['river']=True
            else:world['bases'][1].update(x=10,y=8)
            with self.subTest(mode=mode),self.assertRaises(ProtocolError):self.evaluate(rows)

    def test_exit_seal_budget_acquisition_and_native_watchdog_claim_rejected(self):
        log=text(fixture())
        for mode in ('app','seal','worker','budget','watchdog','clock','late','acquisition','hash'):
            control=acceptance(log)
            if mode=='app':control['native_exit_code']=None
            elif mode=='seal':control['log']['sealed']=False
            elif mode=='worker':control['hook']['worker_acknowledgements']=7
            elif mode=='budget':control['budgets']['outer_seconds']=240
            elif mode=='watchdog':control['native_watchdog_supported']=True
            elif mode=='clock':control['observation_clock']['deadline_ms']+=1
            elif mode=='late':control['observation_clock']['exit_ms']=120002.0
            elif mode=='acquisition':control['acquisition'][0]['end_utf16']-=1
            else:control['log']['joined_chunk_sha256']='0'*64
            with self.subTest(mode=mode),patch.object(proof,'parse') as parser,self.assertRaises(ProtocolError):
                proof.evaluate(log,control)
            parser.assert_not_called()

if __name__=='__main__':unittest.main()
