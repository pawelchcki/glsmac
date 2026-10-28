import assert from 'node:assert/strict';
import test from 'node:test';
import {censusTestName,combine,nativeCensusEvidence as parseNativeCensusEvidence,nativeFontPath,nativeResourceBytes,nativeResources,plan,snapshotAt} from './gse-shards.mjs';
import {fileURLToPath} from 'node:url';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {matchesGlob} from 'node:path';

const fontBytes=readFileSync(new URL('../../resource/font/terminus/TerminusTTF-4.49.3-minified.ttf',import.meta.url));
const fontDescriptor={kind:'binary.base64.v1',base64:fontBytes.toString('base64'),bytes:55700,
  sha256:'16709dd4c96ff4e1a1b032175a7fefa18c3199ea95f691a5f6968321a0bfe2e0',
  git_blob_sha1:'e59b6658e2d90002ef82a3bc99ffa617c8b4f334'};
const source={[nativeFontPath]:fontDescriptor,'GLSMAC_data/default/main.gls.js':'production',
  'GLSMAC_data/tests/_behavior.gls.js':'helper',
  'GLSMAC_data/tests/nested/input.gls.js':'support',
  ...Object.fromEntries(['a','b','c','d','e'].map(n=>[`GLSMAC_data/tests/${n}.gls.js`,n]))};
const runtime={'GLSMAC.js':'a'.repeat(64),'GLSMAC.wasm':'b'.repeat(64)};
// Synthetic protocol inputs only: these strings never prove native execution.
const nativeFacts=()=>({binding_calls:19,invalid_calls:11,complete_copies:5,owners:2,units:3,
  checks_including_retirement:123,synthetic_texture_inputs:true,normal_startup:false,gpu_pixels:false});
const resourceLine=()=>`GSE_NATIVE_RESOURCES|${JSON.stringify({version:1,resources:nativeResources(source)})}`;
const nativeCensusEvidence=(observed,resources=nativeResources(source))=>parseNativeCensusEvidence(observed,resources);
const nativeOutput=()=>({close_observed:true,status:0,signal:null,error:null,stderr:'',
  stdout:`${resourceLine()}\n  test if tests work...\n  ${censusTestName}...\nUNIT_BODY_CENSUS_NATIVE|${JSON.stringify(nativeFacts())}\n  Another registered test...\nAll tests passed.\n`});
const nativeReport=()=>{const observed=nativeOutput();return {native_result:observed,native_census:nativeCensusEvidence(observed)};};
const fixture=()=>[1,2].map(index=>({version:2,completed:true,native_engine_tests:true,...nativeReport(),
  partition:{index,count:2},source_sha256:plan(source).source_sha256,
  runtime_sha256:{...runtime},scripts:plan(source,index,2).selected}));

test('partition coverage retains production/helpers and executes every entrypoint once',()=>{
  const parts=[plan(source,1,2),plan(source,2,2)];
  assert.deepEqual(parts.flatMap(p=>p.selected).sort(),plan(source).all);
  for(const part of parts)for(const name of ['GLSMAC_data/default/main.gls.js',
    'GLSMAC_data/tests/_behavior.gls.js','GLSMAC_data/tests/nested/input.gls.js'])assert.equal(part.mounted[name],source[name]);
  assert.equal(combine(fixture(),source,2).scripts.length,5);
});

test('a missing, duplicate or failed partition cannot become a passing aggregate',()=>{
  const reports=fixture();
  assert.throws(()=>combine(reports.slice(0,1),source,2));
  assert.throws(()=>combine([reports[0],reports[0]],source,2));
  for(const field of ['completed','native_engine_tests']) {
    const changed=structuredClone(reports);changed[0][field]=false;
    assert.throws(()=>combine(changed,source,2));
  }
});

