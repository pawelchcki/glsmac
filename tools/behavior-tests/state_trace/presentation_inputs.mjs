// Candidate-only ordered input diagnostics. No semantic UI/media coverage claim.
import assert from 'node:assert/strict';

const paired = new Set(['keydown','keyup','mousemove','mousedown','mouseup','wheel']);
const companions = new Set(['pointermove','pointerdown','pointerup','pointerover','pointerout','mouseover','mouseout','mouseenter','mouseleave','keypress','click','dblclick','focus','blur']);
const scan = {Enter:40,Escape:41,Backspace:42,Tab:43,Space:44,ArrowRight:79,ArrowLeft:80,ArrowDown:81,ArrowUp:82,Insert:73,Home:74,PageUp:75,Delete:76,End:77,PageDown:78,ShiftLeft:225,ShiftRight:229,ControlLeft:224,ControlRight:228,AltLeft:226,AltRight:230};
for(let n=0;n<26;n++)scan['Key'+String.fromCharCode(65+n)]=4+n;
for(let n=1;n<=9;n++)scan['Digit'+n]=29+n;
scan.Digit0=39;

// The legacy optional observer can include one extra real Space/next-turn step.
// Keep this separate diagnostic plan in memory; frozen case bytes are unchanged.
export function presentationOpeningInputPlan(pinned,{steps=4,confirmation='keyboard'}={}) {
  assert.ok(steps===4||steps===5);assert.ok(confirmation==='keyboard'||confirmation==='pointer');
  const plan=JSON.parse(JSON.stringify(pinned));
  if(steps===5){
    plan.fixture.profile='opening-next-turn-diagnostic-v1';
    plan.actions.push({id:'advance-turn',kind:'confirm.key',args:{key:'SPACE'}});
    plan.checkpoints.push({id:'after-next-turn',after_action:'advance-turn'});
  }
  if(confirmation==='pointer'){
    plan.fixture.profile='opening-pointer-diagnostic-v1';
    for(const action of plan.actions)if(['planetfall','first-base-name'].includes(action.id)){action.kind='confirm.pointer';action.args={control:'actual-confirm'};}
  }
  return plan;
}

export function reconcilePresentationInputs(events, browser, {allowPending=false}={}) {
  const gaps=[]; let gapCount=0; const gap=message=>{gapCount++;if(gaps.length<128)gaps.push(message);}; const ingress=new Map(); const dispositions=new Map(); const dispatch=[];
  let lastIngress=0, open=null;
  for(const event of events){
    const d=event.data;
    if(event.kind==='trace.error')gap('native control error at '+event.seq);
    if(event.kind==='input.filtered'&&!(d.classification==='poll-sentinel'&&d.sdl_type===0x7f00))gap('filtered SDL event '+d.sdl_type);
    if(event.kind==='input.ingress'){
      assert.equal(d.ingress,++lastIngress,'contiguous native ingress');
      ingress.set(d.ingress,{...d,event_seq:event.seq});
    } else if(event.kind==='input.disposition'){
      assert.ok(ingress.has(d.ingress),'disposition follows ingress');
      assert.ok(!dispositions.has(d.ingress),'one ingress disposition');
      dispositions.set(d.ingress,d);
    } else if(event.kind==='input.dispatch'){
      if(d.phase==='begin'){
        assert.equal(open,null,'no overlapping native input dispatch');open=d.ingress;
        if(!ingress.has(d.ingress))gap('dispatch without observed ingress '+d.ingress);
        dispatch.push({...d,event_seq:event.seq});
      } else {assert.equal(d.phase,'end');assert.equal(open,d.ingress,'matching dispatch completion');open=null;}
    }
  }
  if(open!==null)gap('unfinished native dispatch');
  const counts=new Map();for(const d of dispatch)counts.set(d.ingress,(counts.get(d.ingress)||0)+1);
  for(const [id,d] of ingress){
    const disposition=dispositions.get(id), count=counts.get(id)||0;
    if(disposition?.status==='coalesced'){
      if(count||d.type!=='mousemove'||!ingress.has(disposition.replaced_by))gap('invalid coalesced ingress '+id);
    }else if(disposition?.status==='not-dispatched'){
      if(count)gap('disposition/dispatch disagreement '+id);
      if(d.type!=='window')gap('unsupported native ingress '+id);
    }else if(count!==1)gap('missing/duplicate dispatch '+id);
  }
  const native=[...ingress.values()].filter(d=>paired.has(d.type));
  const observed=[];
  let browserSeq=0;
  for(const b of browser){
    assert.equal(b.seq,++browserSeq,'contiguous browser input ledger');
    if(!b.trusted)gap('untrusted browser input '+b.seq);
    if(b.pointerType&&b.pointerType!=='mouse')gap('unsupported pointer '+b.seq);
    if(paired.has(b.type))observed.push(b);
    else if(!companions.has(b.type))gap('unobserved browser input kind '+b.type);
  }
  const pairs=[];
  const length=Math.min(native.length,observed.length);
  for(let n=0;n<length;n++){
    const a=native[n],b=observed[n];let equal=a.type===b.type&&a.action===b.action;
    if(b.type==='keydown'||b.type==='keyup'){
      const mods=((a.modifiers&3)?1:0)|((a.modifiers&192)?2:0)|((a.modifiers&768)?4:0);
      equal&&=scan[b.code]!==undefined&&scan[b.code]===a.scancode&&mods===b.mods&&Boolean(a.repeat)===b.repeat;
    }else if(b.type==='wheel')equal=false; // Browser delta scaling/direction not yet independently verified.
    else {equal&&=b.canvas&&a.x===b.x&&a.y===b.y;if(b.type!=='mousemove')equal&&=a.button===b.button+1;}
    if(!equal)gap('browser/native payload or action differs at browser '+b.seq+' / ingress '+a.ingress);
    pairs.push({browser_input:b.seq,native_ingress:a.ingress,native_event_seq:a.event_seq,verified:equal});
  }
  if(native.length!==observed.length)gap('browser/native count differs: '+observed.length+'/'+native.length);
  const pending=allowPending&&native.length<observed.length;
  return {schema:'glsmac.presentation.inputs.v1',complete:gapCount===0,pending,gaps,gap_count:gapCount,pairs,
    physical_os_complete:false,browser_count:browser.length,native_ingress_count:ingress.size,dispatch_count:dispatch.length};
}

