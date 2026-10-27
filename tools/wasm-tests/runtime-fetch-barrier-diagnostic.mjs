// NO-WASM live protocol proof of the exact same-URL main/worker barrier.
import http from 'node:http';import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {chromium} from 'playwright';import {attachRuntimeLogBarrier} from './runtime-fetch-barrier.mjs';
const [dir,web]=process.argv.slice(2);assert.ok(dir&&web);mkdirSync(dir,{recursive:true});
const hash=v=>createHash('sha256').update(v).digest('hex');
const bootstrapSource=readFileSync(`${web}/bootstrap.js`,'utf8'),runtimeSource=readFileSync(`${web}/GLSMAC.js`,'utf8');
const original=bootstrapSource.match(/function log\(message\) \{\n[^]*?\n\}/)?.[0];assert.ok(original);
const captures=['if (Module["print"]) out = Module["print"];','if (Module["printErr"]) err = Module["printErr"];'];for(const line of captures)assert.ok(runtimeSource.includes(line));
const index='<!doctype html><html><body><pre id="log"></pre><script src="/bootstrap-model.js"></script></body></html>';
const bootstrap=`const logElement=document.querySelector('#log');${original};globalThis.Module={print:log,printErr:log};async function loadApplication(){const script=document.createElement('script');script.src='GLSMAC.js';document.body.append(script);}loadApplication();`;
const runtime=`if(typeof document==='undefined'){postMessage({ready:true});}else{${captures.join('\n')}out('<NO-WASM model stdout>');err('<NO-WASM model stderr>');window.__modelMain=true;function allocateUnusedWorker(){const worker=new Worker('GLSMAC.js');worker.onmessage=()=>{window.__modelWorkerReady=true;};}allocateUnusedWorker();}`;
const report={version:1,scope:'NO-WASM CDP Fetch exact-network-ID main/worker proof',candidate_executed:false,actual_runtime_executed:false,node:process.version,events:[],errors:[],native_log_configuration:{installations:0},
 source:{actual_bootstrap_sha256:hash(bootstrapSource),runtime_reference_sha256:hash(runtimeSource),model_sources:{index,bootstrap,runtime},model_sha256:Object.fromEntries(Object.entries({index,bootstrap,runtime}).map(([k,v])=>[k,hash(v)]))}};
const record=(kind,data)=>report.events.push({kind,observed_ms:performance.now(),...data});
const server=http.createServer((req,res)=>{record('wire-request',{url:req.url,destination:req.headers['sec-fetch-dest']});res.setHeader('Content-Type',req.url==='/'?'text/html':'application/javascript');res.end(req.url==='/'?index:req.url==='/bootstrap-model.js'?bootstrap:req.url==='/GLSMAC.js'?runtime:'');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});report.browser=browser.version();let barrier;
const timer=setTimeout(()=>{report.errors.push('NO-WASM protocol hard30s deadline');void browser.close();},30000);
try{
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
 let rejectBarrier;const failure=new Promise((resolve,reject)=>{rejectBarrier=reject;});failure.catch(()=>{});
 barrier=await attachRuntimeLogBarrier(page,browser,{runtimeURL:`${origin}/GLSMAC.js`,bootstrapURL:`${origin}/bootstrap-model.js`,originalLogSource:original,metadata:report.native_log_configuration,onError:error=>{report.errors.push(String(error));rejectBarrier(error);}});
 await page.goto(origin);await Promise.race([page.waitForFunction(()=>window.__modelWorkerReady===true,{},{timeout:15000}),failure]);
 const proof=await page.evaluate(()=>({main:__modelMain,worker:__modelWorkerReady,callMain_defined:typeof Module.callMain!=='undefined',log:document.querySelector('#log').textContent,first:__terraformNativeLogHook.first_callback,calls:__terraformNativeLogHook.calls,wasm_resources:performance.getEntriesByType('resource').filter(e=>/\.wasm/.test(e.name)).map(e=>e.name)}));
 assert.equal(report.native_log_configuration.installations,1);assert.equal(report.native_log_configuration.barrier.continued,true);assert.equal(report.native_log_configuration.worker_requests.length,1);assert.equal(report.native_log_configuration.worker_requests[0].continued,true);assert.equal(proof.main,true);assert.equal(proof.worker,true);assert.equal(proof.callMain_defined,false);assert.deepEqual(proof.wasm_resources,[]);assert.equal(proof.log,'<NO-WASM model stdout>\n<NO-WASM model stderr>\n');assert.equal(proof.first.runtime_out_bound,true);assert.equal(proof.first.runtime_err_bound,true);assert.deepEqual(report.errors,[]);
 report.proof=proof;report.status='complete';
}finally{clearTimeout(timer);await browser.close();barrier?.stop();await new Promise(resolve=>server.close(resolve));writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
