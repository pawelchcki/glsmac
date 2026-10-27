// NO-WASM integrity replay. Module/out/err below are an explicitly declared
// source-only configuration model, never a candidate engine or native proof.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {installNativeLogHook} from './browser-native-log-hook.mjs';
const [rawPath,webPath,outPath]=process.argv.slice(2);assert.ok(rawPath&&webPath&&outPath);
mkdirSync(outPath,{recursive:true});const hash=v=>createHash('sha256').update(v).digest('hex');
const raw=readFileSync(rawPath),text=raw.toString('utf8');assert.equal(raw.at(-1),10);assert.deepEqual(Buffer.from(text),raw);
const messages=text.slice(0,-1).split('\n');
const bootstrap=readFileSync(`${webPath}/bootstrap.js`,'utf8'),html=readFileSync(`${webPath}/index.html`,'utf8'),runtime=readFileSync(`${webPath}/GLSMAC.js`,'utf8');
const original=bootstrap.match(/function log\(message\) \{\n[^]*?\n\}/)?.[0];assert.ok(original);
const captures=['if (Module["print"]) out = Module["print"];','if (Module["printErr"]) err = Module["printErr"];'];
for(const line of captures)assert.ok(runtime.includes(line));
const report={version:1,scope:'NO-WASM complete captured-text print-hook replay',candidate_executed:false,native_runtime_executed:false,
 input:{path:rawPath,bytes:raw.length,utf16:text.length,lf_messages:messages.length,sha256:hash(raw),assumption:'LF-delimited callback model; alternating diagnostic stdout/stderr lanes, original channel split unobserved'},
 source:{html_sha256:hash(html),bootstrap_sha256:hash(bootstrap),runtime_reference_sha256:hash(runtime),hook_source_sha256:hash(installNativeLogHook.toString()),original_log_sha256:hash(original),capture_assignment_model:captures,html_transform:'Remove scripts only; normal running setup hidden'},
 node:process.version,browser:null,viewport:{width:1100,height:1000},fontconfig:process.env.FONTCONFIG_FILE??null,results:[],errors:[]};
writeFileSync(`${outPath}/bindings.json`,JSON.stringify(report,null,2)+'\n');
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});report.browser=browser.version();
const timer=setTimeout(()=>{report.errors.push('NO-WASM replay hard120s deadline');void browser.close();},120000);
try{
 for(const open of [false,true]){
  const page=await browser.newPage({viewport:report.viewport});const network=[];page.on('request',request=>network.push(request.url()));await page.route('**/*',route=>route.abort());
  try{
   await page.setContent(html.replace(/<script\b[^>]*>[^]*?<\/script>/g,''));
   const initial=await page.evaluate(({original,open})=>{
    document.querySelector('#setup').hidden=true;document.body.dataset.state='running';document.querySelector('details').open=open;
    const element=document.querySelector('#log');const fn=new Function('logElement',`return (${original});`)(element);
    globalThis.Module={print:fn,printErr:fn};return element.textContent;
   },{original,open});assert.equal(initial,'');
   const ack=await page.evaluate(installNativeLogHook,{expectedOriginalSource:original});
   const result=await page.evaluate(({messages,captures})=>{
    // Only these two independently source-asserted assignments execute. No
    // runtime script, callMain, native API or WASM instantiation is involved.
    new Function(captures.join('\n'))();
    const start=performance.now();for(let i=0;i<messages.length;i++)(i%2?err:out)(messages[i]);
    return{wall_ms:performance.now()-start,text:document.querySelector('#log').textContent,state:__terraformNativeLogHook,
      callMain_defined:typeof Module.callMain!=='undefined',wasm_resources:performance.getEntriesByType('resource').filter(r=>/GLSMAC|\.wasm/.test(r.name)).map(r=>r.name)};
   },{messages,captures});
   const bytes=Buffer.from(result.text);assert.deepEqual(bytes,raw);assert.equal(result.state.calls.length,messages.length);
   for(let i=0;i<result.state.calls.length;i++){const call=result.state.calls[i];assert.equal(call.sequence,i+1);assert.equal(call.channel,i%2?'stderr':'stdout');assert.equal(call.runtime_out_bound,true);assert.equal(call.runtime_err_bound,true);if(i)assert.equal(call.before_utf16,result.state.calls[i-1].after_utf16);}
   assert.equal(result.callMain_defined,false);assert.deepEqual(result.wasm_resources,[]);assert.deepEqual(network,[]);
   const scope=open?'open':'closed';writeFileSync(`${outPath}/${scope}-application.log`,bytes);writeFileSync(`${outPath}/${scope}-callbacks.json`,JSON.stringify(result.state,null,2)+'\n');
   report.results.push({scope,status:'complete',messages:result.state.calls.length,wall_ms:result.wall_ms,bytes:bytes.length,sha256:hash(bytes),exact_full_input:true,initial_utf16:ack.initial_utf16,final_utf16:result.state.calls.at(-1).after_utf16,
    first_callback:result.state.first_callback,source_assignment_model_only:true,actual_engine_capture_proof:false,callMain_defined:false,wasm_resources:[],network_requests:[]});
  }finally{await page.close();}
 }
}catch(error){report.errors.push(String(error));throw error;}
finally{clearTimeout(timer);await browser.close();writeFileSync(`${outPath}/report.json`,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
