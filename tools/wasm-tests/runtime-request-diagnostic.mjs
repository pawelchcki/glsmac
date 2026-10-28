// Controlled NO-WASM protocol diagnostic, not the candidate runtime.
import http from 'node:http';import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {chromium} from 'playwright';
const dir=process.argv[2];assert.ok(dir);mkdirSync(dir,{recursive:true});const now=()=>performance.now();
const index='<!doctype html><html><body><script src="/bootstrap-model.js"></script></body></html>';
const bootstrap='globalThis.Module={print:()=>{},printErr:()=>{}};async function loadApplication(){const script=document.createElement("script");script.src="GLSMAC.js";document.body.append(script);}loadApplication();';
const runtime='if(typeof document==="undefined"){postMessage({ready:true});}else{window.__modelMain=true;function allocateUnusedWorker(){const worker=new Worker("GLSMAC.js");worker.onmessage=()=>{window.__modelWorkerReady=true;};}allocateUnusedWorker();}';
const report={version:1,scope:'NO-WASM actual main/dedicated-worker request metadata',candidate_executed:false,actual_runtime_executed:false,node:process.version,events:[],model_sources:{index,bootstrap,runtime},model_sha256:Object.fromEntries(Object.entries({index,bootstrap,runtime}).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')]))};
const record=(kind,data)=>{report.events.push({kind,observed_ms:now(),...data});writeFileSync(`${dir}/events.json`,JSON.stringify(report,null,2)+'\n');};
const server=http.createServer((req,res)=>{record('wire-request',{url:req.url,headers:req.headers});res.setHeader('Content-Type',req.url==='/'?'text/html':'application/javascript');res.end(req.url==='/'?index:req.url==='/bootstrap-model.js'?bootstrap:req.url==='/GLSMAC.js'?runtime:'');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});report.browser=browser.version();const timer=setTimeout(()=>{record('hard-deadline',{});void browser.close();},30000);
try{const page=await browser.newPage();const cdp=await page.context().newCDPSession(page);await cdp.send('Network.enable');cdp.on('Network.requestWillBeSent',e=>record('cdp-network',{url:e.request.url,type:e.type,request_id:e.requestId,frame_id:e.frameId,loader_id:e.loaderId,initiator:e.initiator}));
const root=await browser.newBrowserCDPSession();await root.send('Target.setDiscoverTargets',{discover:true});root.on('Target.targetCreated',e=>record('cdp-target-created',{target:e.targetInfo}));
page.on('worker',worker=>record('playwright-worker',{url:worker.url()}));page.on('pageerror',e=>record('pageerror',{error:String(e)}));
await page.route('**/GLSMAC.js',async route=>{const request=route.request();let frame;try{frame={url:request.frame().url(),main:request.frame()===page.mainFrame()};}catch(error){frame={error:String(error)};}
record('route-request',{url:request.url(),resource_type:request.resourceType(),headers:await request.allHeaders(),frame,service_worker:request.serviceWorker()!==null});await route.continue();});
await page.goto(origin);await page.waitForFunction(()=>window.__modelWorkerReady===true,{},{timeout:15000});
const proof=await page.evaluate(()=>({main:__modelMain,worker:__modelWorkerReady,wasm_resources:performance.getEntriesByType('resource').filter(e=>/\.wasm/.test(e.name)).map(e=>e.name)}));assert.deepEqual(proof,{main:true,worker:true,wasm_resources:[]});report.proof=proof;report.status='complete';
}finally{clearTimeout(timer);await browser.close();await new Promise(resolve=>server.close(resolve));writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
