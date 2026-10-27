import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {installNativeLogHook} from './browser-native-log-hook.mjs';
const source='function log(message) {\n  logElement.textContent += `${message}\\n`;\n  logElement.scrollTop = logElement.scrollHeight;\n}';
function fixture(){
 const element={textContent:'bootstrap prefix\n'};
 Object.defineProperty(element,'scrollHeight',{get(){throw Error('Forced layout must not be read');}});
 Object.defineProperty(element,'scrollTop',{set(){throw Error('Autoscroll must not be written');}});
 const c=vm.createContext({document:{querySelector:()=>element},performance,logElement:element});
 vm.runInContext(`${source};globalThis.Module={print:log,printErr:log};`,c);
 const install=vm.runInContext(`(${installNativeLogHook.toString()})`,c);
 return{element,c,install};
}
test('existing pre-runtime hooks retain stdout/stderr order, exact text and first callback',()=>{
 const f=fixture();const ack=f.install({expectedOriginalSource:source});assert.equal(ack.installed_before_runtime_capture,true);
 vm.runInContext('Module.callMain=()=>{};globalThis.out=Module.print;globalThis.err=Module.printErr;out("one😀");err("two漢");',f.c);
 assert.equal(f.element.textContent,'bootstrap prefix\none😀\ntwo漢\n');
 const state=f.c.__terraformNativeLogHook;assert.equal(state.calls.length,2);assert.equal(state.calls[0].channel,'stdout');assert.equal(state.calls[1].channel,'stderr');
 assert.equal(state.first_callback.message,'one😀');assert.equal(state.first_callback.runtime_callMain_present,true);
 assert.equal(state.first_callback.runtime_out_bound,true);assert.equal(state.first_callback.runtime_err_bound,true);
 assert.equal(state.calls[1].before_utf16,state.calls[0].after_utf16);
 assert.throws(()=>f.install({expectedOriginalSource:source}),/already installed/);
});
test('the original append coerces each message exactly once',()=>{
 const f=fixture();f.install({expectedOriginalSource:source});let count=0;f.c.Module.print({toString(){count++;return'once';}});assert.equal(count,1);assert.equal(f.element.textContent,'bootstrap prefix\nonce\n');
});
test('missing, unexpected and late runtime configuration reject without replacing hooks',()=>{
 for(const kind of ['missing','source','late-main','late-out','late-err']){
  const f=fixture();
  if(kind==='missing')vm.runInContext('delete globalThis.Module',f.c);
  if(kind==='late-main')vm.runInContext('Module.callMain=()=>{}',f.c);
  if(kind==='late-out')vm.runInContext('globalThis.out=()=>{}',f.c);
  if(kind==='late-err')vm.runInContext('globalThis.err=()=>{}',f.c);
  assert.throws(()=>f.install({expectedOriginalSource:kind==='source'?'unexpected':source}),/missing|Unexpected|after runtime/);
 }
});
