// Browser-side test configuration only. Production bootstrap/runtime stay intact.
export function installNativeLogHook({expectedOriginalSource}){
  if(globalThis.__terraformNativeLogHook)throw Error('Native log hook already installed');
  const module=globalThis.Module,element=document.querySelector('#log');
  if(!module||!element)throw Error('Bootstrap Module/log configuration is missing');
  if(typeof module.callMain!=='undefined'||typeof globalThis.out!=='undefined'||typeof globalThis.err!=='undefined')throw Error('Native log hook installed after runtime execution');
  if(typeof module.print!=='function'||typeof module.printErr!=='function'||module.print.toString()!==expectedOriginalSource||module.printErr.toString()!==expectedOriginalSource)throw Error('Unexpected original bootstrap print hooks');
  const state={version:1,installed_ms:performance.now(),installed_before_runtime_capture:true,
    initial_text:element.textContent,initial_utf16:element.textContent.length,calls:[],first_callback:null,
    original_source:expectedOriginalSource,debug_autoscroll:'unsupported under test-only native print hook'};
  const make=channel=>function(message){
    const before=element.textContent.length;
    // Identical original append, same element and newline. Only the forced
    // debug-log scrollHeight/scrollTop operation is omitted by this test hook.
    element.textContent += `${message}\n`;
    const record={sequence:state.calls.length+1,channel,before_utf16:before,after_utf16:element.textContent.length,
      message_utf16:element.textContent.length-before-1,observed_ms:performance.now(),runtime_callMain_present:typeof module.callMain==='function',
      runtime_out_bound:globalThis.out===module.print,runtime_err_bound:globalThis.err===module.printErr};
    state.calls.push(record);
    if(state.first_callback===null)state.first_callback={...record,message:element.textContent.slice(before,-1)};
  };
  module.print=make('stdout');module.printErr=make('stderr');
  state.stdout_source=module.print.toString();state.stderr_source=module.printErr.toString();
  globalThis.__terraformNativeLogHook=state;
  return{version:state.version,installed_ms:state.installed_ms,installed_before_runtime_capture:true,
    initial_utf16:state.initial_utf16,original_source:state.original_source,stdout_source:state.stdout_source,stderr_source:state.stderr_source};
}
