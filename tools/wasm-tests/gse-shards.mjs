import {currentPackage} from '../scripts/build.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {accessSync,constants,lstatSync,readFileSync,readdirSync,realpathSync,mkdirSync,writeFileSync} from 'node:fs';
import {delimiter,dirname,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

export const hash = value => createHash('sha256').update(value).digest('hex');
export const entrypoint = /^GLSMAC_data\/tests\/[^_/][^/]*\.gls\.js$/;
export const censusTestName = 'Unit body census production binding validates calls and copies real cached native instances';
const nativeOutputLimit = 10 * 1024 * 1024; // Same retained per-stream worker bound.
export const nativeFontPath='resource/font/terminus/TerminusTTF-4.49.3-minified.ttf';
const fontIdentity=Object.freeze({path:nativeFontPath,kind:'binary.base64.v1',bytes:55700,
  sha256:'16709dd4c96ff4e1a1b032175a7fefa18c3199ea95f691a5f6968321a0bfe2e0',
  git_blob_sha1:'e59b6658e2d90002ef82a3bc99ffa617c8b4f334'});

export function nativeResourceBytes(snapshot) {
  const descriptor=snapshot[nativeFontPath];
  assert.ok(descriptor && typeof descriptor==='object' && !Array.isArray(descriptor),'Tracked native font descriptor required');
  assert.deepEqual(Object.keys(descriptor).sort(),['kind','base64','bytes','sha256','git_blob_sha1'].sort());
  for(const key of ['kind','bytes','sha256','git_blob_sha1'])assert.equal(descriptor[key],fontIdentity[key],'Different native font identity');
  assert.equal(typeof descriptor.base64,'string');
  assert.equal(descriptor.base64.length,Math.ceil(fontIdentity.bytes/3)*4,'Bounded native font encoding required');
  const bytes=Buffer.from(descriptor.base64,'base64');
  assert.equal(bytes.toString('base64'),descriptor.base64,'Canonical base64 required');
  assert.equal(bytes.length,fontIdentity.bytes);assert.equal(hash(bytes),fontIdentity.sha256);
  assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),fontIdentity.git_blob_sha1);
  return bytes;
}

export function nativeResources(snapshot) {
  nativeResourceBytes(snapshot);
  return [{...fontIdentity}];
}

