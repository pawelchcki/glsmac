import assert from 'node:assert/strict';
import test from 'node:test';
import {runStreamingWorker} from './streaming-worker.mjs';

test('progress is delivered while the child is still running',async()=>{
  const result=await runStreamingWorker(process.execPath,['-e',"console.log('PID:'+process.pid);setInterval(()=>{},1000)"],{
    timeout:5000,onStderr:()=>{},onStdout:chunk=>{
      const match=chunk.toString().match(/PID:(\d+)/);
      if(match)process.kill(Number(match[1]),'SIGTERM');
    }});
  assert.equal(result.error,null);assert.equal(result.signal,'SIGTERM');
});

test('complete UTF-8 output survives chunk boundaries',async()=>{
  let sawProgress=false;
  const result=await runStreamingWorker(process.execPath,['-e',`
    process.stdout.write('entered script\\n');
    process.stdin.once('data',()=>{process.stdout.write(Buffer.from([0xc3]));setTimeout(()=>{process.stdout.write(Buffer.from([0xa9]));process.stderr.write('diagnostic');},10);});
  `],{input:'go',timeout:5000,onStdout:chunk=>{if(chunk.toString().includes('entered script'))sawProgress=true;},onStderr:()=>{}});
  assert.equal(sawProgress,true);assert.equal(result.error,null);assert.equal(result.status,0);
  assert.equal(result.stdout,'entered script\né');assert.equal(result.stderr,'diagnostic');
});

test('timeout preserves progress, kills and reaps the worker',async()=>{
  const result=await runStreamingWorker(process.execPath,['-e',"console.log('last entered script');setInterval(()=>{},1000)"],
    {timeout:500,onStdout:()=>{},onStderr:()=>{}});
  assert.match(result.error.message,/timed out/);assert.equal(result.signal,'SIGKILL');
  assert.match(result.stdout,/last entered script/);assert.equal(result.status,null);
});

test('output bound stays strict and nonzero failures remain visible',async()=>{
  const bounded=await runStreamingWorker(process.execPath,['-e',"process.stdout.write('x'.repeat(10000));setInterval(()=>{},1000)"],
    {maxBuffer:128,onStdout:()=>{},onStderr:()=>{}});
  assert.match(bounded.error.message,/output bound/);assert.equal(Buffer.byteLength(bounded.stdout),128);
  assert.equal(bounded.signal,'SIGKILL');
  const failed=await runStreamingWorker(process.execPath,['-e',"console.error('TEST FAILED');process.exit(3)"],{onStdout:()=>{},onStderr:()=>{}});
  assert.equal(failed.status,3);assert.match(failed.stderr,/TEST FAILED/);
});
