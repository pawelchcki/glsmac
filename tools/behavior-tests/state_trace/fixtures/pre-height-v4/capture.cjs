const fs = require('node:fs');
const path = require('node:path');
const request = JSON.parse(fs.readFileSync(0,'utf8'));
const snapshot = JSON.parse(fs.readFileSync(request.snapshot,'utf8'));
const memories = [];
const OriginalMemory = WebAssembly.Memory;
WebAssembly.Memory = new Proxy(OriginalMemory,{construct(target,args){const memory=Reflect.construct(target,args); memories.push(memory); return memory;}});
const captured = {};
let captureError = null;
function valid(bytes,kind){
 let cursor=0,records=[];
 while(cursor<bytes.length){if(cursor+6>bytes.length)return false;const type=bytes[cursor],size=bytes.readUInt32LE(cursor+1);if(type<1||type>4||size>1048576||cursor+6+size>bytes.length)return false;
 if((type===1&&size!==1)||(type===2&&size!==8)||(type===3&&size!==4))return false;
 let checksum=0;for(let i=0;i<size;i++)checksum^=bytes[cursor+5+i];if(checksum!==bytes[cursor+5+size])return false;
 records.push({type,data:bytes.subarray(cursor+5,cursor+5+size)});cursor+=6+size;}
 if(kind==='map'){if(records.length<3||records[0].type!==2||records[1].type!==2)return false;const w=Number(records[0].data.readBigInt64LE()),h=Number(records[1].data.readBigInt64LE());return w===4&&h===4&&records.length===w*h/2+3&&records.slice(2,-1).every(r=>r.type===4)&&records.at(-1).type===1;}
 return records.length>=5&&records.some(r=>r.type===4&&r.data.includes(Buffer.from('unit-work-v1')));
}
const originalLog = console.log.bind(console);
console.log = (...args) => {
 const text = args.join(' '); const match = /BINARY_CAPTURE_READY\|(map|graph)\s*$/.exec(text);
 if(match){
  const kind=match[1]; const prefix=Buffer.from(`CAPTURE_BYTES_${kind}_e75a1cb3|`); const suffix=Buffer.from(`|CAPTURE_END_${kind}_e75a1cb3`);
  let found=null;
  for(const memory of memories){
   const heap=Buffer.from(memory.buffer); let offset=heap.indexOf(prefix);
   while(offset>=0){const start=offset+prefix.length,end=heap.indexOf(suffix,start);
    if(end>start && end-start<1048576){const bytes=Buffer.from(heap.subarray(start,end));if(valid(bytes,kind)){if(found&&!found.equals(bytes))throw Error('Conflicting live native capture copies');found=bytes;}}
    offset=heap.indexOf(prefix,offset+1);
   }
  }
  if(!found){captureError=`No complete live native ${kind} capture`; originalLog(captureError);}
  else{fs.writeFileSync(`${request.output}/${kind}.bin`,found);captured[kind]=found.length;}
 }
};
const observeOutput = console.log; console.log = originalLog;
const originalWriteSync = fs.writeSync;
fs.writeSync = (fd,data,...rest) => { if(fd === 1) observeOutput(typeof data === 'string' ? data : Buffer.from(data).toString('utf8')); return originalWriteSync(fd,data,...rest); };
process.argv=[process.execPath,request.runtime,'--gse-tests','--gse-tests-script','./GLSMAC_data/tests/legacy_terraform_capture.gls.js','--quiet','--prefix','/tmp/terraform-legacy-capture'];
const engine=require(path.resolve(request.runtime));
engine.onRuntimeInitialized=()=>{
 const root='/behavior-snapshot';
 for(const [filename,source] of Object.entries(snapshot)){const dest=`${root}/${filename}`;engine.FS.mkdirTree(path.posix.dirname(dest));engine.FS.writeFile(dest,source);}
 engine.FS.chdir(root);
};
process.on('exit',()=>{if(captureError||!captured.map||!captured.graph){process.exitCode=1;}else fs.writeFileSync(`${request.output}/capture.json`,JSON.stringify(captured,null,2));});
