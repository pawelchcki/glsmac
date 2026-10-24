// Optional installed-asset integration: actual threaded WASM, not a fake page.
import assert from 'node:assert/strict';
import test from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {reconcilePresentationInputs,validatePresentationInputCapture} from './presentation_inputs.mjs';
const run=promisify(execFile),root=fileURLToPath(new URL('../../../',import.meta.url));
const enabled=Boolean(process.env.SMAC_ASSETS_DIR&&process.env.WASM_APP_DIR);

test('threaded pinned captures reconcile all observed inputs and preserve exact five/two checkpoint fences',{skip:!enabled,timeout:240000},async()=>{
 const artifacts=await mkdtemp(`${tmpdir()}/presentation-inputs-pinned-`);
 // The candidate reads the frozen request on stdin; a small child wrapper keeps
 // execFile bounded without a shell or writing a generated expected output.
 const script="import {spawn} from 'node:child_process';import {readFileSync} from 'node:fs';const child=spawn(process.env.PYTHON||'python3',['tools/behavior-tests/state_trace/presentation_candidate.py'],{stdio:['pipe','inherit','inherit'],env:process.env});child.stdin.end(readFileSync('tools/behavior-tests/state_trace/presentation-cases.json'));child.on('exit',code=>process.exitCode=code);";
 const result=await run(process.execPath,['--input-type=module','-e',script],{cwd:root,env:{...process.env,PRESENTATION_ARTIFACTS:artifacts},timeout:235000,maxBuffer:16*1024*1024});
 const response=JSON.parse(result.stdout);
 assert.deepEqual(response.results.map(result=>result.status),['unsupported','unsupported'],'semantic/media gaps stay unsupported');
 for(const [id,count] of [['presentation-opening-keyboard',5],['presentation-intro-launch',2]]){
  const metadata=response.implementation.captures[id];
  assert.equal(metadata.launch_method,'trusted-host-button-space');
  assert.equal(metadata.launch_user_activation.has_been_active,true,'stock trusted browser activation preserved');
  const semantic=JSON.parse(await readFile(metadata.semantic_path,'utf8'));
  assert.equal(semantic.checkpoints.length,count,'real semantic five/two checkpoint projection');
  assert.equal(semantic.diagnostics.all_births_disposed,true);
  assert.equal(semantic.diagnostics.cross_engine_correspondence,false);
  assert.equal(metadata.semantic_checkpoint_paths.length,count);
  for(const point of semantic.checkpoints) {
   assert.equal(point.state.presentation.schema,'presentation.trace.v1');
   assert.ok(Object.values(point.coverage).every(value=>value===false),'missing semantic/media/output channels remain incomplete');
   assert.ok(Object.values(point.state.presentation.objects).every(control=>control.enabled===null),'active/group styling never implies enabled');
  }
  const ledger=metadata.input_ledger;
  const capture=JSON.parse(await readFile(ledger.raw_path,'utf8'));
  assert.equal(validatePresentationInputCapture(capture,{final:true}).checkpoint_count,count);
  assert.equal(reconcilePresentationInputs(capture.batches.flatMap(batch=>batch.events),capture.browser_inputs).complete,true);
  assert.equal(capture.capture.terminal_drain_observed,true);
  const rawEvents=capture.batches.flatMap(batch=>batch.events);
  assert.ok(rawEvents.some(event=>event.kind==='semantic.protocol'&&event.data.version===2),'fresh v2 constructor provenance is required');
  const semanticEvents=[...semantic.checkpoints.flatMap(point=>point.state.presentation.events),...semantic.diagnostics.tail_presentation.events];
  const live=new Set(),selected=new Map(),membership=new Map();
  for(const event of semanticEvents){
   if(event.kind==='create')live.add(event.object_id);
   if(event.kind==='update'&&Object.hasOwn(event.fields,'selected')){
    if(event.fields.field_availability?.selected==='actual native live logical selection target'){
     assert.ok(live.has(event.fields.selected),'selected logical target must already be born');
     selected.set(event.object_id,event.fields.selected);
    }else selected.delete(event.object_id);
   }
   if(event.kind==='update'&&Object.hasOwn(event.fields,'items'))membership.set(event.object_id,event.fields.items);
   if(event.kind==='destroy'){
    assert.ok(![...selected.values()].includes(event.object_id),'selected references clear before target retirement');
    live.delete(event.object_id);selected.delete(event.object_id);membership.delete(event.object_id);
   }
   for(const items of membership.values())for(const item of items||[])assert.ok(live.has(item.control),'choice membership must never reference an unborn or retired control');
   if(event.kind==='observed'&&event.fields.kind.startsWith('media.'))assert.equal(event.fields.disposition,'unknown-media');
  }
  const windows=new Set(rawEvents.filter(event=>event.kind==='semantic.role'&&event.data.constructor===true&&event.data.role==='window').map(event=>event.target));
  if(id==='presentation-opening-keyboard')assert.ok(windows.size>0,'real native Window constructor path executed');
  for(const nativeId of windows){
   if(semantic.diagnostics.dispositions[nativeId].disposition!=='logical')continue;
   const birth=semanticEvents.find(event=>event.kind==='create'&&event.object_id===`candidate-birth:${nativeId}`);
   assert.ok(birth,'native logical Window has a canonical birth');assert.equal(birth.domain,'windows');
  }
  const births=rawEvents.filter(event=>event.kind==='node.create'||event.kind==='media.create');
  assert.equal(Object.keys(semantic.diagnostics.dispositions).length,births.length,'every real native/media birth has a disposition');
  assert.equal(semantic.diagnostics.observed_events,rawEvents.length,'every raw event survives projection including transients');
  for(const path of metadata.semantic_checkpoint_paths){
   const prefix=JSON.parse(await readFile(path,'utf8'));
   assert.deepEqual(prefix.checkpoints,semantic.checkpoints.slice(0,prefix.checkpoints.length),'semantic prefixes are invariant at their native fence');
  }
  assert.equal(capture.input_attribution.physical_os_complete,false);
  assert.equal(ledger.checkpoint_paths.length,count);
  for(const path of ledger.checkpoint_paths){
   const prefix=JSON.parse(await readFile(path,'utf8'));assert.equal(prefix.input_attribution.complete,true);
   assert.equal(prefix.batches[0].events.at(-1).seq,prefix.checkpoint.watermark);
   assert.equal(prefix.batches[0].events.at(-1).kind,'trace.checkpoint');
  }
  if(id==='presentation-intro-launch')assert.equal(capture.browser_inputs.length,0,'conditional no-op creates no Escape');
 }
});

