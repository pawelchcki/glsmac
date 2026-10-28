import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {completedNativeClick,nativeHover} from './terraform-browser-pointer.mjs';
const capture=JSON.parse(readFileSync(new URL('./fixtures/terraform-road-pointer-capture.json',import.meta.url)));
test('actual road SDL ingresses32/33 require matching mouseup dispatch completion',()=>{
 const result=completedNativeClick(capture.road_events,61994,capture.road_target);
 assert.equal(result.down.data.ingress,32);assert.equal(result.up.data.ingress,33);assert.equal(result.end.seq,62032);
 assert.equal(result.up.data.x,299);assert.equal(result.up.data.y,611);
 assert.equal(completedNativeClick(capture.road_events,62032,capture.road_target),null);
});
test('missing end, ingress, wrong point/button and mismatched release cannot pass',()=>{
 for(const kind of ['end','ingress','point','button','release']){
  const rows=structuredClone(capture.road_events);
  if(kind==='end')rows.splice(rows.findIndex(e=>e.seq===62032),1);
  if(kind==='ingress')rows.splice(rows.findIndex(e=>e.kind==='input.ingress'&&e.data.ingress===33),1);
  if(kind==='point')for(const e of rows)if(e.data.x!==undefined)e.data.x=999;
  if(kind==='button')for(const e of rows)if(e.data.button!==undefined)e.data.button=3;
  if(kind==='release')for(const e of rows)if(e.data.ingress===33&&e.data.x!==undefined)e.data.x++;
  assert.equal(completedNativeClick(rows,61994,capture.road_target),null,kind);
 }
});
test('actual semantic hover is positive only for intended node, edge and bounds',()=>{
 const target=capture.header_target;const hover=nativeHover(capture.header_hover_events,0,[target.id],target.bounds);assert.ok(hover);
 assert.equal(nativeHover(capture.header_hover_events,hover.seq,[target.id],target.bounds),null);
 assert.equal(nativeHover(capture.header_hover_events,0,['wrong-node'],target.bounds),null);
 const changed=structuredClone(capture.header_hover_events);for(const e of changed)e.data.type='mouseout';assert.equal(nativeHover(changed,0,[target.id],target.bounds),null);
 assert.equal(nativeHover(capture.header_hover_events,0,[target.id],{left:0,right:10,top:0,bottom:10}),null);
 // The old road click completed without a delivered hover; do not fabricate
 // one from its successful result or relax the new explicit motion fence.
 assert.equal(nativeHover(capture.road_events,61994,[capture.road_target.id],capture.road_target.bounds),null);
});
