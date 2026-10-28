// Asset-free synthetic protocol boundaries; no native/game/original credit.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluateUnitStackOrder,parseUnitStackOrderLog} from './unit-stack-order-proof.mjs';

const world={turn:1,players:[],bases:[],units:[],terrain_trace:{tiles:{},ui:{},unit_details:{}}};
for(let i=0;i<7;i++){const owner='player:'+String(i+1);world.players.push({id:owner,raw_id:i});world.bases.push({id:'base:'+i,owner,raw_id:i+1});world.units.push({id:'unit:'+i,owner,raw_id:i+1,prototype:'scout-patrol',morale:2,health:1,movement:1,order:'NO_ORDERS',x:i*2,y:2});}
for(let i=0;i<128;i++)world.terrain_trace.tiles[String(i)]={height:i,type:'synthetic'};
for(const id of[8,9])world.terrain_trace.unit_details['unit:'+id]={definition_id:'ScoutPatrol',movement_kind:'land',nominal_mp_per_turn:1,can_terraform:false};
for(const [id,morale]of[[8,2],[9,1]])world.units.push({id:'unit:'+id,owner:'player:1',raw_id:id,prototype:'scout-patrol',morale,health:1,movement:1,order:'NO_ORDERS',x:8,y:8});
const record=expected=>{
 const receipt={name:'unit_hold',event_id:'opaque_slot_123',caller:0,success:true,unit_id:8};
 const metadata=(serial,id,tile)=>({event_serial:serial,ui:{bound_unit_id:id,rendered_unit_id:id,selected_unit_id:null},last_preview:{serial,unit_id:id},last_tile:{serial:tile,x:8,y:8}});
 const warm=metadata(2,8,1);warm.world=structuredClone(world);
 const after=metadata(4,expected,1);after.world=structuredClone(world);after.world.units.find(u=>u.raw_id===8).order='HOLD';
 const final=metadata(6,expected,5);final.world=structuredClone(after.world);
 return{schema:'application.unit-stack-order-observation.v1',actors:{a:8,b:9,owner:0},warm_tile:{serial:1,x:8,y:8},refresh_preview:{serial:4,unit_id:expected},hold_receipt:receipt,warm,after_hold:after,final,events:[{serial:1,kind:'tile-select',data:{x:8,y:8}},{serial:2,kind:'native-unit-preview',data:{unit_id:8}},{serial:3,kind:'native-hold-result',data:receipt},{serial:4,kind:'native-unit-preview',data:{unit_id:expected}},{serial:5,kind:'tile-select',data:{x:8,y:8}},{serial:6,kind:'native-unit-preview',data:{unit_id:expected}}]};
};

const logFor=(input)=>{
 const meta=structuredClone(input),lines=[];
 for(const label of ['warm','after_hold','final']){
  const state=structuredClone(meta[label]);delete state.world;
  lines.push('UO_CHECKPOINT|'+JSON.stringify({label,state,world:meta[label].world}));meta[label]=state;
 }
 lines.push('UO_RESULT|'+JSON.stringify(meta));return lines;
};

