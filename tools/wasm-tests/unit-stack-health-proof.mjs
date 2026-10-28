// Pure candidate HUD consistency evaluator. No engine or original-game credit.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const healthCommand='fixture_stack_health_half_v1';
export const healthNonce='stack-health-a-half-v1';
const hash=text=>createHash('sha256').update(text).digest('hex');
const f32Bits=value=>{assert.ok(Number.isFinite(value));const bytes=new DataView(new ArrayBuffer(4));bytes.setFloat32(0,value,true);return bytes.getUint32(0,true);};
const nativeWorld=checkpoint=>{const world=structuredClone(checkpoint.world);delete world.terrain_trace.ui;return world;};

// Pinned frontend Unit::{ShouldBeActive,GetSelectionWeight}, backend minimum
// constants and UnitDef::IsArtillery. The launcher records their exact source
// bytes and requires the native source tree used to build the runtime.
export function currentSourceUnitWeight(unit,definitionID,localOwner){
 assert.ok(Number.isFinite(unit.health)&&unit.health>=0&&unit.health<=1&&Number.isFinite(unit.movement));
 assert.ok(Number.isSafeInteger(unit.morale)&&unit.morale>=0&&unit.morale<=6);assert.equal(typeof definitionID,'string');
 const active=unit.owner===localOwner&&Math.fround(unit.health)>=Math.fround(0.025)&&Math.fround(unit.movement)>=Math.fround(0.025)&&unit.order==='NO_ORDERS';
 let weight=active?200:0;if(definitionID!=='SporeLauncher')weight+=60;weight+=unit.morale*2;
 // size_t += Float uses Float arithmetic followed by integer conversion.
 return Math.trunc(Math.fround(weight+Math.fround(Math.fround(unit.health)*8)));
}

export function parseUnitStackHealthLog(text){
 assert.doesNotMatch(text,/UH_UNSUPPORTED|UH_ERROR|Unhandled exception|Event result listener failed|RuntimeError:|Assertion failed|Aborted\(|Uncaught|\[Error\]/i);
 const rows=prefix=>text.split('\n').flatMap(line=>{const match=line.match(new RegExp('^\\s*(?:\\[[^\\]]+\\]\\s*)?'+prefix+'\\|(.+)$'));return match?[JSON.parse(match[1])]:[];});
 const results=rows('UH_RESULT'),checkpoints=rows('UH_CHECKPOINT'),events=rows('UH_EVENT');
 assert.equal(results.length,1,'Exactly one complete native health observation');assert.equal(checkpoints.length,3,'Three independently serialized complete native worlds');
 let lastEvent=0,closed=false;const labels=[];
 for(const line of text.split('\n')){
  const match=line.match(/^\s*(?:\[[^\]]+\]\s*)?UH_(EVENT|CHECKPOINT|RESULT)\|(.+)$/);if(!match)continue;
  assert.equal(closed,false,'No observation rows after the final result');const row=JSON.parse(match[2]);
  if(match[1]==='EVENT')lastEvent=row.serial;
  else if(match[1]==='CHECKPOINT'){assert.equal(row.state.event_serial,lastEvent,'Checkpoint must be serialized at the actual event prefix boundary');labels.push(row.label);}
  else{assert.deepEqual(labels,['warm','after_health','final']);assert.equal(row.final.event_serial,lastEvent);closed=true;}
 }
 assert.deepEqual(labels,['warm','after_health','final'],'Native boundaries must be serialized in action order');
 const record=results[0];assert.deepEqual(record.events,events,'Final event prefix must equal the separately emitted actual event rows');
 for(const label of ['warm','after_health','final']){
  const found=checkpoints.filter(row=>row.label===label);assert.equal(found.length,1,`One immediate ${label} native checkpoint`);
  assert.deepEqual(record[label],found[0].state,'Final metadata cannot replace an earlier native boundary');
  record[label].world=found[0].world;record[label].native_unit_scalars=found[0].native_unit_scalars;
 }
 return record;
}

