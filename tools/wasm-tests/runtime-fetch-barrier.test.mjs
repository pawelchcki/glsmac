import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {EventEmitter} from 'node:events';
import {RuntimeFetchEvidence,attachRuntimeLogBarrier} from './runtime-fetch-barrier.mjs';
const actual=JSON.parse(readFileSync(new URL('./fixtures/runtime-fetch-observations.json',import.meta.url)));
const main=actual.main.network,worker=actual.worker.network,target=actual.worker.target;
const pause=(event,id)=>({...structuredClone(event===worker?actual.worker.paused:actual.main.paused),requestId:id,networkId:event.requestId,frameId:event.frameId,request:{url:event.request.url}});
function fixture(){const bootstrap=main.initiator.stack.callFrames[0].url;const e=new RuntimeFetchEvidence(main.request.url,bootstrap);e.frameNavigated({id:main.frameId,loaderId:main.loaderId,url:new URL('/',bootstrap).href});return e;}
function install(e){e.networkRequest(main);const p=pause(main,'declared-Fetch-main');const role=e.classify(p);e.consume(p,role);return role;}
test('actual mainScript and workerOther Fetch records link exact NetworkScript/Target identity',()=>{
 const e=fixture();e.networkRequest(main);const roleMain=e.classify(actual.main.paused);assert.equal(roleMain.kind,'main');e.consume(actual.main.paused,roleMain);e.targetCreated(target);e.networkRequest(worker);
 assert.equal(e.classify(actual.worker.paused).kind,'worker');
 const p=pause(worker,'declared-Fetch-worker');const role=e.classify(p);assert.equal(role.kind,'worker');assert.equal(role.network_id,target.targetId);e.consume(p,role);
 assert.throws(()=>e.classify(p),/already consumed/);
 assert.throws(()=>e.classify({...p,requestId:'different-pause-same-network'}),/already consumed/);
});
test('Fetch type alone never classifies a worker and role-mismatched types reject',()=>{
 const e=fixture();e.networkRequest(main);assert.throws(()=>e.classify({...actual.main.paused,resourceType:'Other'}),/Main bootstrap/);
 e.consume(actual.main.paused,e.classify(actual.main.paused));e.networkRequest(worker);
 assert.equal(e.classify(actual.worker.paused),null,'Other without a positive target must not authorize a worker');
 e.targetCreated(target);assert.throws(()=>e.classify({...actual.worker.paused,resourceType:'Script'}),/dedicated-worker Fetch/);
 const wrongLoader=fixture();wrongLoader.frameNavigated({id:main.frameId,loaderId:'unrelated-loader',url:'declared'});wrongLoader.networkRequest(main);assert.equal(wrongLoader.classify(actual.main.paused),null);
});
test('Network, frame and target event ordering waits for positive evidence, never same-URL FIFO',()=>{
 const e=new RuntimeFetchEvidence(main.request.url,main.initiator.stack.callFrames[0].url),p=pause(main,'main');assert.equal(e.classify(p),null);
 e.networkRequest(main);assert.equal(e.classify(p),null);e.frameNavigated({id:main.frameId,loaderId:main.loaderId,url:'declared'});e.consume(p,e.classify(p));
 const wp=pause(worker,'worker');e.networkRequest(worker);assert.equal(e.classify(wp),null);
 e.targetCreated({...target,targetId:'different-worker-same-url',url:worker.request.url});assert.equal(e.classify(wp),null);
 e.targetCreated(target);assert.equal(e.classify(wp).target_id,target.targetId);
});
test('missing IDs, wrong frames/targets and unknown initiators cannot authorize main installation',()=>{
 for(const kind of ['missing-id','subframe','wrong-parent','shared-worker','unknown']){
  const e=fixture();install(e);e.networkRequest(worker);const p=pause(worker,'worker');
  if(kind==='missing-id')delete p.networkId;
  if(kind==='subframe')p.frameId='foreign-frame';
  if(kind==='wrong-parent')e.targetCreated({...target,parentFrameId:'foreign-frame'});
  if(kind==='shared-worker')e.targetCreated({...target,type:'shared_worker'});
  if(kind==='unknown'){assert.equal(e.classify(p),null);assert.throws(()=>e.consume(p,{kind:'worker'}));continue;}
  assert.throws(()=>e.classify(p));
 }
});
test('destroyed targets, navigation and repeated main runtime fail closed',()=>{
 const e=fixture();install(e);e.networkRequest(worker);e.targetCreated(target);e.targetDestroyed(target.targetId);
 e.targetChanged(target);assert.throws(()=>e.classify(pause(worker,'worker')),/destroyed/);assert.throws(()=>e.targetCreated(target),/resurrected/);
 const reload={...main,requestId:'second-main'};e.networkRequest(reload);assert.throws(()=>e.classify(pause(reload,'reload')),/only once/);
 const changed=fixture();install(changed);changed.networkRequest(worker);changed.targetCreated(target);changed.frameNavigated({id:main.frameId,loaderId:'new-document',url:'declared'});assert.throws(()=>changed.classify(pause(worker,'old-worker')),/Navigation invalidates/);
});
function protocolFixture({evaluate=async()=>({declared:'model ack'})}={}){
 const cdp=new EventEmitter(),root=new EventEmitter(),commands=[],continuations=[],errors=[],metadata={installations:0};
 cdp.send=async(command,args)=>{
  commands.push({command,args});
  if(command==='Page.getFrameTree')return{frameTree:{frame:{id:main.frameId,loaderId:main.loaderId,url:'declared model'}}};
  if(command==='Fetch.continueRequest')return new Promise(resolve=>continuations.push(resolve));
  return{};
 };
 root.send=async()=>({});const page={context:()=>({newCDPSession:async()=>cdp}),evaluate};const browser={newBrowserCDPSession:async()=>root};
 const attach=()=>attachRuntimeLogBarrier(page,browser,{runtimeURL:main.request.url,bootstrapURL:main.initiator.stack.callFrames[0].url,originalLogSource:'declared model',metadata,onError:e=>errors.push(String(e))});
 return{cdp,root,commands,continuations,errors,metadata,attach};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('main and worker continuation metadata requires actual protocol acknowledgement',async()=>{
 const f=protocolFixture(),barrier=await f.attach();f.cdp.emit('Network.requestWillBeSent',main);f.cdp.emit('Fetch.requestPaused',pause(main,'main'));await tick();
 assert.equal(f.metadata.installations,1);assert.equal(f.metadata.barrier.continued,undefined);
 f.continuations.shift()({});await tick();assert.equal(f.metadata.barrier.continued,true);
 f.root.emit('Target.targetCreated',{targetInfo:target});f.cdp.emit('Network.requestWillBeSent',worker);f.cdp.emit('Fetch.requestPaused',pause(worker,'worker'));await tick();
 assert.equal(f.metadata.worker_requests,undefined);f.continuations.shift()({});await tick();assert.equal(f.metadata.worker_requests[0].continued,true);assert.deepEqual(f.errors,[]);barrier.stop();
});
test('closing during an outstanding installation prevents late metadata or continuation',async()=>{
 let resolveAck;const f=protocolFixture({evaluate:()=>new Promise(resolve=>{resolveAck=resolve;})}),barrier=await f.attach();
 f.cdp.emit('Network.requestWillBeSent',main);f.cdp.emit('Fetch.requestPaused',pause(main,'main'));await tick();const before=JSON.stringify(f.metadata);barrier.stop();resolveAck({late:'ack'});await tick();
 assert.equal(JSON.stringify(f.metadata),before);assert.equal(f.metadata.installations,0);assert.equal(f.commands.some(row=>row.command==='Fetch.continueRequest'),false);assert.deepEqual(f.errors,[]);
});
test('unknown positive worker identity times out and rejects the exact paused request',async()=>{
 const f=protocolFixture(),barrier=await f.attach();f.cdp.emit('Network.requestWillBeSent',main);f.cdp.emit('Fetch.requestPaused',pause(main,'main'));await tick();f.continuations.shift()({});await tick();
 f.cdp.emit('Network.requestWillBeSent',worker);f.cdp.emit('Fetch.requestPaused',pause(worker,'unknown-worker'));await new Promise(resolve=>setTimeout(resolve,2100));
 assert.match(f.errors[0],/No positive runtime request evidence/);assert.equal(f.metadata.worker_requests,undefined);assert.ok(f.commands.some(row=>row.command==='Fetch.failRequest'&&row.args.requestId==='unknown-worker'));barrier.stop();
});