function trackedFont(root) {
  let current=resolve(root);
  for(const part of nativeFontPath.split('/')) {
    current=resolve(current,part);const info=lstatSync(current);
    assert.ok(!info.isSymbolicLink(),'Symlinked native font path unsupported');
    assert.ok(current.endsWith('.ttf')?info.isFile():info.isDirectory(),'Regular tracked native font path required');
    if(current.endsWith('.ttf'))assert.equal(info.size,fontIdentity.bytes,'Bounded public native font file required');
  }
  const bytes=readFileSync(current);
  const descriptor={kind:fontIdentity.kind,base64:bytes.toString('base64'),bytes:bytes.length,
    sha256:hash(bytes),git_blob_sha1:createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')};
  nativeResourceBytes({[nativeFontPath]:descriptor});
  // Resolve Git once to an executable canonical path; never launch a bare PATH
  // command. Fixed expected font hashes additionally constrain its output.
  const git=(process.env.PATH||'').split(delimiter).map(dir=>resolve(dir,'git')).find(file=>{
    try {accessSync(file,constants.X_OK);return lstatSync(realpathSync(file)).isFile();}catch{return false;}
  });
  assert.ok(git,'Git executable required to bind native resource to HEAD');
  const executable=realpathSync(git),options={cwd:root,timeout:10000,maxBuffer:1024*1024};
  const entry=execFileSync(executable,['ls-tree','-z','HEAD','--',nativeFontPath],options);
  assert.equal(entry.toString('utf8'),`100644 blob ${fontIdentity.git_blob_sha1}\t${nativeFontPath}\0`,'Tracked HEAD native font identity differs');
  const blob=execFileSync(executable,['cat-file','blob',fontIdentity.git_blob_sha1],options);
  assert.ok(blob.equals(bytes),'Native font bytes differ from HEAD');
  return descriptor;
}

// A protocol parser, not a substitute for executing the compiled native test.
// Both the partition producer and independent artifact aggregate use this.
export function nativeCensusEvidence(observed,expectedResources) {
  assert.deepEqual(expectedResources,[fontIdentity],'Expected tracked resource identity required');
  assert.equal(observed.close_observed,true,'Actual worker close must be observed');
  assert.equal(observed.error,null,'Worker errors cannot earn native credit');
  assert.equal(observed.status,0,'Actual worker OS exit zero required');
  assert.equal(observed.signal,null,'Signalled workers cannot earn native credit');
  for(const stream of ['stdout','stderr']) {
    assert.equal(typeof observed[stream],'string','Retained decoded worker output required');
    assert.ok(Buffer.byteLength(observed[stream],'utf8')<=nativeOutputLimit,'Native output bound');
    assert.doesNotMatch(observed[stream],/TEST FAILED|Testing complete, passed:|UNIT_BODY_CENSUS_CLEANUP_ERROR/,
      'Native failure or retirement failure in worker output');
  }
  assert.doesNotMatch(observed.stderr,/Unhandled exception|Uncaught|Assertion failed|Aborted\(|RuntimeError:|std::bad_alloc|(?:worker|Pthread[^\n]*) sent an error!|\[Error\]|(?:^|\n)(?:[A-Za-z]+)?Error:/i,
    'Native/Node errors in stderr');
  const lines=observed.stdout.split(/\r?\n/);
  const starts=[],markers=[],footers=[],resources=[];
  for(const [index,line] of lines.entries()) {
    if(line===`  ${censusTestName}...`)starts.push(index);
    if(line.startsWith('UNIT_BODY_CENSUS_NATIVE|'))markers.push(index);
    if(line==='All tests passed.')footers.push(index);
    if(line.startsWith('GSE_NATIVE_RESOURCES|'))resources.push(index);
  }
  assert.equal(starts.length,1,'Exactly one registered Census native test required');
  assert.equal(markers.length,1,'Exactly one anchored post-retirement Census marker required');
  assert.equal(footers.length,1,'Exactly one full native success footer required');
  assert.equal(resources.length,1,'Exactly one mounted native resource record required');
  const start=starts[0],marker=markers[0],footer=footers[0];
  const first=lines.findIndex(line=>/^ {2}\S.*\.\.\.$/.test(line));
  assert.ok(resources[0]<first,'Native resource verification must precede the first registered native test');
  const resourceRecord=JSON.parse(lines[resources[0]].slice('GSE_NATIVE_RESOURCES|'.length));
  assert.deepEqual(resourceRecord,{version:1,resources:expectedResources},'Mounted native resource differs from source snapshot');
  assert.ok(lines.slice(footer+1).every(line=>line===''),'Native footer must be terminal');
  // GSETests::Iterate prints each registered test as exactly two spaces + name
  // + ellipsis. A later script/test cannot supply this native test's marker.
  const next=lines.findIndex((line,index)=>index>start && /^ {2}\S.*\.\.\.$/.test(line));
  assert.ok(start<marker && marker<footer && (next<0 || marker<next),
    'Census marker must be inside its actual registered test interval');
  const facts=JSON.parse(lines[marker].slice('UNIT_BODY_CENSUS_NATIVE|'.length));
  const expected={binding_calls:19,invalid_calls:11,complete_copies:5,owners:2,units:3,
    synthetic_texture_inputs:true,normal_startup:false,gpu_pixels:false};
  assert.ok(facts && typeof facts==='object' && !Array.isArray(facts),'Native marker Object required');
  assert.deepEqual(Object.keys(facts).sort(),[...Object.keys(expected),'checks_including_retirement'].sort(),
    'Exact native Census marker schema required');
  for(const [key,value] of Object.entries(expected))assert.equal(facts[key],value,`Native Census ${key}`);
  assert.ok(Number.isSafeInteger(facts.checks_including_retirement) && facts.checks_including_retirement>0,
    'Actual retirement-inclusive assertion count required');
  return {test_name:censusTestName,marker:facts,test_header_line:start,marker_line:marker,
    next_test_header_line:next<0?null:next,native_footer_line:footer,
    stdout_sha256:hash(observed.stdout),stderr_sha256:hash(observed.stderr),
    resources:resourceRecord.resources,resource_record_line:resources[0],
    scope:'synthetic native binding/resource/retirement fixture; not normal startup, GPU or gameplay'};
}

// Main55e's third partition exhausted its existing20-minute deadline while
// the fourth completed in596s. Move these three measured heavy scripts to4
// (163s+105s+102s); keep the same four workers, bounds and complete inventory.
const fourWayHeavy = new Set([
  'GLSMAC_data/tests/unit_disband_controls.gls.js',
  'GLSMAC_data/tests/terraform_automation.gls.js',
  'GLSMAC_data/tests/terraforming_controls_all.gls.js',
]);

export function snapshotAt(root) {
  const snapshot=Object.fromEntries(['default', 'tests'].flatMap(kind =>
    readdirSync(`${root}/GLSMAC_data/${kind}`, {recursive:true})
      .filter(name=>name.endsWith('.gls.js')).sort()
      .map(name=>[`GLSMAC_data/${kind}/${name}`,readFileSync(`${root}/GLSMAC_data/${kind}/${name}`,'utf8')])));
  snapshot[nativeFontPath]=trackedFont(root);
  Object.assign(snapshot,currentPackage(root));
  return snapshot;
}

export function plan(snapshot, index=1, count=1) {
  nativeResources(snapshot);
  const all = Object.keys(snapshot).filter(name=>entrypoint.test(name)).sort();
  assert.ok(all.length,'Actual test entrypoints must be discovered');
  assert.ok(Number.isSafeInteger(index) && Number.isSafeInteger(count) &&
    count>=1 && count<=all.length && index>=1 && index<=count,'Invalid GSE partition');
  const selected = all.filter((name,position)=>
    (count===4 && fourWayHeavy.has(name) ? 4 : position%count+1)===index);
  const chosen = new Set(selected);
  // Production scripts, every underscore helper and nested support file remain.
  // Only other top-level test entrypoints leave the directory scanned by C++.
  const mounted = Object.fromEntries(Object.entries(snapshot)
    .filter(([name])=>!entrypoint.test(name)||chosen.has(name)));
  return {all,selected,mounted,source_sha256:hash(JSON.stringify(snapshot)),index,count};
}

export function combine(reports, snapshot, count) {
  const expected = plan(snapshot,1,count);
  assert.equal(reports.length,count,'Every GSE partition report is required');
  const seen = new Set(); let runtime; const visited=[],nativeCensus=[];
  for(const report of reports) {
    assert.equal(report.version,2,'Census-aware GSE report format required');
    assert.equal(report.completed,true,'A timed-out or failed run cannot satisfy coverage');
    assert.equal(report.native_engine_tests,true,'Native C++ engine tests must execute');
    assert.equal(report.source_sha256,expected.source_sha256,'Current complete source snapshot');
    assert.equal(report.partition.count,count,'Consistent partition count');
    const index=report.partition.index;
    assert.ok(!seen.has(index),'Duplicate GSE partition');seen.add(index);
    const partition=plan(snapshot,index,count);
    const census=nativeCensusEvidence(report.native_result,nativeResources(snapshot));
    assert.deepEqual(report.native_census,census,'Retained output must reproduce Census evidence');
    nativeCensus.push({partition:index,evidence:census});
    assert.deepEqual(report.scripts,partition.selected,'Every planned entrypoint executed exactly once');
    const hashes=report.runtime_sha256;
    assert.deepEqual(Object.keys(hashes).sort(),['GLSMAC.js','GLSMAC.wasm']);
    for(const digest of Object.values(hashes))assert.match(digest,/^[0-9a-f]{64}$/);
    if(runtime)assert.deepEqual(hashes,runtime,'One immutable test-engine artifact');
    else runtime=hashes;
    visited.push(...report.scripts);
  }
  assert.deepEqual(visited.sort(),expected.all,'Complete current script coverage without duplicates');
  return {version:2,completed:true,source_sha256:expected.source_sha256,
    runtime_sha256:runtime,partitions:count,scripts:expected.all,native_engine_tests:true,
    native_census:{scope:'Repeated same synthetic native fixture, not distinct gameplay cases',
      partitions:nativeCensus.sort((a,b)=>a.partition-b.partition)}};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {values}=parseArgs({options:{reports:{type:'string'},count:{type:'string'},
    output:{type:'string'},source:{type:'string'}}});
  assert.ok(values.reports && values.output,'Reports and output paths are required');
  const directory=resolve(values.reports);
  const files=readdirSync(directory,{recursive:true}).filter(name=>/^gse-\d+\.json$/.test(name.split('/').at(-1)));
  const reports=files.map(name=>JSON.parse(readFileSync(`${directory}/${name}`,'utf8')));
  const root=values.source||process.env.WASM_SCRIPTS_ROOT||fileURLToPath(new URL('../../',import.meta.url));
  const result=combine(reports,snapshotAt(root),Number(values.count));
  mkdirSync(dirname(values.output),{recursive:true});
  writeFileSync(values.output,JSON.stringify(result,null,2)+'\n');
  console.log(`All ${result.scripts.length} current GSE scripts covered exactly once; native C++ tests passed in every partition.`);
}