function evaluate(record){
 assert.equal(record.schema,'application.unit-stack-health-observation.v1');
 const {a,b,owner}=record.actors;assert.ok(Number.isSafeInteger(a)&&a>0&&Number.isSafeInteger(b)&&b>0&&a!==b&&Number.isSafeInteger(owner)&&owner>=0);
 const before=nativeWorld(record.warm);assert.equal(before.players.length,7);assert.equal(before.bases.length,7);assert.equal(before.units.length,9);assert.equal(Object.keys(before.terrain_trace.tiles).length,128);
 assert.equal(new Set(before.players.map(player=>player.id)).size,7);assert.equal(new Set(before.players.map(player=>player.raw_id)).size,7);
 assert.equal(new Set(before.units.map(unit=>unit.raw_id)).size,9);assert.equal(new Set(before.units.map(unit=>unit.id)).size,9);
 for(const player of before.players){assert.ok(Number.isSafeInteger(player.raw_id));assert.ok(before.units.some(unit=>unit.owner===player.id));assert.ok(before.bases.some(base=>base.owner===player.id));}
 const first=before.units.find(unit=>unit.raw_id===a),second=before.units.find(unit=>unit.raw_id===b);assert.ok(first&&second);
 for(const [unit,morale]of[[first,2],[second,1]]){
  assert.equal(unit.prototype,'scout-patrol');assert.equal(unit.morale,morale);assert.equal(unit.health,1);assert.equal(unit.movement,1);assert.equal(unit.order,'NO_ORDERS');assert.equal(unit.x,8);assert.equal(unit.y,8);
  const detail=before.terrain_trace.unit_details[unit.id];assert.ok(detail);assert.equal(detail.definition_id,'ScoutPatrol');assert.equal(detail.movement_kind,'land');assert.equal(detail.nominal_mp_per_turn,1);assert.equal(detail.can_terraform,false);
 }
 assert.equal(first.owner,second.owner);assert.ok(before.players.some(player=>player.raw_id===owner&&player.id===first.owner));
 const eventMap=new Map();let serial=0;
 for(const event of record.events){assert.ok(Number.isSafeInteger(event.serial)&&event.serial>serial);serial=event.serial;eventMap.set(serial,event);}
 assert.equal(serial,record.final.event_serial,'Complete actual prefix ends at final checkpoint');
 const requireEvent=(id,kind)=>{assert.ok(Number.isSafeInteger(id));const event=eventMap.get(id);assert.ok(event);assert.equal(event.kind,kind);return event.data;};
 const requireUI=checkpoint=>{
  assert.ok(Number.isSafeInteger(checkpoint.event_serial)&&checkpoint.event_serial>0&&checkpoint.event_serial<=serial);
  assert.ok(checkpoint.last_preview.serial<=checkpoint.event_serial);assert.ok(checkpoint.last_tile.serial<=checkpoint.event_serial);
  assert.equal(checkpoint.ui.bound_unit_id,checkpoint.last_preview.unit_id);assert.equal(checkpoint.ui.rendered_unit_id,checkpoint.last_preview.unit_id);assert.equal(checkpoint.ui.selected_unit_id,null);
  assert.deepEqual(requireEvent(checkpoint.last_tile.serial,'tile-select'),{x:8,y:8});
  assert.equal(requireEvent(checkpoint.last_preview.serial,'native-unit-preview').unit_id,checkpoint.last_preview.unit_id);
 };
 for(const checkpoint of [record.warm,record.after_health,record.final])requireUI(checkpoint);
 assert.equal(record.warm.ui.bound_unit_id,a);assert.equal(record.warm.applied_count,0);assert.equal(record.warm.rollback_count,0);
 assert.deepEqual(record.warm_tile,record.warm.last_tile);assert.ok(record.warm_tile.serial>0&&record.warm.last_preview.serial>record.warm_tile.serial);
 const receipt=record.health_receipt;assert.equal(receipt.name,healthCommand);assert.equal(typeof receipt.event_id,'string');assert.ok(receipt.event_id.length>0);
 assert.equal(receipt.caller,owner);assert.equal(receipt.owner_id,owner);assert.equal(receipt.unit_id,a);assert.equal(receipt.success,true);assert.equal(receipt.nonce,healthNonce);
 assert.ok(Number.isSafeInteger(receipt.turn));assert.equal(receipt.turn,before.turn);assert.equal(receipt.previous_health_bits,1065353216);assert.equal(receipt.health_type,'Float');assert.equal(receipt.health_bits,1056964608);
 const receipts=record.events.filter(event=>event.kind==='native-health-result');assert.equal(receipts.length,1);assert.deepEqual(receipts[0].data,receipt);
 assert.ok(receipts[0].serial>record.warm.event_serial&&receipts[0].serial<=record.after_health.event_serial);
 assert.deepEqual(record.refresh_preview,record.after_health.last_preview);assert.ok(record.refresh_preview.serial>record.warm.event_serial);
 assert.equal(requireEvent(record.refresh_preview.serial,'native-unit-preview').unit_id,record.refresh_preview.unit_id);
 assert.ok(record.after_health.event_serial>record.warm.event_serial&&record.final.event_serial>record.after_health.event_serial);
 assert.ok(record.final.last_tile.serial>record.after_health.event_serial&&record.final.last_preview.serial>record.final.last_tile.serial);
 for(const checkpoint of [record.warm,record.after_health,record.final]){
  const world=nativeWorld(checkpoint),scalars=checkpoint.native_unit_scalars;assert.equal(scalars.length,9);assert.equal(new Set(scalars.map(row=>row.unit_id)).size,9);
  for(const unit of world.units){
   const typed=scalars.find(row=>row.unit_id===unit.raw_id);assert.ok(typed);const player=world.players.find(player=>player.id===unit.owner);assert.ok(player);
   assert.deepEqual(typed,{unit_id:unit.raw_id,owner_id:player.raw_id,id_type:'Int',owner_type:'Int',health_type:'Float',health_bits:f32Bits(unit.health),movement_type:'Float',movement_bits:f32Bits(unit.movement)});
  }
  if(checkpoint!==record.warm){
   assert.equal(checkpoint.applied_count,1);assert.equal(checkpoint.rollback_count,0);
   const actor=world.units.find(unit=>unit.raw_id===a);assert.ok(actor);assert.equal(actor.health,0.5);assert.equal(f32Bits(actor.health),1056964608);
   actor.health=first.health;assert.deepEqual(world,before,'Only A native health may change; all owners, quotes, locks and terrain stay guarded');
   const restored=structuredClone(scalars);restored.find(row=>row.unit_id===a).health_bits=1065353216;
   assert.deepEqual(restored,record.warm.native_unit_scalars,'Only A exact F32 health bits may change in native typed scalar observations');
  }
 }
 const after=nativeWorld(record.after_health),final=nativeWorld(record.final);
 const priority=world=>({a:currentSourceUnitWeight(world.units.find(unit=>unit.raw_id===a),world.terrain_trace.unit_details[first.id].definition_id,first.owner),
  b:currentSourceUnitWeight(world.units.find(unit=>unit.raw_id===b),world.terrain_trace.unit_details[second.id].definition_id,first.owner)});
 const sourcePriority={warm:priority(before),after_health:priority(after)};assert.deepEqual(priority(final),sourcePriority.after_health);
 assert.ok(sourcePriority.warm.a>sourcePriority.warm.b,'Actual source formula must justify the warmed A priority');
 assert.ok(sourcePriority.after_health.b>sourcePriority.after_health.a,'Declared health case must invert actual source priority; otherwise setup is unsupported');
 const expected=sourcePriority.after_health.a>sourcePriority.after_health.b?a:b,observed=record.final.ui.bound_unit_id;
 return{schema:'application.unit-stack-health-proof.v1',complete:true,evaluation_only:true,candidate_executed:false,original_passing_cases:0,
  scope:'candidate HUD binding versus existing source priority after declared native health fixture event',
  expected_unit_id:expected,observed_unit_id:observed,match:observed===expected,a,b,all_seven_native_guard:true,
  source_priority:sourcePriority,allowed_native_change:'A health Float32 0x3f800000 to 0x3f000000 only',
  unsupported:['original selection policy','combat/damage gameplay','rendered map instance identity','original pixels','facing/frame/tool/limb animation','movement/audio timing','direct frontend-request cause ID']};
}

// The future launcher must finish/reap native execution, close the producer,
// seal exact retained chunks and verify the canonical hook before calling this.
// A complete HUD mismatch is evaluable only after these acceptance conditions.
export function evaluateUnitStackHealthLog(text,acceptance){
 assert.equal(acceptance?.native_exit_code,0,'Actual native application exit zero required');
 assert.equal(acceptance?.log?.sealed,true);assert.equal(acceptance.log.partial,false);
 assert.equal(acceptance.log.raw_sha256,hash(text));assert.equal(acceptance.log.joined_chunk_sha256,hash(text));
 assert.equal(acceptance.hook?.main_acknowledgements,1);assert.equal(acceptance.hook.worker_acknowledgements,8);
 for(const key of ['runtime_out_bound','runtime_err_bound','runtime_callMain_present'])assert.equal(acceptance.hook[key],true);
 return evaluate(parseUnitStackHealthLog(text));
}