export function presentationCheckpointPrefix(capture, checkpoint, id, afterAction) {
  const events=capture.batches.flatMap(batch=>batch.events);
  const matches=events.filter(event=>event.kind==='trace.checkpoint'&&event.data.checkpoint===checkpoint);
  assert.equal(matches.length,1,'one acknowledged checkpoint');
  const watermark=matches[0].seq;
  const result={...capture,capture:{...capture.capture,terminal_drain_observed:false,final_quiet_observed:false,ended_at:'acknowledged-input-barrier',final_event_sequence:watermark},
    checkpoint:{id,after_action:afterAction,watermark},
    browser_inputs:capture.browser_inputs.filter(event=>event.seq<=capture.input_checkpoints[checkpoint-1].browser_watermark),
    input_checkpoints:capture.input_checkpoints.slice(0,checkpoint),
    input_checks:(capture.input_checks||[]).filter(check=>check.action<=matches[0].data.action),
    batches:[{enabled:true,dropped:0,events:events.filter(event=>event.seq<=watermark)}]};
  result.input_attribution=reconcilePresentationInputs(result.batches[0].events,result.browser_inputs);
  if(result.input_plan)result.input_validation=validatePresentationInputCapture(result);
  return result;
}

export function createPresentationInputSession(page, plan) {
  let nonce=0, action=1, checkpoint=0;
  const all=()=>page.evaluate(()=>({events:window.__presentationBatches.flatMap(batch=>batch.events),browser:window.__presentationBrowserInputs,error:window.__presentationTransportError}));
  const verify=async()=>{
    let result;
    for(let n=0;n<100;n++){
      const state=await all();assert.equal(state.error,null,'healthy native/browser input transport');
      result=reconcilePresentationInputs(state.events,state.browser,{allowPending:true});
      if(result.complete||!result.pending)return result;
      await page.waitForTimeout(50);
    }
    return result;
  };
  const command=async(op,nextAction,point=0)=>{
    const request={op,action:nextAction,checkpoint:point,nonce:++nonce};
    await page.evaluate(request=>{
      const native=window.Module?._glsmac_presentation_command;
      if(typeof native!=='function')throw Error('native input ledger command export unavailable (stale runtime)');
      if(native(request.op,request.action,request.checkpoint,request.nonce)!==1)throw Error('native input ledger command rejected');
    },request);
    await page.waitForFunction(request=>{
      const events=window.__presentationBatches.flatMap(batch=>batch.events);
      if(events.some(event=>event.kind==='trace.error'))throw Error('native input ledger fence order error');
      return events.some(event=>(event.kind==='trace.action'||event.kind==='trace.checkpoint')&&event.data.nonce===request.nonce&&event.data.op===request.op);
    },request,{timeout:5000});
  };
  return {
    async begin(id){assert.equal(plan.actions[action]?.id,id,'next declared action');await command(1,++action);await page.evaluate(action=>{window.__presentationBrowserAction=action;},action);},
    async end(){const result=await verify();const {pairs,...summary}=result;await page.evaluate(result=>{window.__presentationInputChecks.push(result);},{...summary,action});await command(2,action);return result;},
    async checkpoint(id){
      const wanted=plan.checkpoints[checkpoint];assert.equal(wanted.id,id);assert.equal(wanted.after_action,plan.actions[action-1].id);
      const result=await verify();const {pairs,...summary}=result;const browserWatermark=await page.evaluate(()=>window.__presentationBrowserInputs.length);
      await command(3,action,++checkpoint);
      await page.evaluate(point=>{window.__presentationInputCheckpoints.push(point);},{id,after_action:wanted.after_action,checkpoint,browser_watermark:browserWatermark,attribution:summary});
      return result;
    },
    async validate(){await page.evaluate(plan=>{window.__presentationInputPlan=plan;},plan);await page.waitForFunction(()=>window.__presentationBatches.some(batch=>batch.events.some(e=>e.kind==='trace.protocol'&&e.data.version===1)),null,{timeout:5000});const state=await all();assert.equal(state.events.filter(e=>e.kind==='trace.protocol'&&e.data.version===1).length,1,'required native input protocol (stale runtime)');return verify();}
  };
}

