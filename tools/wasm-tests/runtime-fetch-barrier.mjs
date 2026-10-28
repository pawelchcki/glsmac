import assert from 'node:assert/strict';
import {installNativeLogHook} from './browser-native-log-hook.mjs';

// Pinned Chromium evidence, never URL-FIFO or missing-header inference.
// Fetch.networkId is the CDP-defined link to Network.requestWillBeSent.
export class RuntimeFetchEvidence{
 constructor(runtimeURL,bootstrapURL){this.runtimeURL=runtimeURL;this.bootstrapURL=bootstrapURL;this.frame=null;this.network=new Map();this.targets=new Map();this.destroyed=new Set();this.used=new Set();this.usedNetwork=new Set();this.mainInstalled=false;this.installedDocument=null;}
 frameNavigated(frame){if(!frame.parentId)this.frame={id:frame.id,loaderId:frame.loaderId,url:frame.url};}
 networkRequest(event){if(event.request.url===this.runtimeURL){assert.ok(!this.network.has(event.requestId),'Runtime request network ID must be unique');this.network.set(event.requestId,event);}}
 targetCreated(info){assert.ok(!this.destroyed.has(info.targetId),'Destroyed target IDs cannot be resurrected');this.targets.set(info.targetId,{...info});}
 targetChanged(info){if(this.targets.has(info.targetId))this.targets.set(info.targetId,{...info});}
 targetDestroyed(id){this.targets.delete(id);this.destroyed.add(id);}
 classify(paused){
  assert.ok(paused.networkId,'Runtime request lacks exact CDP networkId');
  assert.ok(!this.used.has(paused.requestId),'Runtime Fetch pause was already consumed');
  assert.ok(!this.usedNetwork.has(paused.networkId),'Runtime network request was already consumed');
  assert.equal(paused.request.url,this.runtimeURL);
  const net=this.network.get(paused.networkId);if(!net||!this.frame)return null;
  assert.equal(net.request.url,paused.request.url);assert.equal(net.type,'Script');
  assert.equal(net.frameId,paused.frameId);assert.equal(paused.frameId,this.frame.id,'Runtime fetch must belong to the current main document');
  if(this.destroyed.has(paused.networkId))throw Error('Runtime worker target was destroyed');
  const target=this.targets.get(paused.networkId);
  if(target){
   assert.equal(paused.resourceType,'Other','Pinned Chromium identifies dedicated-worker Fetch pauses as Other');
   assert.equal(target.type,'worker','Only a live dedicated-worker target may bypass main installation');
   assert.equal(target.parentFrameId,this.frame.id);assert.ok(!target.url||target.url===paused.request.url);
   assert.ok(this.mainInstalled,'Worker runtime cannot precede the acknowledged main installation');
   assert.equal(this.frame.loaderId,this.installedDocument.loaderId,'Navigation invalidates the installed runtime document');
   return{kind:'worker',fetch_id:paused.requestId,network_id:paused.networkId,target_id:target.targetId,frame_id:paused.frameId};
  }
  const frames=net.initiator?.stack?.callFrames??[];
  const bootstrap=frames.some(f=>f.url===this.bootstrapURL&&f.functionName==='loadApplication');
  if(bootstrap){
   assert.equal(paused.resourceType,'Script','Main bootstrap runtime Fetch pause must be Script');
   if(net.loaderId!==this.frame.loaderId)return null;
   assert.ok(!this.mainInstalled,'Main runtime may be installed only once');
   return{kind:'main',fetch_id:paused.requestId,network_id:paused.networkId,frame_id:paused.frameId,loader_id:net.loaderId,bootstrap_initiator:net.initiator};
  }
  // Cross-session Target/Network events can arrive in either order. Wait for
  // positive target evidence; the caller's bounded wait rejects unknown IDs.
  return null;
 }
 consume(paused,role){assert.equal(this.classify(paused)?.kind,role.kind);this.used.add(paused.requestId);this.usedNetwork.add(paused.networkId);if(role.kind==='main'){this.mainInstalled=true;this.installedDocument={...this.frame};}}
}