test('omitted, duplicate and incorrectly assigned test entrypoints fail coverage',()=>{
  for(const change of [r=>r[0].scripts.pop(),r=>r[0].scripts.push(r[0].scripts[0]),
    r=>r[0].scripts.push(r[1].scripts[0])]) {
    const reports=fixture();change(reports);assert.throws(()=>combine(reports,source,2));
  }
});

test('stale source or mixed engine artifacts fail even when all tests report success',()=>{
  const stale=fixture();stale[0].source_sha256='0'.repeat(64);
  assert.throws(()=>combine(stale,source,2));
  const mixed=fixture();mixed[0].runtime_sha256['GLSMAC.wasm']='c'.repeat(64);
  assert.throws(()=>combine(mixed,source,2));
  assert.throws(()=>combine(fixture(),{...source,'GLSMAC_data/tests/new.gls.js':'new'},2));
});

test('invalid or empty partition plans are rejected before launching an engine',()=>{
  for(const args of [[0,2],[1,0],[3,2],[1,6],[1.5,2]])assert.throws(()=>plan(source,...args));
  assert.throws(()=>plan({[nativeFontPath]:fontDescriptor,'GLSMAC_data/default/main.gls.js':'no tests'}));
});

test('four-way resource profile keeps every actual script and helper exactly once',()=>{
  const actual=snapshotAt(fileURLToPath(new URL('../../',import.meta.url)));
  const all=plan(actual).all,parts=[1,2,3,4].map(index=>plan(actual,index,4));
  assert.deepEqual(parts.flatMap(part=>part.selected).sort(),all);
  assert.equal(new Set(parts.flatMap(part=>part.selected)).size,all.length);
  for(const name of ['unit_disband_controls','terraform_automation','terraforming_controls_all']){
    const path=`GLSMAC_data/tests/${name}.gls.js`;
    assert.ok(parts[3].selected.includes(path));
    assert.ok(parts.slice(0,3).every(part=>!part.selected.includes(path)));
  }
  for(const part of parts)for(const [name,value] of Object.entries(actual)){
    if(!/^GLSMAC_data\/tests\/[^_/][^/]*\.gls\.js$/.test(name))assert.equal(part.mounted[name],value);
  }
  const reports=parts.map(part=>({version:2,completed:true,native_engine_tests:true,...nativeReport(),
    partition:{index:part.index,count:4},source_sha256:part.source_sha256,
    runtime_sha256:{...runtime},scripts:part.selected}));
  assert.deepEqual(combine(reports,actual,4).scripts,all);
  const misplaced=structuredClone(reports),heavy='GLSMAC_data/tests/unit_disband_controls.gls.js';
  misplaced[3].scripts=misplaced[3].scripts.filter(name=>name!==heavy);misplaced[2].scripts.push(heavy);
  assert.throws(()=>combine(misplaced,actual,4));
  const missingBuiltin=structuredClone(reports);missingBuiltin[3].native_engine_tests=false;
  assert.throws(()=>combine(missingBuiltin,actual,4));
});

test('direct serial and non-four-way plans retain their original distribution',()=>{
  const actual=snapshotAt(fileURLToPath(new URL('../../',import.meta.url))),all=plan(actual).all;
  for(const count of [1,2,3,5])for(let index=1;index<=count;index++)
    assert.deepEqual(plan(actual,index,count).selected,all.filter((_,position)=>position%count===index-1));
});


