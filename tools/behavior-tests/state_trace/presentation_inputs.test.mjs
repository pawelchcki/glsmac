import assert from 'node:assert/strict';
import test from 'node:test';
import {reconcilePresentationInputs,presentationCheckpointPrefix} from './presentation_inputs.mjs';
const raw=(kind,data)=>({kind,data});
const key={ingress:1,type:'keydown',scancode:40,modifiers:0,repeat:0,action:1};
const browserKey={seq:1,type:'keydown',code:'Enter',mods:0,repeat:false,trusted:true,action:1};
const dispatched=(d)=>[raw('input.ingress',d),raw('input.dispatch',{phase:'begin',ingress:d.ingress,type:d.type,action:d.action}),raw('input.dispatch',{phase:'end',ingress:d.ingress,handled:false})];
const numbered=events=>events.map((e,i)=>({...e,seq:i+1,target:'input'}));

test('actual dispatch and extra unplanned key transitions are retained and reconciled',()=>{
 const events=numbered([...dispatched(key),...dispatched({...key,ingress:2,type:'keyup'})]);
 const browser=[browserKey,{...browserKey,seq:2,type:'keyup'}];
 const result=reconcilePresentationInputs(events,browser);
 assert.equal(result.complete,true);assert.equal(result.pairs.length,2);assert.equal(result.physical_os_complete,false);
});

test('all ingress survives production coalescing and actual dispatch order differs from ingress order',()=>{
 const move={ingress:1,type:'mousemove',x:10,y:20,action:1};
 const events=numbered([raw('input.ingress',move),raw('input.ingress',{...move,ingress:2,x:11}),raw('input.disposition',{ingress:1,status:'coalesced',replaced_by:2}),...dispatched({...key,ingress:3}),raw('input.dispatch',{phase:'begin',ingress:2,type:'mousemove',action:1}),raw('input.dispatch',{phase:'end',ingress:2,handled:false})]);
 const browser=[{seq:1,type:'mousemove',x:10,y:20,canvas:true,action:1,trusted:true},{seq:2,type:'mousemove',x:11,y:20,canvas:true,action:1,trusted:true},{...browserKey,seq:3}];
 const result=reconcilePresentationInputs(events,browser);assert.equal(result.complete,true);assert.equal(result.native_ingress_count,3);assert.equal(result.dispatch_count,2);
});

test('unknown, proxy, missing ingress, unfinished and mismatched action cannot claim complete attribution',()=>{
 for(const [events,browser] of [
  [[...dispatched(key),raw('input.filtered',{sdl_type:42})],[browserKey]],
  [dispatched(key),[{...browserKey,trusted:false}]],
  [dispatched(key),[{...browserKey,action:2}]],
  [[raw('input.dispatch',{phase:'begin',ingress:0}),raw('input.dispatch',{phase:'end',ingress:0})],[]],
  [[raw('input.ingress',key),raw('input.dispatch',{phase:'begin',ingress:1})],[browserKey]],
  [dispatched(key),[{...browserKey,code:'UnverifiedKey'}]],
  [[],[browserKey]],
 ])assert.equal(reconcilePresentationInputs(numbered(events),browser).complete,false);
 assert.throws(()=>reconcilePresentationInputs(numbered([raw('input.ingress',{...key,ingress:2})]),[]),/contiguous/);
});

test('checkpoint artifacts stop exactly at acknowledged native watermark and browser watermark',()=>{
 const events=numbered([raw('trace.checkpoint',{checkpoint:1}),raw('node.property',{text:'later mutation'})]);
 const capture={capture:{terminal_drain_observed:true,final_event_sequence:2},batches:[{enabled:true,dropped:0,events}],browser_inputs:[browserKey,{...browserKey,seq:2}],input_checkpoints:[{browser_watermark:1}]};
 const prefix=presentationCheckpointPrefix(capture,1,'main-menu','launch');assert.equal(prefix.batches[0].events.length,1);assert.equal(prefix.browser_inputs.length,1);assert.equal(prefix.capture.terminal_drain_observed,false);assert.equal(prefix.capture.final_quiet_observed,false,'checkpoint does not inherit final capture quiet claim');
});

import {validatePresentationInputCapture} from './presentation_inputs.mjs';
test('strict fence schema rejects reordered, missing, unknown, duplicate and stale controls',()=>{
 const plan={actions:[{id:'launch'}],checkpoints:[{id:'main-menu',after_action:'launch'}]};
 const events=numbered([raw('trace.protocol',{version:1,physical_os_complete:false}),raw('trace.action',{op:1,action:1,checkpoint:0,nonce:0}),raw('trace.action',{op:2,action:1,checkpoint:0,nonce:1}),raw('trace.checkpoint',{op:3,action:1,checkpoint:1,nonce:2})]);
 const capture={input_plan:plan,batches:[{events}],input_checkpoints:[{id:'main-menu',after_action:'launch'}]};
 assert.equal(validatePresentationInputCapture(capture,{final:true}).valid,true);
 for(const altered of [events.slice(1),events.slice(0,-1),events.map(e=>e.kind==='trace.checkpoint'?{...e,data:{...e.data,nonce:1}}:e),events.map(e=>e.kind==='trace.checkpoint'?{...e,data:{...e.data,action:2}}:e)])assert.throws(()=>validatePresentationInputCapture({...capture,batches:[{events:altered}]},{final:true}));
});

import {presentationOpeningInputPlan} from './presentation_inputs.mjs';
import {readFileSync} from 'node:fs';
test('optional legacy raw observer declares its extra next-turn and pointer inputs without changing pinned plan',()=>{
 const pinned=JSON.parse(readFileSync(new URL('./presentation-cases.json',import.meta.url),'utf8')).cases[0].input;
 const before=JSON.stringify(pinned);
 assert.deepEqual(presentationOpeningInputPlan(pinned),pinned);
 const legacy=presentationOpeningInputPlan(pinned,{steps:5,confirmation:'pointer'});
 assert.equal(legacy.actions.at(-1).id,'advance-turn');assert.equal(legacy.checkpoints.at(-1).after_action,'advance-turn');
 assert.equal(legacy.actions.find(action=>action.id==='planetfall').kind,'confirm.pointer');
 assert.equal(JSON.stringify(pinned),before);
});
