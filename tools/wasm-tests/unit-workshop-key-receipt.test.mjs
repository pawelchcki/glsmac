import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {completedWorkshopKey} from './unit-workshop-key-receipt.mjs';

const capture=JSON.parse(readFileSync(new URL('fixtures/unit-workshop-native-key-observation.json',import.meta.url),'utf8'));
const sample=()=>structuredClone(capture.samples.find(row=>row.code==='P'));

test('actual pinned SDL ingress remains raw while normalized P/R dispatches match',()=>{
  for(const row of capture.samples){
    const receipt=completedWorkshopKey(row.events,row.fence,row.code,row.modifiers);assert.ok(receipt);
    assert.equal(receipt.ingress,row.events[0]);assert.equal(receipt.begin,row.events[1]);assert.equal(receipt.end,row.events[2]);
    assert.equal(receipt.ingress.data.code,undefined);assert.notEqual(receipt.ingress.data.modifiers,receipt.begin.data.modifiers);
    assert.equal(receipt.ingress.data.keycode,row.events[0].data.keycode);assert.equal(receipt.ingress.data.scancode,row.events[0].data.scancode);
  }
});
test('drawing an ingress from another ID or input type cannot acknowledge the key',()=>{
  const wrongId=sample();wrongId.events[0].data.ingress++;
  assert.equal(completedWorkshopKey(wrongId.events,wrongId.fence,wrongId.code,wrongId.modifiers),null);
  const wrongType=sample();wrongType.events[0].data.type='keyup';
  assert.equal(completedWorkshopKey(wrongType.events,wrongType.fence,wrongType.code,wrongType.modifiers),null);
});
test('dispatch code and normalized modifiers must independently match the requested key',()=>{
  const row=sample();assert.equal(completedWorkshopKey(row.events,row.fence,'R',row.modifiers),null);
  assert.equal(completedWorkshopKey(row.events,row.fence,row.code,0),null);
});
test('a missing, mismatched or prematurely observed END is not completion',()=>{
  const row=sample();assert.equal(completedWorkshopKey(row.events.slice(0,2),row.fence,row.code,row.modifiers),null);
  const wrong=sample();wrong.events[2].data.ingress++;
  assert.equal(completedWorkshopKey(wrong.events,wrong.fence,wrong.code,wrong.modifiers),null);
  const early=sample();early.events[2].seq=early.events[1].seq-1;
  assert.equal(completedWorkshopKey(early.events,early.fence,early.code,early.modifiers),null);
});
test('the raw ingress must be after the fresh fence and before its dispatch',()=>{
  const row=sample();assert.equal(completedWorkshopKey(row.events,row.events[1].seq,row.code,row.modifiers),null);
  const late=sample();late.events[0].seq=late.events[1].seq+1;
  assert.equal(completedWorkshopKey(late.events,late.fence,late.code,late.modifiers),null);
});
test('an actual retained observer query with no captured END remains incomplete',()=>{
  assert.ok(capture.incomplete_samples.length>0);
  for(const row of capture.incomplete_samples)assert.equal(completedWorkshopKey(row.events,row.fence,row.code,row.modifiers),null);
});

test('actual post-Cancel query transport completes even though the old observer produced no world snapshot',()=>{
  const row=capture.samples.find(item=>item.source_head==='558dc3715204874e275c32796819547fa449d29d');assert.ok(row);
  const receipt=completedWorkshopKey(row.events,row.fence,row.code,row.modifiers);assert.ok(receipt);assert.equal(receipt.end.data.handled,true);
  assert.equal(receipt.begin.data.ingress,36);assert.equal(receipt.end.seq,94579);
  assert.equal(completedWorkshopKey(row.events.slice(0,2),row.fence,row.code,row.modifiers),null);
});