test('complete GSE PR path filters include actual collection implementation and regression files',()=>{
  const workflow=readFileSync(new URL('../../.github/workflows/wasm.yml',import.meta.url),'utf8');
  const section=workflow.match(/^  pull_request:\n([\s\S]*?)(?=^permissions:)/m);assert.ok(section);
  const patterns=[...section[1].matchAll(/^      - '([^']+)'$/gm)].map(m=>m[1]);
  const selected=path=>patterns.some(pattern=>matchesGlob(path,pattern));
  for(const path of ['src/gc/Space.cpp','src/gc/GC.cpp','src/gse/tests/GSE.cpp',
    'src/common/Mutex.cpp','src/common/Mutex.h','tools/wasm-tests/gse-shards.mjs',
    'tools/wasm-tests/gse-full-worker.cjs','.github/workflows/wasm.yml'])assert.ok(selected(path),path);
  // Direct Census inputs and demonstrated headless prerequisites select the real workflow.
  for(const path of ["src/GLSMAC.cpp", "src/game/frontend/Game.h", "src/game/frontend/unit/BadgeDefs.h", "src/game/frontend/sprite/Sprite.h", "src/scene/actor/Actor.h", "src/game/frontend/unit/Unit.cpp", "src/game/frontend/unit/UnitDef.h", "src/game/frontend/unit/UnitManager.h", "src/game/frontend/unit/SlotBadges.cpp", "src/game/frontend/Slot.cpp", "src/game/frontend/sprite/InstancedSprite.h", "src/game/frontend/sprite/InstancedSpriteManager.cpp", "src/scene/actor/Instanced.cpp", "src/scene/actor/Sprite.h", "src/types/texture/Texture.cpp", "src/game/backend/Game.cpp", "src/game/backend/Random.cpp", "src/graphics/Null.h", "src/main.cpp", "src/ui/UI.cpp", "src/ui/geometry/Geometry.cpp", "resource/font/terminus/TerminusTTF-4.49.3-minified.ttf"])assert.ok(selected(path),path);
  for(const path of ["docs/notes.md", "src/common/Unrelated.cpp", "tools/wasm-tests/unrelated.mjs", "resource/font/other-font.ttf", "src/game/backend/diplomacy/Unrelated.cpp", "src/scene/actor/Light.cpp"])
    assert.equal(selected(path),false,path);
});

test('native Census protocol requires its own registered block and post-retirement facts',()=>{
  const observed=nativeOutput(),evidence=nativeCensusEvidence(observed);
  assert.deepEqual(evidence.marker,nativeFacts());
  assert.ok(evidence.test_header_line<evidence.marker_line);
  assert.ok(evidence.marker_line<evidence.next_test_header_line);
  assert.ok(evidence.next_test_header_line<evidence.native_footer_line);
  const combined=combine(fixture(),source,2);
  assert.equal(combined.native_census.partitions.length,2);
  assert.match(combined.native_census.scope,/Repeated same synthetic/);
});

test('missing duplicate or unanchored native records cannot supply Census evidence',()=>{
  const original=nativeOutput(),header=`  ${censusTestName}...`,marker=`UNIT_BODY_CENSUS_NATIVE|${JSON.stringify(nativeFacts())}`;
  for(const record of [header,marker,'All tests passed.']) {
    for(const change of [text=>text.replace(record,''),text=>text.replace(record,`${record}\n${record}`),
      text=>text.replace(record,`source echo: ${record}`)]) {
      const observed={...original,stdout:change(original.stdout)};
      assert.throws(()=>nativeCensusEvidence(observed),record);
    }
  }
});

test('a marker emitted by a later test or script is not the Census test result',()=>{
  const marker=`UNIT_BODY_CENSUS_NATIVE|${JSON.stringify(nativeFacts())}`;
  for(const body of [
    `${marker}\n  ${censusTestName}...\nAll tests passed.\n`,
    `  ${censusTestName}...\n  Another native test...\n${marker}\nAll tests passed.\n`,
    `  ${censusTestName}...\n  testing ./GLSMAC_data/tests/example.gls.js...\n${marker}\nAll tests passed.\n`,
    `  ${censusTestName}...\nAll tests passed.\n${marker}\n`,
  ])assert.throws(()=>nativeCensusEvidence({...nativeOutput(),stdout:resourceLine()+'\n'+body}));
});

