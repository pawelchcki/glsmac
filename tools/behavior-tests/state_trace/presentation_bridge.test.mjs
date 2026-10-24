import assert from 'node:assert/strict';
import test from 'node:test';
import {instrumentPresentation, extractPresentation} from './presentation_bridge.mjs';

const event = {seq:1,kind:'node.create',target:'n1',data:{parent:null,tag:'$root'}};
const log = batch => 'PTRACE_ARMED\nPTRACE|' + JSON.stringify(batch) + '\nPTRACE_SEALED\n';

test('bridge arms before production includes and drains without polling state', () => {
  const scripts = {'GLSMAC_data/default/main.gls.js':"#main((glsmac) => { #include('ui/ui')(glsmac); });"};
  instrumentPresentation(scripts);
  const source = scripts['GLSMAC_data/default/main.gls.js'];
  assert.ok(source.indexOf('presentation_trace_start') < source.indexOf('#include'));
  assert.match(source,/timer\(50/);
  assert.match(source,/presentation_trace_drain/);
  assert.match(source,/presentation_trace_seal_requested/);
  assert.match(source,/presentation_trace_seal\(\)/);
});

test('no unsupported audio, video or semantic profile is claimed observed', () => {
  const output = extractPresentation(log({enabled:true,dropped:0,events:[event]}));
  assert.equal(output.batches[0].events[0].kind,'node.create');
  for (const key of ['audio_mixer','audio_output','video_frames','semantic_profile','controlled_timing']) assert.equal(output.coverage[key],false);
  assert.equal(output.capture.terminal_drain_observed,true);
  assert.equal(output.capture.final_event_sequence,1);
});

test('missing producer, disabled channel, overflow and sequence gaps fail', () => {
  for (const broken of ['',log({enabled:false,dropped:0,events:[event]}),log({enabled:true,dropped:1,events:[event]}),log({enabled:true,dropped:0,events:[{...event,seq:2}]})]) assert.throws(()=>extractPresentation(broken));
  assert.throws(()=>extractPresentation(log({enabled:true,dropped:0,events:[event]}).replace('PTRACE_SEALED','')),/terminal native drain/);
  assert.throws(()=>extractPresentation(log({enabled:true,dropped:0,events:[event]})+'PTRACE|{}'),/after the sealed boundary/);
});

import vm from 'node:vm';
import {installPresentationTransport, capturePresentation} from './presentation_bridge.mjs';

test('transport intercepts before application-log mutation and stays bounded', async () => {
  let init;
  await installPresentationTransport({addInitScript:async callback=>{init=callback;}});
  const sandbox={window:{}};
  vm.runInNewContext('('+init.toString()+')()',sandbox);
  const visible=[];
  sandbox.window.Module={print:message=>visible.push(message)};
  sandbox.window.Module.print('real application output');
  sandbox.window.Module.print('PTRACE_ARMED');
  assert.equal(sandbox.window.__presentationArmed,1);
  sandbox.window.Module.print('PTRACE|'+JSON.stringify({enabled:true,dropped:0,events:[event]}));
  assert.deepEqual(visible,['real application output']);
  assert.equal(sandbox.window.__presentationBatches.length,1);
  assert.equal(sandbox.window.__presentationTransportError,null);
  sandbox.window.Module.print('PTRACE|'+JSON.stringify({events:Array(500001).fill(event)}));
  assert.match(sandbox.window.__presentationTransportError,/bound exceeded/);
  assert.equal(sandbox.window.__presentationBatches.length,1,'overflow batch never enters transport');
  sandbox.window.Module.print('PTRACE_SEALED');
  assert.equal(sandbox.window.__presentationSealed,1);
  assert.deepEqual(visible,['real application output'],'raw telemetry never mutates visible application log');
});

async function nativeTransport({pending=[], exportAvailable=true, acknowledge=true}={}) {
  let init;
  await installPresentationTransport({addInitScript:async callback=>{init=callback;}});
  const sandbox=vm.createContext({window:{}});
  vm.runInContext('('+init.toString()+')()',sandbox);
  const native={requests:0, waits:0, pending:[...pending]};
  const visible=[];
  const module={print:message=>visible.push(message)};
  if(exportAvailable)module._glsmac_presentation_request_seal=()=>{native.requests++;};
  sandbox.window.Module=module;
  module.print('PTRACE_ARMED');
  module.print('PTRACE|'+JSON.stringify({enabled:true,dropped:0,events:[event]}));
  const page={
    evaluate:async(callback,argument)=>{
      sandbox.argument=argument;
      return vm.runInContext('('+callback.toString()+')(argument)',sandbox);
    },
    waitForTimeout:async()=>{},
    waitForFunction:async(callback,argument,options)=>{
      native.waits++;
      assert.equal(native.requests,1,'request export runs before acknowledgement wait');
      assert.equal(options.timeout,5000,'missing acknowledgement has a bounded wait');
      assert.equal(sandbox.window.__presentationSealed,0,'capture waits while terminal native drain is pending');
      if(acknowledge){
        module.print('PTRACE|'+JSON.stringify({enabled:true,dropped:0,events:native.pending.splice(0)}));
        module.print('PTRACE_SEALED');
      }
      if(!await page.evaluate(callback,argument))throw Error('native presentation seal acknowledgement timed out');
    }
  };
  return {page,module,native,visible,window:sandbox.window};
}

const suffix={seq:2,kind:'node.property',target:'n1',data:{key:'rendered_text',value:'final native mutation'}};

test('progress captures never request a seal and observation continues', async()=>{
  const fixture=await nativeTransport();
  const progress=await capturePresentation(fixture.page,'ordinary output');
  assert.equal(fixture.native.requests,0);
  assert.equal(fixture.native.waits,0);
  assert.equal(progress.capture.terminal_drain_observed,false);
  assert.equal(progress.capture.ended_at,'last-periodic-drain-only');
  fixture.module.print('PTRACE|'+JSON.stringify({enabled:true,dropped:0,events:[suffix]}));
  const later=await capturePresentation(fixture.page,'ordinary output');
  assert.equal(later.capture.final_event_sequence,2);
  assert.equal(fixture.native.requests,0);
});

test('final capture waits for native seal and retains the buffered structural suffix', async()=>{
  const fixture=await nativeTransport({pending:[suffix]});
  await waitPresentationQuiet(fixture.page);
  const final=await capturePresentation(fixture.page,'ordinary output',{seal:true});
  assert.equal(fixture.native.requests,1);
  assert.equal(fixture.native.waits,1);
  assert.equal(fixture.native.pending.length,0);
  assert.equal(final.capture.terminal_drain_observed,true);
  assert.equal(final.capture.ended_at,'atomic-native-seal');
  assert.equal(final.capture.final_event_sequence,2);
  assert.equal(final.batches[1].events[0].data.value,suffix.data.value);
  assert.equal(final.capture.final_quiet_observed,false,'new structural tail invalidates the earlier quiet count');
  assert.deepEqual(fixture.visible,[],'seal and terminal payload stay outside visible output');
});

test('nonstructural media tail is retained without invalidating structural quiet', async()=>{
  const fixture=await nativeTransport({pending:[{...suffix,kind:'media.progress'}]});
  await waitPresentationQuiet(fixture.page);
  const final=await capturePresentation(fixture.page,'ordinary output',{seal:true});
  assert.equal(final.capture.final_event_sequence,2);
  assert.equal(final.batches[1].events[0].kind,'media.progress');
  assert.equal(final.capture.final_quiet_observed,true);
});

test('final capture fails explicitly for a missing native export or missing acknowledgement', async()=>{
  const absent=await nativeTransport({exportAvailable:false});
  await assert.rejects(capturePresentation(absent.page,'',{seal:true}),/seal export unavailable/);
  assert.equal(absent.native.waits,0);
  const silent=await nativeTransport({acknowledge:false,pending:[suffix]});
  await assert.rejects(capturePresentation(silent.page,'',{seal:true}),/seal acknowledgement timed out/);
  assert.equal(silent.native.pending.length,1,'failed finalization never presents undrained data as a complete trace');
});

test('duplicate control markers and post-seal batches fail sticky transport validation', async()=>{
  for(const markers of [['PTRACE_ARMED'],['PTRACE_SEALED','PTRACE_SEALED']]){
    const fixture=await nativeTransport();
    for(const marker of markers)fixture.module.print(marker);
    assert.match(fixture.window.__presentationTransportError,/duplicate presentation/);
    await assert.rejects(capturePresentation(fixture.page,''),/healthy bounded browser observer transport/);
  }
  const fixture=await nativeTransport();
  fixture.module.print('PTRACE_SEALED');
  fixture.module.print('PTRACE|'+JSON.stringify({enabled:true,dropped:0,events:[suffix]}));
  assert.match(fixture.window.__presentationTransportError,/after terminal native seal/);
  assert.equal(fixture.window.__presentationBatches.length,1);
  await assert.rejects(capturePresentation(fixture.page,''),/healthy bounded browser observer transport/);
});

test('marker strings inside an event payload remain data and cannot forge a seal acknowledgement', async()=>{
  for(const value of ['PTRACE_ARMED PTRACE_SEALED','PTRACE_SEALED']){
    const fixture=await nativeTransport();
    fixture.module.print('PTRACE|'+JSON.stringify({enabled:true,dropped:0,events:[{
      ...suffix,data:{key:'rendered_text',value}
    }]}));
    assert.equal(fixture.window.__presentationArmed,1);
    assert.equal(fixture.window.__presentationSealed,0);
    assert.equal(fixture.window.__presentationTransportError,null);
    const progress=await capturePresentation(fixture.page,'');
    assert.equal(progress.capture.final_event_sequence,2);
    assert.equal(progress.capture.terminal_drain_observed,false);
    assert.equal(progress.batches[1].events[0].data.value,value);
    const final=await capturePresentation(fixture.page,'',{seal:true});
    assert.equal(final.capture.terminal_drain_observed,true);
    assert.equal(final.capture.final_event_sequence,2);
  }
});

import {waitPresentationQuiet} from './presentation_bridge.mjs';

test('quiet interval restarts on structural/request changes with a bounded failure', async () => {
  const counts=[1,2,2];let waits=0,quiet=false;
  await waitPresentationQuiet({evaluate:async callback=>{
    if(callback.toString().includes('QuietObserved')){quiet=true;return;}
    return counts.shift();
  },waitForTimeout:async()=>{waits++;}},150,2000);
  assert.equal(waits,2);
  assert.equal(quiet,true);
  await assert.rejects(waitPresentationQuiet({evaluate:async()=>0,waitForTimeout:async()=>{}},150,0),/No bounded/);
});
