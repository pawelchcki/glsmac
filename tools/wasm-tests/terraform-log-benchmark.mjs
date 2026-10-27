// Offline renderer-cost measurement only. No WASM, candidate or game input.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const [rawPath,webPath,outPath]=process.argv.slice(2);
assert.ok(rawPath&&webPath&&outPath,'Requires actual raw capture, exact web shell and artifact directory');
mkdirSync(outPath,{recursive:true});
const hash=value=>createHash('sha256').update(value).digest('hex');
const raw=readFileSync(rawPath),text=raw.toString('utf8');
assert.equal(raw.at(-1),10);assert.deepEqual(Buffer.from(text),raw);
const messages=text.slice(0,-1).split('\n');
const html=readFileSync(`${webPath}/index.html`,'utf8'),bootstrap=readFileSync(`${webPath}/bootstrap.js`,'utf8');
const original=bootstrap.match(/function log\(message\) \{\n[^]*?\n\}/)?.[0];assert.ok(original);
const append='  logElement.textContent += `${message}\\n`;';
const layout='  logElement.scrollTop = logElement.scrollHeight;';
assert.equal(original,`function log(message) {\n${append}\n${layout}\n}`);
// Preserve both original statements in order; inserted clock reads partition
// their cost. No redirect, truncation, CSS simplification or substitute sink.
const measured=original.replace(append,`  const begin=performance.now();\n${append}\n  const appended=performance.now();`)
 .replace(layout,`${layout}\n  const end=performance.now();\n  return {append_ms:appended-begin,layout_ms:end-appended,total_ms:end-begin};`);
const noScripts=html.replace(/<script\b[^>]*>[^]*?<\/script>/g,'');
assert.equal(noScripts.includes('<script'),false);
const report={version:1,scope:'NO-WASM actual-log DOM microbenchmark',candidate_executed:false,game_inputs:0,
 input:{path:rawPath,sha256:hash(raw),bytes:raw.length,utf16:text.length,lf_messages:messages.length,assumption:'Each captured LF-delimited line replayed as one callback; actual game callback times not recorded'},
 source:{web:webPath,html_sha256:hash(html),bootstrap_sha256:hash(bootstrap),original_log_sha256:hash(original),measured_log_sha256:hash(measured),html_transform:'Remove script tags only; declare normal running setup hidden; separately control details.open',original_log:original,measured_log:measured},
 node:process.version,browser:null,browser_executable:chromium.executablePath(),fontconfig:process.env.FONTCONFIG_FILE??null,viewport:{width:1100,height:1000},scope_budget_ms:45000,hard_budget_ms:120000,results:[],errors:[]};
writeFileSync(`${outPath}/bindings.json`,JSON.stringify(report,null,2)+'\n');
const browser=await chromium.launch({headless:true,executablePath:process.env.WASM_BROWSER_EXECUTABLE||undefined,
 args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser=browser.version();
const hardDeadline=setTimeout(()=>{report.errors.push('Hard120s NO-WASM benchmark deadline');void browser.close();},120000);
try{
 for(const open of [false,true]){
  const scope=open?'open':'closed';const page=await browser.newPage({viewport:{width:1100,height:1000}});
  const network=[];page.on('request',request=>network.push(request.url()));
  await page.route('**/*',route=>route.abort());
  const rows=[];writeFileSync(`${outPath}/${scope}-calls.jsonl`,'');
  await page.exposeFunction('retainLogMeasurement',row=>{rows.push(row);appendFileSync(`${outPath}/${scope}-calls.jsonl`,JSON.stringify(row)+'\n');});
  try{
   await page.setContent(noScripts);
   await page.evaluate(({open,measured})=>{
    document.querySelector('#setup').hidden=true;document.body.dataset.state='running';
    document.querySelector('details').open=open;
    const logElement=document.querySelector('#log');
    globalThis.__measureLog=new Function('logElement',`return (${measured});`)(logElement);
   },{open,measured});
   const outcome=await page.evaluate(async({messages,budget})=>{
    const started=performance.now();let completed=0;
    for(let i=0;i<messages.length;i++){
     if(performance.now()-started>budget)break;
     const before=document.querySelector('#log').textContent.length;
     const timing=__measureLog(messages[i]);
     completed++;
     await retainLogMeasurement({index:i,input_utf16:messages[i].length,before_utf16:before,after_utf16:before+messages[i].length+1,...timing});
    }
    return{completed,wall_ms:performance.now()-started,module_defined:typeof Module!=='undefined',wasm_resources:performance.getEntriesByType('resource').filter(r=>/GLSMAC|\.wasm/.test(r.name)).map(r=>r.name),details_open:document.querySelector('details').open};
   },{messages,budget:45000});
   const restored=await page.locator('#log').textContent();const bytes=Buffer.from(restored);writeFileSync(`${outPath}/${scope}-application.log`,bytes);
   const prefix=Buffer.from(messages.slice(0,outcome.completed).join('\n')+(outcome.completed?'\n':''));assert.deepEqual(bytes,prefix);
   assert.equal(outcome.module_defined,false);assert.deepEqual(outcome.wasm_resources,[]);assert.deepEqual(network,[]);
   const sums=Object.fromEntries(['append_ms','layout_ms','total_ms'].map(key=>[key,rows.reduce((n,r)=>n+r[key],0)]));
   report.results.push({scope,status:outcome.completed===messages.length?'complete':'bounded-partial',...outcome,calls:rows.length,sums,max_callback_ms:Math.max(0,...rows.map(r=>r.total_ms)),retained_bytes:bytes.length,retained_sha256:hash(bytes),exact_input_prefix:true,exact_full_input:bytes.equals(raw),network_requests:network});
  }finally{await page.close();writeFileSync(`${outPath}/report.json`,JSON.stringify(report,null,2)+'\n');}
 }
}catch(error){report.errors.push(String(error));throw error;}
finally{clearTimeout(hardDeadline);await browser.close();writeFileSync(`${outPath}/report.json`,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