test('Census marker schema counts native types and declared limitations stay strict',()=>{
  for(const [key,value] of [
    ['binding_calls',18],['invalid_calls',10],['complete_copies',4],['owners',7],['units',9],
    ['binding_calls','19'],['owners',true],['checks_including_retirement',0],
    ['checks_including_retirement',true],['checks_including_retirement',1.5],
    ['checks_including_retirement',Number.MAX_SAFE_INTEGER+1],
    ['normal_startup',true],['gpu_pixels',true],['synthetic_texture_inputs',false],
  ]) {
    const facts={...nativeFacts(),[key]:value};
    assert.throws(()=>nativeCensusEvidence({...nativeOutput(),
      stdout:nativeOutput().stdout.replace(JSON.stringify(nativeFacts()),JSON.stringify(facts))}),key);
  }
  for(const value of [null,[],{}, {...nativeFacts(),extra:true},
    Object.fromEntries(Object.entries(nativeFacts()).filter(([key])=>key!=='checks_including_retirement'))]) {
    assert.throws(()=>nativeCensusEvidence({...nativeOutput(),
      stdout:nativeOutput().stdout.replace(JSON.stringify(nativeFacts()),JSON.stringify(value))}));
  }
  assert.throws(()=>nativeCensusEvidence({...nativeOutput(),
    stdout:nativeOutput().stdout.replace(JSON.stringify(nativeFacts()),'{invalid JSON')}));
});

test('native text cannot replace actual worker close exit and error evidence',()=>{
  for(const delta of [{close_observed:false},{close_observed:undefined},{status:1},{status:null},
    {status:true},{status:'0'},{signal:'SIGTERM'},{error:{}},{error:'spawn failed status0'}]) {
    assert.throws(()=>nativeCensusEvidence({...nativeOutput(),...delta}));
  }
  for(const stream of ['stdout','stderr'])for(const failure of [
    'TEST FAILED','Testing complete, passed: 1, failed: 1','UNIT_BODY_CENSUS_CLEANUP_ERROR|retirement',
  ])assert.throws(()=>nativeCensusEvidence({...nativeOutput(),[stream]:nativeOutput()[stream]+failure}));
  for(const stderr of ['RuntimeError: native abort','[Error] copy failure','Error: node failed',
    'TypeError: bad input','Pthread 2 sent an error!']) {
    assert.throws(()=>nativeCensusEvidence({...nativeOutput(),stderr}));
  }
  assert.throws(()=>nativeCensusEvidence({...nativeOutput(),stderr:'x'.repeat(10*1024*1024+1)}));
});

test('aggregate reparses every retained native output instead of trusting case flags',()=>{
  for(const change of [report=>{report.version=1;},report=>{delete report.native_result;},
    report=>{delete report.native_census;},report=>{report.native_result.status=3;},
    report=>{report.native_result.stdout=report.native_result.stdout.replace('UNIT_BODY_CENSUS_NATIVE|','omitted|');},
    report=>{report.native_result.stdout+='benign but different retained text\n';},
    report=>{report.native_census.marker.binding_calls=20;},
    report=>{report.native_census.stdout_sha256='0'.repeat(64);},
    report=>{report.native_result.close_observed=false;}]) {
    const reports=fixture();change(reports[1]);
    assert.throws(()=>combine(reports,source,2));
  }
});

test('native footer is terminal; a valid earlier footer cannot hide later stdout',()=>{
  assert.throws(()=>nativeCensusEvidence({...nativeOutput(),stdout:nativeOutput().stdout+'late observation\n'}));
});

test('fixed public font descriptor rejects missing tampered or noncanonical resources',()=>{
  assert.equal(nativeResourceBytes(source).length,55700);
  assert.ok(nativeResourceBytes(source).equals(fontBytes));
  const absent={...source};delete absent[nativeFontPath];assert.throws(()=>nativeResources(absent));
  for(const change of [d=>{d.bytes++;},d=>{d.sha256='0'.repeat(64);},d=>{d.git_blob_sha1='0'.repeat(40);},
    d=>{d.kind='unknown';},d=>{d.base64+='\n';},d=>{d.base64='';},d=>{d.path='/private/font.ttf';},
    d=>{const bytes=Buffer.from(d.base64,'base64');bytes[0]^=1;d.base64=bytes.toString('base64');}]) {
    const descriptor={...fontDescriptor};change(descriptor);
    assert.throws(()=>nativeResources({...source,[nativeFontPath]:descriptor}));
  }
});