export async function attachRuntimeLogBarrier(page,browser,{runtimeURL,bootstrapURL,originalLogSource,metadata,onError}){
 const cdp=await page.context().newCDPSession(page),root=await browser.newBrowserCDPSession();
 const ledger=new RuntimeFetchEvidence(runtimeURL,bootstrapURL),listeners=new Set(),cancellations=new Set();let stopped=false;
 const record=(kind,data)=>{if(stopped)return;metadata.protocol_events??=[];metadata.protocol_events.push({kind,observed_node_ms:performance.now(),...data});};
 const notify=()=>{for(const fn of [...listeners])fn();};
 const sourceEvent=(kind,update,data)=>{if(stopped)return;try{update();record(kind,data);notify();}catch(error){onError(error);}};
 cdp.on('Page.frameNavigated',e=>sourceEvent('frame',()=>ledger.frameNavigated(e.frame),{frame:e.frame}));
 cdp.on('Network.requestWillBeSent',e=>{if(e.request.url===runtimeURL)sourceEvent('network',()=>ledger.networkRequest(e),{event:e});});
 root.on('Target.targetCreated',e=>sourceEvent('target-created',()=>ledger.targetCreated(e.targetInfo),{target:e.targetInfo}));
 root.on('Target.targetInfoChanged',e=>sourceEvent('target-changed',()=>ledger.targetChanged(e.targetInfo),{target:e.targetInfo}));
 root.on('Target.targetDestroyed',e=>sourceEvent('target-destroyed',()=>ledger.targetDestroyed(e.targetId),{target_id:e.targetId}));
 await cdp.send('Page.enable');await cdp.send('Network.enable');
 const tree=await cdp.send('Page.getFrameTree');ledger.frameNavigated(tree.frameTree.frame);
 await root.send('Target.setDiscoverTargets',{discover:true});
 const evidence=paused=>new Promise((resolve,reject)=>{
  let timer;const clean=()=>{clearTimeout(timer);listeners.delete(check);cancellations.delete(cancel);};
  const cancel=()=>{clean();reject(Error('Runtime barrier closed'));};
  const check=()=>{try{const role=ledger.classify(paused);if(role){clean();resolve(role);}}catch(error){clean();reject(error);}};
  timer=setTimeout(()=>{clean();reject(Error(`No positive runtime request evidence for networkId ${paused.networkId}`));},2000);
  cancellations.add(cancel);
  listeners.add(check);check();
 });
 cdp.on('Fetch.requestPaused',async paused=>{
  if(stopped)return;
  record('fetch-paused',{event:paused});
  try{
   const role=await evidence(paused);
   if(stopped)return;
   if(role.kind==='main'){
    assert.equal(metadata.installations,0);
    const ack=await page.evaluate(installNativeLogHook,{expectedOriginalSource:originalLogSource});
    if(stopped)return;
    metadata.installations++;metadata.barrier={...role,ack,acknowledged_node_ms:performance.now(),before_unmodified_runtime_response:true};
   }
   ledger.consume(paused,role);record('continue-requested',{role});
   await cdp.send('Fetch.continueRequest',{requestId:paused.requestId});
   if(stopped)return;
   const acknowledged_node_ms=performance.now();record('continue-acknowledged',{role});
   if(role.kind==='main'){metadata.barrier.continued=true;metadata.barrier.continuation_acknowledged_node_ms=acknowledged_node_ms;}
   else{metadata.worker_requests??=[];metadata.worker_requests.push({...role,continued:true,continuation_acknowledged_node_ms:acknowledged_node_ms,continued_without_frame_lookup:true});}
  }catch(error){if(stopped)return;record('rejected',{error:String(error),fetch_id:paused.requestId,network_id:paused.networkId});onError(error);try{await cdp.send('Fetch.failRequest',{requestId:paused.requestId,errorReason:'BlockedByClient'});}catch{} }
 });
 await cdp.send('Fetch.enable',{patterns:[{urlPattern:runtimeURL,requestStage:'Request'}]});
 return{ledger,cdp,root,stop:()=>{stopped=true;for(const cancel of [...cancellations])cancel();listeners.clear();cdp.removeAllListeners();root.removeAllListeners();}};
}