export function validatePresentationInputCapture(capture,{final=false}={}) {
  const plan=capture.input_plan;
  assert.ok(plan&&Array.isArray(plan.actions)&&Array.isArray(plan.checkpoints),'bound declared input/checkpoint plan');
  const events=capture.batches.flatMap(batch=>batch.events);
  let sequence=0,protocol=0,action=0,open=false,nonce=0,checkpoint=0;
  const fences=[];
  for(const event of events){
    assert.equal(event.seq,++sequence,'contiguous ledger/presentation sequence');
    const d=event.data;
    if(event.kind==='trace.protocol'){assert.equal(d.version,1);assert.equal(++protocol,1,'one protocol epoch');assert.equal(d.physical_os_complete,false);}
    if(event.kind==='trace.error')throw Error('native input fence error: '+JSON.stringify(d));
    if(event.kind==='trace.action'||event.kind==='trace.checkpoint'){
      assert.equal(protocol,1,'fences follow input protocol');
      assert.equal(d.nonce,nonce++,'contiguous acknowledged control nonce');
      if(d.op===1){assert.equal(open,false);assert.equal(d.action,action+1);assert.ok(plan.actions[d.action-1],'known declared action');action=d.action;open=true;}
      else if(d.op===2){assert.equal(open,true);assert.equal(d.action,action);open=false;}
      else {
        assert.equal(d.op,3);assert.equal(open,false);assert.equal(d.action,action);assert.equal(d.checkpoint,++checkpoint);
        const wanted=plan.checkpoints[checkpoint-1],observed=capture.input_checkpoints[checkpoint-1];
        assert.ok(wanted&&observed,'declared checkpoint exists');assert.equal(wanted.after_action,plan.actions[action-1].id);
        assert.equal(observed.id,wanted.id);assert.equal(observed.after_action,wanted.after_action);
      }
      fences.push({seq:event.seq,after_action:plan.actions[action-1].id,kind:event.kind,op:d.op,checkpoint:d.checkpoint});
    }
    if(event.kind==='input.ingress')assert.equal(d.action,action,'ingress uses applied native action boundary');
  }
  assert.equal(protocol,1,'required input protocol');
  if(final){assert.equal(open,false,'all declared actions ended');assert.equal(action,plan.actions.length,'all declared actions observed');assert.equal(checkpoint,plan.checkpoints.length,'all declared checkpoints observed');}
  return {valid:true,final,action_count:action,checkpoint_count:checkpoint,fences};
}