function temporaryFontSource(action,{wrongHead=false}={}) {
  const root=mkdtempSync(`${tmpdir()}/census-font-protocol-`);
  try {
    for(const name of ['GLSMAC_data/default','GLSMAC_data/tests','resource/font/terminus'])mkdirSync(`${root}/${name}`,{recursive:true});
    writeFileSync(`${root}/GLSMAC_data/default/main.gls.js`,'// not executed');
    writeFileSync(`${root}/GLSMAC_data/tests/_behavior.gls.js`,'// not executed');
    writeFileSync(`${root}/${nativeFontPath}`,wrongHead?'not the font':fontBytes);
    const git=args=>execFileSync('git',args,{cwd:root,timeout:10000,stdio:['ignore','pipe','pipe']});
    git(['init','-q']);git(['add','.']);
    git(['-c','user.name=Protocol fixture','-c','user.email=fixture@example.invalid','commit','-qm','Public font input']);
    return action(root,git);
  } finally {rmSync(root,{recursive:true,force:true});}
}

test('snapshot binds regular public font bytes to actual HEAD even when index flags hide edits',()=>{
  temporaryFontSource(root=>{
    const snapshot=snapshotAt(root);assert.deepEqual(snapshot[nativeFontPath],fontDescriptor);
    assert.deepEqual(nativeResources(snapshot),nativeResources(source));
  });
  temporaryFontSource((root,git)=>{
    git(['update-index','--assume-unchanged',nativeFontPath]);
    const changed=Buffer.from(fontBytes);changed[0]^=1;writeFileSync(`${root}/${nativeFontPath}`,changed);
    assert.equal(git(['status','--porcelain']).toString(),'');
    assert.throws(()=>snapshotAt(root));
  });
  temporaryFontSource((root,git)=>{
    // Current bytes match the public resource but committed HEAD does not.
    git(['update-index','--assume-unchanged',nativeFontPath]);writeFileSync(`${root}/${nativeFontPath}`,fontBytes);
    assert.equal(git(['status','--porcelain']).toString(),'');
    assert.throws(()=>snapshotAt(root),/HEAD native font identity/);
  },{wrongHead:true});
  for(const mode of ['missing','symlink','directory','symlink-parent'])temporaryFontSource(root=>{
    const path=`${root}/${nativeFontPath}`;rmSync(path);
    if(mode==='symlink')symlinkSync(fileURLToPath(new URL('../../resource/font/terminus/TerminusTTF-4.49.3-minified.ttf',import.meta.url)),path);
    if(mode==='directory')mkdirSync(path);
    if(mode==='symlink-parent'){
      rmSync(`${root}/resource/font/terminus`,{recursive:true});
      symlinkSync(fileURLToPath(new URL('../../resource/font/terminus',import.meta.url)),`${root}/resource/font/terminus`);
    }
    assert.throws(()=>snapshotAt(root));
  });
});

