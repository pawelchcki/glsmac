import {reconcilePresentationInputs,validatePresentationInputCapture} from './presentation_inputs.mjs';
// Optional native observer bridge. Raw native events are diagnostic artifacts;
// they are deliberately separate from architecture-neutral semantic parity.
import assert from 'node:assert/strict';

export function instrumentPresentation(scripts) {
  const path = 'GLSMAC_data/default/main.gls.js';
  const marker = '#main((glsmac) => {';
  assert.equal(scripts[path].split(marker).length, 2, 'one main observer arming point');
  scripts[path] = scripts[path].replace(marker, `${marker}
    glsmac.ui.presentation_trace_start();
    glsmac.ui.presentation_trace_inputs_start();
    #print('PTRACE_ARMED');
    glsmac.ui.root.timer(50, () => {
      if (glsmac.ui.presentation_trace_seal_requested()) {
        #print('PTRACE|' + glsmac.ui.presentation_trace_seal());
        #print('PTRACE_SEALED');
        return false;
      }
      #print('PTRACE|' + glsmac.ui.presentation_trace_drain());
      return true;
    });
  `);
}

export function extractPresentation(log, requireSeal=true) {
  const lines=log.split(/\r?\n/);
  const control=name=>new RegExp('^(?:\\s*\\[[^\\r\\n]*\\]\\s*)?'+name+'$');
  const batchPattern=/^(?:\s*\[[^\r\n]*\]\s*)?PTRACE\|(\{[^\r\n]*\})$/;
  assert.equal(lines.filter(line=>control('PTRACE_ARMED').test(line)).length, 1, 'native observer armed once');
  const sealLines=lines.map((line,index)=>control('PTRACE_SEALED').test(line)?index:-1).filter(index=>index>=0);
  assert.ok(sealLines.length<=1,'terminal native drain acknowledged at most once');
  const sealed=sealLines.length===1;
  if(requireSeal)assert.equal(sealed,true,'terminal native drain acknowledged once');
  if(sealed)assert.ok(lines.every((line,index)=>!batchPattern.test(line)||index<sealLines[0]), 'no batches after the sealed boundary');
  const batches = lines.map(line=>batchPattern.exec(line)).filter(Boolean).map(match=>JSON.parse(match[1]));
  assert.ok(batches.length > 0, 'native observer was actually drained');
  let seq = 0;
  for (const batch of batches) {
    assert.equal(batch.enabled, true, 'observer remained enabled');
    assert.equal(batch.dropped, 0, 'native observer lost no events');
    for (const event of batch.events) assert.equal(event.seq, ++seq, 'complete ordered native stream');
  }
  assert.ok(seq > 0, 'native observer captured actual events');
  return {schema:'glsmac.presentation.raw.v1', clock:{kind:'event-sequence',unit:'event'},
    capture:{armed:'before-production-main-includes',baseline:'existing-ui-tree-bootstrap',prelaunch_history_observed:false,drain_interval_ms:50,final_capture_interval_ms:150,terminal_drain_observed:sealed,ended_at:sealed?'atomic-native-seal':'last-periodic-drain-only',final_event_sequence:seq},
    coverage:{native_ui_lifecycle:true,native_ui_primitive_properties:true,native_ui_focus:true,native_ui_modal:true,
      audio_actor_requests:true,audio_actor_controls:true,audio_mixer:false,audio_output:false,
      music_classification:false,video_frames:false,world_animation:false,controlled_timing:false,
      semantic_profile:false}, batches};
}

