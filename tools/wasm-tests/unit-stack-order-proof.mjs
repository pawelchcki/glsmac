// Application cache consistency evaluator. No original output or image oracle.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const nativeOnly=checkpoint=>{const world=structuredClone(checkpoint.world);delete world.terrain_trace.ui;return world;};
export function evaluateUnitStackOrder(record){
  assert.equal(record.schema,'application.unit-stack-order-observation.v1');
  const {a,b,owner}=record.actors;assert.ok(Number.isSafeInteger(a)&&a>0&&Number.isSafeInteger(b)&&b>0&&a!==b&&Number.isSafeInteger(owner));
  const before=nativeOnly(record.warm);assert.equal(before.players.length,7);assert.equal(before.bases.length,7);assert.equal(before.units.length,9);
  assert.equal(Object.keys(before.terrain_trace.tiles).length,128);
  for(const player of before.players){assert.ok(before.units.some(unit=>unit.owner===player.id));assert.ok(before.bases.some(base=>base.owner===player.id));}
  const first=before.units.filter(unit=>unit.raw_id===a),second=before.units.filter(unit=>unit.raw_id===b);assert.equal(first.length,1);assert.equal(second.length,1);
  for(const [unit,morale]of[[first[0],2],[second[0],1]]){
    assert.equal(unit.prototype,'scout-patrol');assert.equal(unit.morale,morale);assert.equal(unit.health,1);assert.equal(unit.movement,1);assert.equal(unit.order,'NO_ORDERS');assert.equal(unit.x,8);assert.equal(unit.y,8);
    const detail=before.terrain_trace.unit_details[unit.id];assert.ok(detail);assert.equal(detail.definition_id,'ScoutPatrol');assert.equal(detail.movement_kind,'land');assert.equal(detail.nominal_mp_per_turn,1);assert.equal(detail.can_terraform,false);
  }
  assert.equal(first[0].owner,second[0].owner);assert.ok(before.players.some(player=>player.raw_id===owner&&player.id===first[0].owner));
  const eventMap=new Map();let previous=0;
  for(const event of record.events){assert.ok(Number.isSafeInteger(event.serial)&&event.serial>previous);previous=event.serial;assert.ok(!eventMap.has(event.serial));eventMap.set(event.serial,event);}
  assert.equal(previous,record.final.event_serial,'The complete actual event prefix must end at the final observation');
  const requireEvent=(serial,kind)=>{const event=eventMap.get(serial);assert.ok(event);assert.equal(event.kind,kind);return event.data;};
  assert.equal(record.warm.ui.bound_unit_id,a);assert.equal(record.warm.ui.rendered_unit_id,a);assert.equal(record.warm.ui.selected_unit_id,null);
  assert.ok(record.warm_tile.serial>0&&record.warm.last_preview.serial>record.warm_tile.serial&&record.warm.last_preview.unit_id===a);
  assert.deepEqual(requireEvent(record.warm_tile.serial,'tile-select'),{x:8,y:8});assert.equal(requireEvent(record.warm.last_preview.serial,'native-unit-preview').unit_id,a);
  assert.equal(record.hold_receipt.name,'unit_hold');assert.equal(typeof record.hold_receipt.event_id,'string');assert.ok(record.hold_receipt.event_id.length>0);assert.equal(record.hold_receipt.caller,owner);assert.equal(record.hold_receipt.success,true);assert.equal(record.hold_receipt.unit_id,a);
  assert.ok(record.refresh_preview.serial>record.warm.event_serial,'Frontend refresh must occur after the explicit Hold submission fence');
  assert.ok(record.events.some(event=>event.kind==='native-hold-result'&&event.data.event_id===record.hold_receipt.event_id&&event.serial>record.warm.event_serial));
  assert.ok(record.events.some(event=>event.kind==='native-unit-preview'&&event.serial===record.refresh_preview.serial));
  assert.equal(requireEvent(record.refresh_preview.serial,'native-unit-preview').unit_id,record.refresh_preview.unit_id);
  assert.ok(record.final.last_tile.serial>record.after_hold.event_serial&&record.final.last_preview.serial>record.final.last_tile.serial);
  assert.deepEqual(requireEvent(record.final.last_tile.serial,'tile-select'),{x:8,y:8});assert.equal(requireEvent(record.final.last_preview.serial,'native-unit-preview').unit_id,record.final.last_preview.unit_id);
  for(const checkpoint of[record.after_hold,record.final]){
    const world=nativeOnly(checkpoint);const actor=world.units.find(unit=>unit.raw_id===a);assert.ok(actor);assert.equal(actor.order,'HOLD');
    actor.order=first[0].order;assert.deepEqual(world,before,'Only the legitimate A Hold order may change in the complete native world');
  }
  assert.equal(record.final.ui.bound_unit_id,record.final.last_preview.unit_id,'Actual native map preview event and mounted Widget payload must agree');
  assert.equal(record.final.ui.rendered_unit_id,record.final.ui.bound_unit_id,'Mounted preview text/cache and actual Widget payload must agree');
  assert.equal(record.final.ui.selected_unit_id,null);
  const observed=record.final.ui.bound_unit_id;
  return{schema:'application.unit-stack-order-proof.v1',complete:true,candidate_executed:false,evaluation_only:true,scope:'candidate frontend priority/cache versus actual HUD unit binding after Hold',
    a,b,expected_unit_id:b,observed_unit_id:observed,match:observed===b,source_priority:{before:{a:272,b:270},after_hold:{a:72,b:270}},
    all_seven_native_guard:true,allowed_native_change:'A order NO_ORDERS to HOLD only',
    original_passing_cases:0,unsupported:['original selection policy','rendered map instance identity','pixel/artwork agreement','facing/tool/limb frames','animation/audio timing']};
}

export function parseUnitStackOrderLog(text){
  assert.doesNotMatch(text,/UO_UNSUPPORTED|UO_ERROR|Unhandled exception|Event result listener failed|RuntimeError:|Assertion failed/);
  const lines=text.split('\n').flatMap(line=>{const match=line.match(/^\s*(?:\[[^\]]+\]\s*)?UO_RESULT\|(.+)$/);return match?[JSON.parse(match[1])]:[];});
  assert.equal(lines.length,1,'One complete actual frontend observation is required');const record=lines[0];
  const checkpoints=text.split('\n').flatMap(line=>{const match=line.match(/^\s*(?:\[[^\]]+\]\s*)?UO_CHECKPOINT\|(.+)$/);return match?[JSON.parse(match[1])]:[];});
  assert.equal(checkpoints.length,3,'Every complete native world must be serialized at its own action boundary');
  for(const label of['warm','after_hold','final']){
    const matches=checkpoints.filter(checkpoint=>checkpoint.label===label);assert.equal(matches.length,1,`One immutable native ${label} checkpoint`);
    assert.deepEqual(record[label],matches[0].state,'Final metadata must match its separately captured native boundary');record[label].world=matches[0].world;
  }
  return record;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [input,output]=process.argv.slice(2);assert.ok(input&&output,'Usage: node unit-stack-order-proof.mjs actual-application.log result.json');
  const result=evaluateUnitStackOrder(parseUnitStackOrderLog(readFileSync(input,'utf8')));
  writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
  if(!result.match)process.exitCode=1;
}
