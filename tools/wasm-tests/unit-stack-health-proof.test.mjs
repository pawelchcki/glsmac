// Synthetic boundary coverage only. These tests run no game or native engine.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {evaluateUnitStackHealthLog,parseUnitStackHealthLog,healthCommand,healthNonce,currentSourceUnitWeight} from './unit-stack-health-proof.mjs';

const world={turn:1,players:[],bases:[],units:[],terrain_trace:{tiles:{},ui:{},unit_details:{}}};
for(let i=0;i<7;i++){
 const owner='player:'+String(i+1);world.players.push({id:owner,raw_id:i});world.bases.push({id:'base:'+i,owner,raw_id:i+1});
 world.units.push({id:'unit:'+i,owner,raw_id:i+1,prototype:'scout-patrol',morale:2,health:1,movement:1,order:'NO_ORDERS',x:i*2,y:2});
}
for(let i=0;i<128;i++)world.terrain_trace.tiles[String(i)]={height:i,type:'synthetic'};
for(const [id,morale]of[[8,2],[9,1]]){
 world.units.push({id:'unit:'+id,owner:'player:1',raw_id:id,prototype:'scout-patrol',morale,health:1,movement:1,order:'NO_ORDERS',x:8,y:8});
 world.terrain_trace.unit_details['unit:'+id]={definition_id:'ScoutPatrol',movement_kind:'land',nominal_mp_per_turn:1,can_terraform:false};
}
const record=observed=>{
 const receipt={name:healthCommand,event_id:'opaque_health_1',caller:0,success:true,unit_id:8,owner_id:0,turn:1,previous_health_bits:1065353216,health_type:'Float',health_bits:1056964608,nonce:healthNonce};
 const boundary=(serial,id,tile,applied)=>({event_serial:serial,ui:{bound_unit_id:id,rendered_unit_id:id,selected_unit_id:null},last_preview:{serial,unit_id:id},last_tile:{serial:tile,x:8,y:8},applied_count:applied,rollback_count:0,world:structuredClone(world)});
 const warm=boundary(2,8,1,0),after=boundary(4,observed,1,1),final=boundary(6,observed,5,1);
 for(const checkpoint of [warm,after,final]){
  if(checkpoint!==warm)checkpoint.world.units.find(unit=>unit.raw_id===8).health=0.5;
  checkpoint.native_unit_scalars=checkpoint.world.units.map(unit=>({unit_id:unit.raw_id,owner_id:checkpoint.world.players.find(player=>player.id===unit.owner).raw_id,
   id_type:'Int',owner_type:'Int',health_type:'Float',health_bits:unit.health===0.5?1056964608:1065353216,movement_type:'Float',movement_bits:1065353216}));
 }
 return{schema:'application.unit-stack-health-observation.v1',actors:{a:8,b:9,owner:0},warm_tile:{serial:1,x:8,y:8},refresh_preview:{serial:4,unit_id:observed},health_receipt:receipt,warm,after_health:after,final,
  events:[{serial:1,kind:'tile-select',data:{x:8,y:8}},{serial:2,kind:'native-unit-preview',data:{unit_id:8}},{serial:3,kind:'native-health-result',data:receipt},
   {serial:4,kind:'native-unit-preview',data:{unit_id:observed}},{serial:5,kind:'tile-select',data:{x:8,y:8}},{serial:6,kind:'native-unit-preview',data:{unit_id:observed}}]};
};
const logFor=input=>{
 const data=structuredClone(input),lines=[];let emitted=0;
 for(const label of ['warm','after_health','final']){
  const checkpoint=data[label];
  while(emitted<data.events.length&&data.events[emitted].serial<=checkpoint.event_serial)lines.push('UH_EVENT|'+JSON.stringify(data.events[emitted++]));
  const state=structuredClone(checkpoint);delete state.world;delete state.native_unit_scalars;
  lines.push('UH_CHECKPOINT|'+JSON.stringify({label,state,world:checkpoint.world,native_unit_scalars:checkpoint.native_unit_scalars}));data[label]=state;
 }
 while(emitted<data.events.length)lines.push('UH_EVENT|'+JSON.stringify(data.events[emitted++]));
 lines.push('UH_RESULT|'+JSON.stringify(data));return lines.join('\n');
};
const acceptance=text=>{const sha=createHash('sha256').update(text).digest('hex');return{native_exit_code:0,log:{sealed:true,partial:false,raw_sha256:sha,joined_chunk_sha256:sha},
 hook:{main_acknowledgements:1,worker_acknowledgements:8,runtime_out_bound:true,runtime_err_bound:true,runtime_callMain_present:true}};};