// Install before navigation so Emscripten captures the observer-aware printer.
// Keeping raw events outside the visible log avoids O(n²) DOM text rendering.
export async function installPresentationTransport(page) {
  await page.addInitScript(() => {
    let module;
    window.__presentationBatches = [];
    window.__presentationBrowserInputs = [];
    window.__presentationBrowserAction = 1;
    window.__presentationInputChecks = [];
    window.__presentationInputCheckpoints = [];
    // Capture before SDL listeners; retain extra/unplanned input and companions.
    if (typeof window.addEventListener === 'function') {
      for(const type of ['keydown','keyup','keypress','mousemove','mousedown','mouseup','wheel','pointermove','pointerdown','pointerup','pointerover','pointerout','mouseover','mouseout','mouseenter','mouseleave','click','dblclick','focus','blur','beforeinput','input','compositionstart','compositionupdate','compositionend','touchstart','touchmove','touchend']) {
        window.addEventListener(type,event=>{
          if(window.__presentationArmed!==1||window.__presentationSealed)return;
          const events=window.__presentationBrowserInputs;
          if(events.length>=100000){window.__presentationTransportError='browser input ledger bound exceeded';return;}
          if(typeof event.data==='string'&&event.data.length>16384){window.__presentationTransportError='browser input payload bound exceeded';return;}
          const canvas=document.querySelector('#canvas'),r=canvas?.getBoundingClientRect();
          events.push({seq:events.length+1,type,action:window.__presentationBrowserAction,trusted:event.isTrusted,
            code:event.code||'',key:event.key||'',repeat:Boolean(event.repeat),mods:(event.shiftKey?1:0)|(event.ctrlKey?2:0)|(event.altKey?4:0),
            canvas:event.target===canvas,x:r?Math.floor((event.clientX-r.left)*canvas.width/r.width):null,y:r?Math.floor((event.clientY-r.top)*canvas.height/r.height):null,
            button:event.button??null,deltaY:event.deltaY??null,pointerType:event.pointerType||'',data:event.data??null});
        },true);
      }
    }
    window.__presentationArmed = 0;
    window.__presentationSealed = 0;
    window.__presentationTransportError = null;
    let count = 0;
    Object.defineProperty(window, 'Module', {configurable:true,
      get:()=>module,
      set:value=>{
        module=value;
        const print=value.print;
        value.print=message=>{
          const text=String(message);
          const batchPrefix=/^(?:\s*\[[^\r\n]*\]\s*)?PTRACE\|/.exec(text);
          if(!batchPrefix&&/^(?:\s*\[[^\r\n]*\]\s*)?PTRACE_ARMED$/.test(text)){
            window.__presentationArmed++;
            if(window.__presentationArmed!==1)window.__presentationTransportError='duplicate presentation arming marker';
            return;
          }
          if(!batchPrefix&&/^(?:\s*\[[^\r\n]*\]\s*)?PTRACE_SEALED$/.test(text)){
            window.__presentationSealed++;
            if(window.__presentationSealed!==1)window.__presentationTransportError='duplicate presentation seal marker';
            return;
          }
          if(!batchPrefix){print(message);return;}
          try {
            if(window.__presentationSealed)throw Error('presentation batch after terminal native seal');
            const batch=JSON.parse(text.slice(batchPrefix[0].length));
            count+=batch.events.length;
            if(count>500000)throw Error('browser presentation transport event bound exceeded');
            window.__presentationBatches.push(batch);
          }catch(error){window.__presentationTransportError=String(error);}
        };
      }
    });
  });
}

export async function capturePresentation(page, log, {seal=false}={}) {
  if(seal){
    await page.evaluate(()=>{
      if(typeof window.Module?._glsmac_presentation_request_seal!=='function')throw Error('native presentation seal export unavailable');
      window.Module._glsmac_presentation_request_seal();
    });
    await page.waitForFunction(()=>window.__presentationSealed===1,null,{timeout:5000});
  }
  const transport=await page.evaluate(()=>({batches:window.__presentationBatches,error:window.__presentationTransportError,armed:window.__presentationArmed,sealed:window.__presentationSealed,quiet:window.__presentationQuietObserved===true,quietCount:window.__presentationQuietCount,browser:window.__presentationBrowserInputs,inputChecks:window.__presentationInputChecks,inputCheckpoints:window.__presentationInputCheckpoints,inputPlan:window.__presentationInputPlan}));
  assert.equal(transport.error,null,'healthy bounded browser observer transport');
  assert.ok(Array.isArray(transport.batches),'observer transport was installed');
  assert.equal(transport.armed,1,'observer armed once without visible log mutation');
  if(seal)assert.equal(transport.sealed,1,'terminal native drain acknowledged before capture');
  const result=extractPresentation(log+'\nPTRACE_ARMED\n'+transport.batches.map(batch=>'PTRACE|'+JSON.stringify(batch)).join('\n')+(transport.sealed?'\nPTRACE_SEALED\n':''),seal);
  const structuralCount=transport.batches.reduce((total,batch)=>total+batch.events.filter(event=>!['media.frame','media.progress'].includes(event.kind)&&!(event.kind==='input.filtered'&&event.data.classification==='poll-sentinel')).length,0);
  result.capture.final_quiet_observed=transport.quiet&&structuralCount===transport.quietCount;
  result.browser_inputs=transport.browser;
  result.input_checks=transport.inputChecks;
  result.input_checkpoints=transport.inputCheckpoints;
  result.input_plan=transport.inputPlan;
  if(result.batches.some(batch=>batch.events.some(event=>event.kind==='trace.protocol'))){
    result.input_attribution=reconcilePresentationInputs(result.batches.flatMap(batch=>batch.events),result.browser_inputs);
    result.input_validation=validatePresentationInputCapture(result,{final:seal});
  }
  return result;
}

export async function waitPresentationQuiet(page, intervalMs=150, timeoutMs=2000) {
  const count=()=>page.evaluate(()=>window.__presentationBatches.reduce((total,batch)=>total+batch.events.filter(event=>!['media.frame','media.progress'].includes(event.kind)&&!(event.kind==='input.filtered'&&event.data.classification==='poll-sentinel')).length,0));
  const deadline=Date.now()+timeoutMs;
  let previous=await count();
  while(Date.now()<deadline){
    await page.waitForTimeout(intervalMs);
    const current=await count();
    if(current===previous){await page.evaluate(count=>{window.__presentationQuietObserved=true;window.__presentationQuietCount=count;},current);return;}
    previous=current;
  }
  throw Error('No bounded structural/UI/request quiet interval observed');
}