test('complete source-priority agreement is evaluator evidence with zero engine/original credit',()=>{
 const result=evaluateUnitStackOrder(record(9));assert.equal(result.complete,true);assert.equal(result.match,true);
 assert.equal(result.candidate_executed,false);assert.equal(result.evaluation_only,true);assert.equal(result.original_passing_cases,0);
});
test('complete guarded stale HUD identity is a mismatch rather than unsupported setup',()=>{
 const result=evaluateUnitStackOrder(record(8));assert.equal(result.complete,true);assert.equal(result.match,false);
 assert.equal(result.expected_unit_id,9);assert.equal(result.observed_unit_id,8);assert.equal(result.all_seven_native_guard,true);
});
test('actual Widget, label and native callback identities must agree independently',()=>{
 const wrongWidget=record(9);wrongWidget.final.ui.bound_unit_id=8;assert.throws(()=>evaluateUnitStackOrder(wrongWidget));
 const wrongLabel=record(9);wrongLabel.final.ui.rendered_unit_id=8;assert.throws(()=>evaluateUnitStackOrder(wrongLabel));
 const selected=record(9);selected.final.ui.selected_unit_id=9;assert.throws(()=>evaluateUnitStackOrder(selected));
});
test('Hold receipt requires exact command, opaque String transaction and controlled owner/entity success',()=>{
 for(const [key,value] of [['name','unit_skip_turn'],['event_id',123],['event_id',''],['caller',2],['success',false],['unit_id',9]]){
  const bad=record(9);bad.hold_receipt[key]=value;assert.throws(()=>evaluateUnitStackOrder(bad));
 }
});
test('a backend ACK cannot substitute for the new actual frontend preview',()=>{
 const missing=record(9);missing.events=missing.events.filter(event=>event.serial!==4);assert.throws(()=>evaluateUnitStackOrder(missing));
 const old=record(9);old.refresh_preview.serial=old.warm.event_serial;assert.throws(()=>evaluateUnitStackOrder(old));
});
test('final tile selection and preview must both be newer than the after-Hold boundary',()=>{
 const oldTile=record(9);oldTile.final.last_tile.serial=1;assert.throws(()=>evaluateUnitStackOrder(oldTile));
 const oldPreview=record(9);oldPreview.final.last_preview.serial=4;assert.throws(()=>evaluateUnitStackOrder(oldPreview));
});
test('unrelated owner/unit or terrain changes cannot become a priority mismatch',()=>{
 const unit=record(9);unit.after_hold.world.units[0].health=0.9;assert.throws(()=>evaluateUnitStackOrder(unit));
 const terrain=record(9);terrain.final.world.terrain_trace.tiles['3'].height=999;assert.throws(()=>evaluateUnitStackOrder(terrain));
});
test('complete seven-owner native inventory is required before evaluating the HUD',()=>{
 const players=record(9);players.warm.world.players.pop();assert.throws(()=>evaluateUnitStackOrder(players));
 const units=record(9);units.warm.world.units.pop();assert.throws(()=>evaluateUnitStackOrder(units));
 const tiles=record(9);delete tiles.warm.world.terrain_trace.tiles['3'];assert.throws(()=>evaluateUnitStackOrder(tiles));
});
test('actor source definition, initial health/movement/order and morale are controlled inputs',()=>{
 const morale=record(9);morale.warm.world.units.find(unit=>unit.raw_id===8).morale=1;assert.throws(()=>evaluateUnitStackOrder(morale));
 const health=record(9);health.warm.world.units.find(unit=>unit.raw_id===8).health=0.5;assert.throws(()=>evaluateUnitStackOrder(health));
 const definition=record(9);definition.warm.world.terrain_trace.unit_details['unit:8'].definition_id='Other';assert.throws(()=>evaluateUnitStackOrder(definition));
});
test('native event prefix must be monotonic, correctly typed and complete through the final state',()=>{
 const repeated=record(9);repeated.events[3].serial=3;assert.throws(()=>evaluateUnitStackOrder(repeated));
 const wrongKind=record(9);wrongKind.events[0].kind='unit-select';assert.throws(()=>evaluateUnitStackOrder(wrongKind));
 const wrongEnd=record(9);wrongEnd.final.event_serial=7;assert.throws(()=>evaluateUnitStackOrder(wrongEnd));
});
test('parser attaches three independent immediately serialized worlds to matching metadata',()=>{
 const parsed=parseUnitStackOrderLog(logFor(record(9)).join('\n'));assert.equal(evaluateUnitStackOrder(parsed).match,true);
 const stale=parseUnitStackOrderLog(logFor(record(8)).join('\n'));assert.equal(evaluateUnitStackOrder(stale).match,false);
});
test('missing, duplicated or metadata-drifted native checkpoints fail closed',()=>{
 const lines=logFor(record(9));assert.throws(()=>parseUnitStackOrderLog(lines.slice(1).join('\n')));
 assert.throws(()=>parseUnitStackOrderLog([...lines,lines[0]].join('\n')));
 const changed=[...lines],first=JSON.parse(changed[0].split('UO_CHECKPOINT|')[1]);first.state.event_serial++;
 changed[0]='UO_CHECKPOINT|'+JSON.stringify(first);assert.throws(()=>parseUnitStackOrderLog(changed.join('\n')));
});
test('unsupported/native failure or absent/duplicate result never counts as complete visible evidence',()=>{
 const lines=logFor(record(9)),text=lines.join('\n');assert.throws(()=>parseUnitStackOrderLog('UO_UNSUPPORTED|setup\n'+text));
 assert.throws(()=>parseUnitStackOrderLog('Unhandled exception\n'+text));assert.throws(()=>parseUnitStackOrderLog(lines.slice(0,3).join('\n')));
 assert.throws(()=>parseUnitStackOrderLog(text+'\n'+lines[3]));
});
