// Exercise the actual worker installation with a declared runtime stub. These
// tests cover byte transport, not gameplay or original-game agreement.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const {test} = require('node:test');
const worker = path.join(__dirname, 'gse-worker.cjs');
const source = fs.readFileSync(worker, 'utf8');

function install(writeSync, extra = {}) {
  const request = {runtime:'/declared/GLSMAC.js',snapshot:'/declared/scripts.json',script:'GLSMAC_data/tests/probe.gls.js',prefix:'/declared',...extra};
  const scripts = {'GLSMAC_data/tests/probe.gls.js':'', 'GLSMAC_data/tests/_behavior.gls.js':''};
  const io = {writeSync,readFileSync:name=>JSON.stringify(name === 0 ? request : scripts)};
  const waits = [];
  const childProcess = {execPath:process.execPath,argv:[]};
  vm.runInNewContext(source, {Buffer,process:childProcess,
    Atomics:{wait:(_array,_index,_value,ms)=>waits.push(ms)},require:name=>{
      if(name === 'node:fs') return io;
      if(name === 'node:path') return path;
      assert.equal(name,request.runtime);return {};
    }});
  return {io,waits,argv:childProcess.argv};
}

function partial(limit, interrupts=[]) {
  const chunks=[],calls=[];
  const write = (fd,data,offset=0,length,position)=>{
    calls.push({fd,data,offset,length,position});
    if(interrupts.length) { const code=interrupts.shift();throw Object.assign(new Error(code),{code}); }
    const bytes=typeof data === 'string' ? Buffer.from(data) : Buffer.from(data.buffer,data.byteOffset,data.byteLength);
    const remaining=length ?? bytes.length-offset;
    const count=Math.min(limit,remaining);
    chunks.push(Buffer.from(bytes.subarray(offset,offset+count)));return count;
  };
  return {write,chunks,calls};
}

test('stdout and stderr retain >64KiB JSON and multibyte UTF-8 through forced short writes',()=>{
  const text=JSON.stringify({quote:'Gaïa 🌱'.repeat(20000)})+'\n';
  assert.ok(Buffer.byteLength(text)>65536);
  for(const fd of [1,2]) {
    const output=partial(4093);const {io}=install(output.write);
    assert.equal(io.writeSync(fd,text),Buffer.byteLength(text));
    assert.deepEqual(Buffer.concat(output.chunks),Buffer.from(text));
    assert.ok(output.calls.length>1);
  }
});

test('buffer, typed-array, DataView and options overloads preserve byte slices and positions',()=>{
  for(const data of [Buffer.from('0123456789'),new Uint8Array([0,1,2,3,4,5,6,7]),new DataView(new Uint8Array([0,1,2,3,4,5,6,7]).buffer)]) {
    for(const options of [false,true]) {
      const output=partial(2);const {io}=install(output.write);
      const actual=options ? io.writeSync(2,data,{offset:2,length:5,position:17}) : io.writeSync(2,data,2,5,17);
      assert.equal(actual,5);
      assert.deepEqual(Buffer.concat(output.chunks),Buffer.from(data.buffer,data.byteOffset,data.byteLength).subarray(2,7));
      assert.deepEqual(output.calls.map(call=>call.position),[17,19,21]);
    }
  }
  const output=partial(2);const {io}=install(output.write);
  assert.equal(io.writeSync(1,Buffer.from('abc')),3);
  assert.deepEqual(Buffer.concat(output.chunks),Buffer.from('abc'));
});

test('string encoding and explicit position overloads encode once and retain return byte counts',()=>{
  for(const [encoding,expected] of [['latin1',Buffer.from([0xe9])],['utf16le',Buffer.from([0xe9,0])],['unknown',Buffer.from('é')]]) {
    const output=partial(1);const {io}=install(output.write);
    assert.equal(io.writeSync(1,'é',9,encoding),expected.length);
    assert.deepEqual(Buffer.concat(output.chunks),expected);
    assert.deepEqual(output.calls.map(call=>call.position),Array.from({length:expected.length},(_,i)=>9+i));
  }
  const output=partial(1);const {io}=install(output.write);
  assert.equal(io.writeSync(1,''),0);
});

test('interruptions and backpressure sleep before retry; closed pipes and invalid progress fail clearly',()=>{
  const output=partial(2,['EINTR','EAGAIN','EWOULDBLOCK']);const {io,waits}=install(output.write);
  assert.equal(io.writeSync(1,'Gaïa'),5);
  assert.deepEqual(Buffer.concat(output.chunks),Buffer.from('Gaïa'));
  assert.deepEqual(waits,[1,1,1]);
  for(const count of [0,-1,NaN,Infinity,10]) {
    const {io}=install(()=>count);
    assert.throws(()=>io.writeSync(1,'abc'),/Invalid stdout\/stderr write progress/);
  }
  const failure=Object.assign(new Error('closed pipe'),{code:'EPIPE'});
  const closed=install(()=>{throw failure;});
  assert.throws(()=>closed.io.writeSync(2,'abc'),error=>error === failure);
});

test('unrelated descriptors and native validation errors remain delegated',()=>{
  const calls=[];const {io}=install((...args)=>{calls.push(args);return 2;});
  assert.equal(io.writeSync(4,'abcdef'),2);assert.equal(calls.length,1);
  assert.equal(calls[0][1],'abcdef');
  const failure=new TypeError('native validation');const invalid=install(()=>{throw failure;});
  assert.throws(()=>invalid.io.writeSync(1,Buffer.from('x'),-1),error=>error === failure);
  assert.throws(()=>invalid.io.writeSync(2,'abc',null,'hex'),error=>error === failure);
});

test('actual child stdout and stderr pipes preserve large multibyte records',()=>{
  const code=`
    const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
    const source=fs.readFileSync(process.argv[1],'utf8');
    const request={runtime:'/declared/GLSMAC.js',snapshot:'/declared/scripts.json',script:'GLSMAC_data/tests/probe.gls.js',prefix:'/declared'};
    const scripts={'GLSMAC_data/tests/probe.gls.js':'','GLSMAC_data/tests/_behavior.gls.js':''};
    const io={writeSync:fs.writeSync.bind(fs),readFileSync:name=>JSON.stringify(name===0?request:scripts)};
    vm.runInNewContext(source,{Buffer,process:{execPath:process.execPath,argv:[]},require:name=>name==='node:fs'?io:name==='node:path'?path:{}});
    const text=JSON.stringify({quote:'Gaïa 🌱'.repeat(20000)})+'\\n';
    io.writeSync(1,text);io.writeSync(2,text);
  `;
  const result=spawnSync(process.execPath,['-e',code,worker],{maxBuffer:2*1024*1024,timeout:10000});
  assert.equal(result.error,undefined);assert.equal(result.status,0);
  const expected=Buffer.from(JSON.stringify({quote:'Gaïa 🌱'.repeat(20000)})+'\n');
  assert.deepEqual(result.stdout,expected);assert.deepEqual(result.stderr,expected);
});

test('declared seed uses the real native launch flags and rejects malformed uint32 states',()=>{
  const initial_seed='1651011033:1377505029:3019448108:3247278135';
  const seeded=install(()=>0,{initial_seed});
  assert.deepEqual(Array.from(seeded.argv.slice(-3)),['--quickstart','--quickstart-seed',initial_seed]);
  assert.ok(!install(()=>0).argv.includes('--quickstart'));
  for(const value of [null,1,'1:2:3','1:2:3:4294967296','1:2:3:-1','1:2:3:01','1:2:3:4 --quiet']) {
    assert.throws(()=>install(()=>0,{initial_seed:value}),/canonical uint32 state/);
  }
});