test('actual SDL coalescing retains ingress, browser burst and unplanned modifier transitions with explicit incomplete attribution',{skip:!enabled,timeout:120000},async()=>{
 const artifacts=await mkdtemp(`${tmpdir()}/presentation-inputs-coalescing-`);
 const result=await run(process.execPath,['tools/behavior-tests/state_trace/presentation_intro_browser.mjs'],{cwd:root,env:{...process.env,PRESENTATION_ARTIFACTS:artifacts,PRESENTATION_INPUT_PROBE:'1'},timeout:115000,maxBuffer:16*1024*1024});
 const response=JSON.parse(result.stdout);assert.equal(response.failure,null);
 const capture=JSON.parse(await readFile(`${artifacts}/presentation-raw.json`,'utf8'));
 const events=capture.batches.flatMap(batch=>batch.events);
 assert.ok(events.some(event=>event.kind==='input.disposition'&&event.data.status==='coalesced'));
 assert.ok(events.some(event=>event.kind==='input.ui-transition'),'actual hover transitions retained');
 assert.ok(capture.browser_inputs.some(event=>event.type==='keyup'&&event.code==='ShiftLeft'));
 assert.equal(capture.input_attribution.complete,false,'observed concurrent browser/SDL payload discrepancy cannot pass');
 assert.ok(capture.input_attribution.gaps.some(gap=>gap.includes('payload or action differs')));
 assert.equal(capture.input_attribution.physical_os_complete,false);
});