const evaluate=input=>{const text=logFor(input);return evaluateUnitStackHealthLog(text,acceptance(text));};

test('complete health-priority agreement remains synthetic evaluation with zero game credit',()=>{
 const result=evaluate(record(9));assert.equal(result.match,true);assert.equal(result.complete,true);assert.equal(result.evaluation_only,true);assert.equal(result.candidate_executed,false);assert.equal(result.original_passing_cases,0);
 assert.deepEqual(result.source_priority,{warm:{a:272,b:270},after_health:{a:268,b:270}});
});
test('fully guarded stale HUD is a complete mismatch instead of setup failure',()=>{
 const result=evaluate(record(8));assert.equal(result.match,false);assert.equal(result.complete,true);assert.equal(result.expected_unit_id,9);assert.equal(result.observed_unit_id,8);
});
test('source priority derives from actual ownership, readiness, definition and truncated health contribution',()=>{
 const actor={owner:'local',health:1,movement:1,order:'NO_ORDERS',morale:2};
 assert.equal(currentSourceUnitWeight(actor,'ScoutPatrol','local'),272);
 assert.equal(currentSourceUnitWeight({...actor,health:0.5},'ScoutPatrol','local'),268);
 assert.equal(currentSourceUnitWeight({...actor,health:0.99},'ScoutPatrol','local'),271,'A small health change need not reverse the observed ranking');
 assert.equal(currentSourceUnitWeight({...actor,order:'HOLD'},'ScoutPatrol','local'),72);
 assert.equal(currentSourceUnitWeight(actor,'ScoutPatrol','other'),72);
 assert.equal(currentSourceUnitWeight(actor,'SporeLauncher','local'),212);
 assert.equal(currentSourceUnitWeight({...actor,movement:0.024},'ScoutPatrol','local'),72);
});
test('exit, seal, complete chunks and canonical callbacks are required before mismatch evaluation',()=>{
 const text=logFor(record(8));assert.throws(()=>evaluateUnitStackHealthLog(text));
 for(const mutate of [a=>a.native_exit_code=1,a=>a.log.sealed=false,a=>a.log.partial=true,a=>a.log.raw_sha256='0'.repeat(64),a=>a.log.joined_chunk_sha256='0'.repeat(64),
  a=>a.hook.worker_acknowledgements=7,a=>a.hook.main_acknowledgements=0,a=>a.hook.runtime_callMain_present=false,a=>a.hook.runtime_out_bound=false,a=>a.hook.runtime_err_bound=false]){
  const guarded=acceptance(text);mutate(guarded);assert.throws(()=>evaluateUnitStackHealthLog(text,guarded));
 }
});
test('receipt preserves opaque transaction token and exact actor/owner/turn/nonce/scalar contract',()=>{
 for(const [key,value]of[['name','unit_hold'],['event_id',1],['event_id',''],['caller',1],['owner_id',1],['unit_id',9],['turn',2],['success',false],['nonce','foreign'],['health_type','Int'],['health_bits',1065353216],['previous_health_bits',1056964608]]){
  const bad=record(9);bad.health_receipt[key]=value;assert.throws(()=>evaluate(bad));
 }
});
test('receipt must match a unique separately emitted native result after warm',()=>{
 const missing=record(9);missing.events.splice(2,1);assert.throws(()=>evaluate(missing));
 const mismatch=record(9);mismatch.events[2].data={...mismatch.health_receipt,event_id:'foreign'};assert.throws(()=>evaluate(mismatch));
 const duplicate=record(9);duplicate.events[3].kind='native-health-result';duplicate.events[3].data=structuredClone(duplicate.health_receipt);assert.throws(()=>evaluate(duplicate));
});
test('backend receipt cannot substitute for a fresh native frontend callback and reselection',()=>{
 const stale=record(9);stale.refresh_preview.serial=2;assert.throws(()=>evaluate(stale));
 const noPreview=record(9);noPreview.events[3].kind='unit-select';assert.throws(()=>evaluate(noPreview));
 const noReselect=record(9);noReselect.final.last_tile.serial=1;assert.throws(()=>evaluate(noReselect));
});
test('actual Widget, text and preview identities must agree at each boundary',()=>{
 for(const label of ['warm','after_health','final'])for(const field of ['bound_unit_id','rendered_unit_id','selected_unit_id']){
  const bad=record(9);bad[label].ui[field]=field==='selected_unit_id'?8:77;assert.throws(()=>evaluate(bad));
 }
});
test('every owner and complete native entity/terrain inventory stays present',()=>{
 for(const mutate of [r=>r.warm.world.players.pop(),r=>r.warm.world.bases.pop(),r=>r.warm.world.units.pop(),r=>delete r.warm.world.terrain_trace.tiles['3'],
  r=>r.warm.world.players[1].raw_id=0,r=>r.warm.world.units[0].raw_id=8]){const bad=record(9);mutate(bad);assert.throws(()=>evaluate(bad));}
});
test('only the declared actor health may change across complete native worlds',()=>{
 for(const mutate of [r=>r.after_health.world.units[0].health=0.5,r=>r.final.world.units.find(unit=>unit.raw_id===8).order='HOLD',r=>r.final.world.terrain_trace.tiles['4'].height=99,
  r=>r.after_health.world.bases[0].name='unexpected',r=>r.final.world.players[1].energy=99]){const bad=record(9);mutate(bad);assert.throws(()=>evaluate(bad));}
});
test('full-to-half health requires exact Float32 bits and types for every native unit',()=>{
 for(const mutate of [r=>r.after_health.world.units.find(unit=>unit.raw_id===8).health=0.5001,r=>r.final.native_unit_scalars.find(row=>row.unit_id===8).health_bits=1065353216,
  r=>r.warm.native_unit_scalars[0].health_type='Int',r=>r.final.native_unit_scalars[0].movement_bits=0,r=>r.after_health.native_unit_scalars.pop(),
  r=>r.final.native_unit_scalars[0].owner_id=6]){const bad=record(9);mutate(bad);assert.throws(()=>evaluate(bad));}
});
test('one application and zero rollback are observed independently from the result receipt',()=>{
 for(const [label,key,value]of[['warm','applied_count',1],['after_health','applied_count',0],['final','applied_count',2],['final','rollback_count',1]]){
  const bad=record(9);bad[label][key]=value;assert.throws(()=>evaluate(bad));
 }
});
test('actor prototype, readiness, source morale and initial health remain declared inputs',()=>{
 for(const mutate of [r=>r.warm.world.units.find(unit=>unit.raw_id===8).health=0.5,r=>r.warm.world.units.find(unit=>unit.raw_id===9).morale=2,
  r=>r.warm.world.terrain_trace.unit_details['unit:8'].definition_id='Formers',r=>r.warm.world.units.find(unit=>unit.raw_id===8).movement=0]){const bad=record(9);mutate(bad);assert.throws(()=>evaluate(bad));}
});
test('raw checkpoint order and exact event-prefix boundary cannot be reconstructed after the action',()=>{
 const lines=logFor(record(9)).split('\n'),checkpoint=lines.findIndex(line=>line.startsWith('UH_CHECKPOINT|'));
 const late=[...lines];late.splice(checkpoint,1);late.splice(checkpoint+2,0,lines[checkpoint]);assert.throws(()=>parseUnitStackHealthLog(late.join('\n')));
 const wrong=structuredClone(record(9));wrong.after_health.event_serial=3;assert.throws(()=>evaluate(wrong));
});
test('missing, duplicate or metadata-substituted native world checkpoints fail closed',()=>{
 const lines=logFor(record(9)).split('\n'),checkpoint=lines.findIndex(line=>line.startsWith('UH_CHECKPOINT|'));
 assert.throws(()=>parseUnitStackHealthLog(lines.filter((_,index)=>index!==checkpoint).join('\n')));
 assert.throws(()=>parseUnitStackHealthLog([...lines.slice(0,checkpoint),lines[checkpoint],...lines.slice(checkpoint)].join('\n')));
 const row=JSON.parse(lines[checkpoint].split('UH_CHECKPOINT|')[1]);row.state.applied_count=1;
 const drift=[...lines];drift[checkpoint]='UH_CHECKPOINT|'+JSON.stringify(row);assert.throws(()=>parseUnitStackHealthLog(drift.join('\n')));
});
test('unsupported, fatal, absent or duplicated results never become complete visible evidence',()=>{
 const text=logFor(record(9)),lines=text.split('\n');
 for(const prefix of ['UH_UNSUPPORTED|setup','Unhandled exception','Event result listener failed','[Error] native'])assert.throws(()=>parseUnitStackHealthLog(prefix+'\n'+text));
 assert.throws(()=>parseUnitStackHealthLog(lines.slice(0,-1).join('\n')));assert.throws(()=>parseUnitStackHealthLog(text+'\n'+lines.at(-1)));
 assert.throws(()=>parseUnitStackHealthLog(text+'\n'+lines[0]));
});