test('real worker adapter mounts exact binary beside isolated scripts using fake FS only',async()=>{
  const {prepareSnapshot,mountSnapshot}=createRequire(import.meta.url)('./gse-full-worker.cjs');
  const prepared=await prepareSnapshot(source),entries=new Map(),output=[];let cwd='/';
  entries.set('/GLSMAC_data/tests/removed.gls.js',Buffer.from('stale embedded model'));
  const FS={mkdirTree:()=>{},writeFile:(path,value)=>entries.set(path,Buffer.from(value)),
    readFile:path=>new Uint8Array(entries.get(path)),chdir:path=>{cwd=path;},
    readdir:path=>['.','..',...new Set([...entries.keys()].filter(name=>name.startsWith(path+'/'))
      .map(name=>name.slice(path.length+1).split('/')[0]))]};
  mountSnapshot(FS,prepared,line=>output.push(line));
  assert.equal(cwd,'/full-gse-snapshot');
  assert.ok(entries.get(`${cwd}/${nativeFontPath}`).equals(fontBytes));
  assert.equal(entries.get(`${cwd}/GLSMAC_data/default/main.gls.js`).toString(),'production');
  assert.equal(entries.has(`${cwd}/GLSMAC_data/tests/removed.gls.js`),false);
  assert.deepEqual(JSON.parse(output[0].split('|')[1]),{version:1,resources:nativeResources(source)});
  assert.deepEqual(JSON.parse(output[1].split('|')[1]),plan(source).all);
  const emitted=[];
  assert.throws(()=>mountSnapshot({...FS,readFile:()=>new Uint8Array(55700)},prepared,line=>emitted.push(line)),/font bytes differ/);
  assert.deepEqual(emitted,[],'Unverified FS bytes cannot mint resource marker');
  for(const snapshot of [{...source,'../private':fontDescriptor},{...source,'resource/font/other.ttf':fontDescriptor},
    {...source,'GLSMAC_data/tests/a.gls.js':{}},Object.fromEntries(Object.entries(source).filter(([name])=>name!==nativeFontPath))]) {
    await assert.rejects(prepareSnapshot(snapshot));
  }
});

test('frozen production snapshots require the complete current JavaScript package',async()=>{
  const {prepareSnapshot}=createRequire(import.meta.url)('./gse-full-worker.cjs');
  const actual=snapshotAt(fileURLToPath(new URL('../../',import.meta.url)));
  await prepareSnapshot(actual);
  const javascript=Object.keys(actual).find(name=>name.startsWith('GLSMAC_data/standard-js/') && name.endsWith('.js'));
  assert.ok(javascript);
  await assert.rejects(prepareSnapshot({...actual,[javascript]:actual[javascript]+'\n// changed bytes'}),/Frozen JS artifact differs/);
  const missing={...actual};delete missing[javascript];
  await assert.rejects(prepareSnapshot(missing));
  const absent=Object.fromEntries(Object.entries(actual).filter(([name])=>!name.startsWith('GLSMAC_data/standard-js/')));
  await assert.rejects(prepareSnapshot(absent));
});

test('producer and aggregate require exactly the current verified mounted resource marker',()=>{
  const original=nativeOutput(),line=resourceLine();
  for(const stdout of [original.stdout.replace(line,''),original.stdout.replace(line,line+'\n'+line),
    original.stdout.replace(line,'echo '+line),original.stdout.replace(line,line.replace('55700','55701')),
    original.stdout.replace(line,'')+line+'\n']) {
    assert.throws(()=>nativeCensusEvidence({...original,stdout}));
  }
  assert.throws(()=>nativeCensusEvidence(original,[]));
  const reports=fixture();reports[0].native_census.resources[0].sha256='0'.repeat(64);
  assert.throws(()=>combine(reports,source,2));
});

test('native resource identity must precede the first registered native test',()=>{
  const original=nativeOutput(),line=resourceLine(),header='  test if tests work...\n';
  assert.deepEqual(nativeCensusEvidence(original).resources,nativeResources(source));
  // Keep every marker/count/exit/footer fact, but move the valid resource record
  // after the first real header and before Census. The old parser accepted it.
  const moved={...original,stdout:original.stdout.replace(line+'\n','').replace(header,header+line+'\n')};
  assert.throws(()=>nativeCensusEvidence(moved),/first registered native test/);
  const reports=fixture();reports[0].native_result=moved;
  assert.throws(()=>combine(reports,source,2),/first registered native test/);
});
