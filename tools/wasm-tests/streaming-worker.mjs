// Preserve bounded complete output for strict assertions while exposing progress.
import {spawn} from 'node:child_process';

export function runStreamingWorker(command, args, {cwd, input='', timeout=1200000,
  maxBuffer=10*1024*1024, onStdout=chunk=>process.stdout.write(chunk),
  onStderr=chunk=>process.stderr.write(chunk)}={}) {
  return new Promise(resolve=>{
    const child=spawn(command,args,{cwd,stdio:['pipe','pipe','pipe']});
    const buffers={stdout:[],stderr:[]};
    const sizes={stdout:0,stderr:0};
    let error=null;
    const stop=reason=>{if(!error)error=reason;child.kill('SIGKILL');};
    const timer=setTimeout(()=>stop(new Error('GSE worker timed out')),timeout);
    for(const [name,forward] of [['stdout',onStdout],['stderr',onStderr]]) {
      child[name].on('data',chunk=>{
        const remaining=Math.max(0,maxBuffer-sizes[name]);
        const retained=chunk.subarray(0,remaining);
        if(retained.length){buffers[name].push(retained);sizes[name]+=retained.length;forward(retained);}
        if(chunk.length>remaining)stop(new Error(`GSE worker ${name} exceeded output bound`));
      });
    }
    child.on('error',failure=>{error=error||failure;});
    child.stdin.on('error',failure=>{if(failure.code!=='EPIPE')stop(failure);});
    child.on('close',(status,signal)=>{
      clearTimeout(timer);
      resolve({status,signal,error,stdout:Buffer.concat(buffers.stdout).toString('utf8'),
        stderr:Buffer.concat(buffers.stderr).toString('utf8')});
    });
    child.stdin.end(input);
  });
}
