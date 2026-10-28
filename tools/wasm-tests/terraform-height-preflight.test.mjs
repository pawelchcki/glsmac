// Metadata-only tests: buffers below are synthetic protocol inputs, not a
// browser, native engine, installed-data result or substitute preflight record.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {declaredTerrain,rateOneSource} from './terraform-browser-inputs.mjs';
import {buildHeightPreflight,writeHeightPreflight,terrainOverrideTable,loadHeightPreflight,bindHeightRuntime,claimHeightCapture} from './terraform-height-preflight.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const data=()=>{
 const originalRules=Buffer.from('#TERRAIN\n'+Array.from({length:20},(_,i)=>`Land ${i},None,Sea ${i},Disable,12,Build,Help,R`).join('\n')+'\n#NEXT\n');
 return{source:{head:'a'.repeat(40),native_tree:'b'.repeat(40),default_tree:'c'.repeat(40),files:{executed_node_driver:'d'.repeat(64),'tools/wasm-tests/terraform-height-observation.mjs':'e'.repeat(64)},production_default_sha256:'f'.repeat(64)},
   runtimeJS:Buffer.from('not evaluated JS'),runtimeWasm:Buffer.from('not loaded WASM'),runtimeBuildBinding:{schema:'native-source-runtime.v1',compile_attribution_verified:false,provenance_sha256:'d'.repeat(64),source_head:'a'.repeat(40),native_tree:'b'.repeat(40),runtime:{'GLSMAC.js':hash(Buffer.from('not evaluated JS')),'GLSMAC.wasm':hash(Buffer.from('not loaded WASM'))},scope:'Declared native source/runtime consistency; compile attribution unverified; Default scripts separately captured'},originalRules,executedRules:rateOneSource(originalRules),map:declaredTerrain(),main:'source-main',world:'source-world',helpers:{sample:'source-helper'},seed:'declared seed'};
};

test('preflight derives actual input hashes map dimensions and both-domain duration rows',()=>{
 const input=data(),record=buildHeightPreflight(input);
 assert.deepEqual(record.runtime,{js:hash(input.runtimeJS),wasm:hash(input.runtimeWasm)});
 assert.equal(record.input_sha256.world,hash(input.world));assert.equal(record.input_sha256.map,hash(input.map));
 assert.deepEqual(record.declared_map,{width:16,height:16,tiles:128,bytes:8379});
 assert.equal(record.candidate_executed,false);assert.equal(record.override_table.length,20);
 assert.deepEqual(record.override_table[16].applies_to,['land','sea']);
 assert.equal(record.override_table[16].sea_prerequisite,'Disable');assert.equal(record.override_table[16].old,12);
 assert.equal(record.native_policy_observation,'not available before launch; require actual TH_INPUTS and every retained native world in the auditor');
 assert.equal(record.policy,undefined,'Preflight cannot invent observed native policy');
});

test('fresh-directory preparation persists exactly the required reproducible artifacts',()=>{
 const folder=mkdtempSync(join(tmpdir(),'height-preflight-'));
 try{
  const input=data(),record=buildHeightPreflight(input),digest=writeHeightPreflight({artifacts:folder,record,...input});
  assert.equal(hash(readFileSync(join(folder,'preflight.json'))),digest);
  assert.deepEqual(JSON.parse(readFileSync(join(folder,'preflight.json'))),record);
  assert.equal(readFileSync(join(folder,'fixture-main.gls.js'),'utf8'),input.main);
  assert.equal(readFileSync(join(folder,'fixture-world.gls.js'),'utf8'),input.world);
  assert.deepEqual(readFileSync(join(folder,'fixture-map.MP')),input.map);
  assert.equal(writeHeightPreflight({artifacts:folder,record,...input}),digest,'Identical preparatory record is consumed unchanged');
  const different=structuredClone(record);different.runtime.js='0'.repeat(64);
  assert.throws(()=>writeHeightPreflight({artifacts:folder,record:different,...input}),/Refusing to overwrite/);
  writeFileSync(join(folder,'fixture-world.gls.js'),'historical source');
  assert.throws(()=>writeHeightPreflight({artifacts:folder,record,...input}),/Refusing to overwrite/);
 }finally{rmSync(folder,{recursive:true,force:true});}
});

test('actual producer snapshot mismatch rejects before artifact preparation',()=>{
 const input=data(),record=buildHeightPreflight(input),folder=mkdtempSync(join(tmpdir(),'height-preflight-'));
 const report={runtime_build_binding:record.runtime_build_binding,host_head:record.head,native_source_tree:record.native_tree,default_tree:record.default_tree,runtime_js_sha256:record.runtime.js,runtime_wasm_sha256:record.runtime.wasm,
  observer_sha256:record.input_sha256.main,world_input_sha256:record.input_sha256.world,observer_helpers_sha256:record.input_sha256.helpers,production_default_sha256:record.production_default_sha256,
  seed_requested:input.seed,driver_sha256:record.source_sha256.executed_node_driver,height_observation_sha256:record.source_sha256['tools/wasm-tests/terraform-height-observation.mjs'],shared_helpers_sha256:{},
  source_override:{original_sha256:record.original_rules_sha256,rate_one_sha256:record.executed_rules_sha256}};
 try{
  assert.doesNotThrow(()=>writeHeightPreflight({artifacts:folder,record,...input,report}));
  report.runtime_wasm_sha256='0'.repeat(64);assert.throws(()=>writeHeightPreflight({artifacts:folder,record,...input,report}),/capture snapshot/);
 }finally{rmSync(folder,{recursive:true,force:true});}
});

test('preflight refuses non-duration rule changes instead of fabricating provenance',()=>{
 const input=data();const changed=Buffer.from(input.executedRules.toString().replace('Sea 16','invented sea name'));
 assert.throws(()=>terrainOverrideTable(input.originalRules,changed));
 const malformed=data();malformed.map=Buffer.from(malformed.map);malformed.map[0]=0;
 assert.throws(()=>buildHeightPreflight(malformed));
});

function cleanGitInputs(){
 const folder=mkdtempSync(join(tmpdir(),'height-clean-source-')),scriptsRoot=join(folder,'source'),build=join(folder,'runtime'),assets=join(folder,'assets');
 const input=data(),repository=fileURLToPath(new URL('../../',import.meta.url));
 mkdirSync(scriptsRoot,{recursive:true});mkdirSync(build);mkdirSync(assets);
 const sourceFiles=['tools/wasm_assets.py','tools/serve-wasm.py','tools/wasm-tests/terraform-height-preflight.mjs','tools/wasm-tests/terraform-height-browser.test.mjs','tools/wasm-tests/terraform-height-observation.mjs','tools/wasm-tests/terraform-browser-inputs.mjs',
  'tools/wasm-tests/fixtures/terraform-height-main.gls.js','tools/wasm-tests/fixtures/terraform-controls-main.gls.js','tools/wasm-tests/fixtures/terraform-controls-world.gls.js',
  'tools/wasm-tests/browser-log-cursor.mjs','tools/wasm-tests/browser-native-log-hook.mjs','tools/wasm-tests/runtime-fetch-barrier.mjs',
  'tools/wasm-tests/terraform-browser-geometry.mjs','tools/wasm-tests/terraform-browser-pointer.mjs',
  'GLSMAC_data/tests/_state_trace_observer.gls.js','GLSMAC_data/tests/_terrain_trace_observer.gls.js','GLSMAC_data/tests/_terraform_cooperation_observer.gls.js'];
 for(const name of sourceFiles){const target=join(scriptsRoot,name);mkdirSync(dirname(target),{recursive:true});copyFileSync(join(repository,name),target);}
 for(const[name,bytes]of [['src/model.cpp','// metadata-only source'],['GLSMAC_data/default/main.gls.js','// not evaluated'],['README.md','unrelated source note']]){
  const target=join(scriptsRoot,name);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);
 }
 writeFileSync(join(build,'GLSMAC.js'),input.runtimeJS);writeFileSync(join(build,'GLSMAC.wasm'),input.runtimeWasm);writeFileSync(join(assets,'alphax.txt'),input.originalRules);
 const git=(...args)=>execFileSync('git',args,{cwd:scriptsRoot,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 git('init','-q');git('add','.');git('-c','user.name=Protocol test','-c','user.email=protocol@example.invalid','-c','commit.gpgsign=false','commit','-qm','metadata fixture');
 writeFileSync(join(build,'provenance.json'),JSON.stringify({source_head:git('rev-parse','HEAD').trim(),source_tree:git('rev-parse','HEAD:src').trim(),runtime:{'GLSMAC.js':hash(input.runtimeJS),'GLSMAC.wasm':hash(input.runtimeWasm)}}));
 return{folder,scriptsRoot,build,assets,git,artifacts:join(folder,'output'),seed:'declared seed'};
}

test('future full producer rejects tracked staged and untracked consumed source before artifacts exist',()=>{
 for(const variant of ['tracked-native','staged-default','untracked-native','untracked-default','untracked-observer','ignored-default','tracked-server','staged-preflight','untracked-server','untracked-preflight']){
  const f=cleanGitInputs();
  try{
   if(variant==='tracked-server')writeFileSync(join(f.scriptsRoot,'tools/serve-wasm.py'),'# changed executed server');
   if(variant==='staged-preflight'){writeFileSync(join(f.scriptsRoot,'tools/wasm-tests/terraform-height-preflight.mjs'),'// changed executed preflight');f.git('add','tools/wasm-tests/terraform-height-preflight.mjs');}
   if(variant==='untracked-server'||variant==='untracked-preflight'){const name=variant==='untracked-server'?'tools/serve-wasm.py':'tools/wasm-tests/terraform-height-preflight.mjs';f.git('rm','-q',name);f.git('-c','user.name=Protocol test','-c','user.email=protocol@example.invalid','-c','commit.gpgsign=false','commit','-qm','remove harness');writeFileSync(join(f.scriptsRoot,name),'// untracked executed harness');}
   if(variant==='tracked-native')writeFileSync(join(f.scriptsRoot,'src/model.cpp'),'// changed native');
   if(variant==='staged-default'){writeFileSync(join(f.scriptsRoot,'GLSMAC_data/default/main.gls.js'),'// changed default');f.git('add','GLSMAC_data/default/main.gls.js');}
   if(variant==='untracked-native')writeFileSync(join(f.scriptsRoot,'src/untracked.cpp'),'// undeclared native');
   if(variant==='untracked-default')writeFileSync(join(f.scriptsRoot,'GLSMAC_data/default/untracked.gls.js'),'// undeclared default');
   if(variant==='untracked-observer'){f.git('rm','-q','GLSMAC_data/tests/_terrain_trace_observer.gls.js');f.git('-c','user.name=Protocol test','-c','user.email=protocol@example.invalid','-c','commit.gpgsign=false','commit','-qm','remove source');writeFileSync(join(f.scriptsRoot,'GLSMAC_data/tests/_terrain_trace_observer.gls.js'),'// untracked consumed observer');}
   if(variant==='ignored-default'){writeFileSync(join(f.scriptsRoot,'.gitignore'),'*.local.gls.js\n');writeFileSync(join(f.scriptsRoot,'GLSMAC_data/default/hidden.local.gls.js'),'// ignored but loader-visible');}
   assert.throws(()=>{const prepared=loadHeightPreflight(f);writeHeightPreflight({...f,...prepared});},/Relevant .*source differs/);
   assert.equal(existsSync(f.artifacts),false,'Rejected source may not emit a preflight or misleading clean receipt');
  }finally{rmSync(f.folder,{recursive:true,force:true});}
 }
});

test('clean full producer allows unrelated notes and retains the actual Git source identity',()=>{
 const f=cleanGitInputs();
 try{
  writeFileSync(join(f.scriptsRoot,'README.md'),'unrelated author note');
  const prepared=loadHeightPreflight(f);
  for(const name of ['tools/serve-wasm.py','tools/wasm_assets.py','tools/wasm-tests/terraform-height-preflight.mjs'])assert.equal(prepared.record.source_sha256[name],hash(readFileSync(join(f.scriptsRoot,name))));
  assert.equal(prepared.record.source_sha256.preflight_producer,prepared.record.source_sha256['tools/wasm-tests/terraform-height-preflight.mjs']);
  assert.equal(prepared.record.head,f.git('rev-parse','HEAD').trim());
  assert.equal(prepared.record.native_tree,f.git('rev-parse','HEAD:src').trim());
  writeHeightPreflight({...f,...prepared});assert.equal(existsSync(join(f.artifacts,'preflight.json')),true);
 }finally{rmSync(f.folder,{recursive:true,force:true});}
});

test('a prepared directory is consumed once and every retained output survives a rejected reuse',()=>{
 const folder=mkdtempSync(join(tmpdir(),'height-capture-claim-'));
 try{
  const input=data(),record=buildHeightPreflight(input),prepared={record,...input};
  writeHeightPreflight({artifacts:folder,...prepared});
  claimHeightCapture({artifacts:folder,prepared});
  for(const[name,value]of [['application.log','retained raw'],['application-log-chunks.jsonl','retained chunks'],['report.json','retained report'],['before-height.png','retained frame']])writeFileSync(join(folder,name),value);
  const before=Object.fromEntries(['preflight.json','capture-claim.json','application.log','application-log-chunks.jsonl','report.json','before-height.png'].map(name=>[name,readFileSync(join(folder,name))]));
  assert.throws(()=>claimHeightCapture({artifacts:folder,prepared}),/already contains run output/);
  for(const[name,value]of Object.entries(before))assert.deepEqual(readFileSync(join(folder,name)),value);
 }finally{rmSync(folder,{recursive:true,force:true});}
});

test('old output without a claim also rejects before rewriting preparation',()=>{
 const folder=mkdtempSync(join(tmpdir(),'height-existing-output-'));
 try{
  const input=data(),record=buildHeightPreflight(input),prepared={record,...input};
  writeFileSync(join(folder,'report.json'),'old successful report');
  assert.throws(()=>claimHeightCapture({artifacts:folder,prepared}),/already contains run output/);
  assert.equal(readFileSync(join(folder,'report.json'),'utf8'),'old successful report');
  assert.equal(existsSync(join(folder,'preflight.json')),false);
 }finally{rmSync(folder,{recursive:true,force:true});}
});

test('clean source with stale build metadata or changed runtime bytes rejects before capture',()=>{
 for(const variant of ['missing','source','js','wasm']){
  const f=cleanGitInputs();
  try{
   const path=join(f.build,'provenance.json'),manifest=JSON.parse(readFileSync(path));
   if(variant==='missing')writeFileSync(path,'{}');
   if(variant==='source')manifest.source_tree='0'.repeat(40);
   if(variant==='js')writeFileSync(join(f.build,'GLSMAC.js'),'different executable bytes');
   if(variant==='wasm')writeFileSync(join(f.build,'GLSMAC.wasm'),'different WASM bytes');
   if(variant==='source')writeFileSync(path,JSON.stringify(manifest));
   const expected=variant==='missing'?/Runtime build source revision is required/:variant==='source'?/Build revision does not contain declared native source/:/Runtime build bytes differ/;
   assert.throws(()=>loadHeightPreflight(f),expected);assert.equal(existsSync(f.artifacts),false);
  }finally{rmSync(f.folder,{recursive:true,force:true});}
 }
 const input=data(),manifest={source_head:input.source.head,source_tree:input.source.native_tree,runtime:input.runtimeBuildBinding.runtime};
 const binding=bindHeightRuntime({manifest,manifestBytes:Buffer.from(JSON.stringify(manifest)),nativeTree:manifest.source_tree,compiledTree:manifest.source_tree,runtimeJS:input.runtimeJS,runtimeWasm:input.runtimeWasm});
 assert.equal(binding.native_tree,manifest.source_tree);assert.deepEqual(binding.runtime,input.runtimeBuildBinding.runtime);
});


test('producer binds the server next to the actual driver, not a different source copy',()=>{
 const f=cleanGitInputs();
 try{
  const actualRoot=join(f.folder,'executed');mkdirSync(join(actualRoot,'tools/wasm-tests'),{recursive:true});
  const driverPath=join(actualRoot,'tools/wasm-tests/terraform-height-browser.test.mjs');
  copyFileSync(join(f.scriptsRoot,'tools/wasm-tests/terraform-height-browser.test.mjs'),driverPath);
  writeFileSync(join(actualRoot,'tools/serve-wasm.py'),'# different executed serving behavior');
  assert.throws(()=>loadHeightPreflight({...f,driverPath}),/Executed asset server differs/);
  assert.equal(existsSync(f.artifacts),false);
 }finally{rmSync(f.folder,{recursive:true,force:true});}
});


test('producer rejects tracked and untracked imported asset helper changes',()=>{
 for(const untracked of [false,true]){
  const f=cleanGitInputs();
  try{
   if(untracked){f.git('rm','-q','tools/wasm_assets.py');f.git('-c','user.name=Protocol test','-c','user.email=protocol@example.invalid','-c','commit.gpgsign=false','commit','-qm','remove imported helper');}
   writeFileSync(join(f.scriptsRoot,'tools/wasm_assets.py'),'# changed consumed manifest and asset routing');
   assert.throws(()=>loadHeightPreflight(f),/Relevant tracked, untracked or ignored source differs/);
   assert.equal(existsSync(f.artifacts),false);
  }finally{rmSync(f.folder,{recursive:true,force:true});}
 }
});

test('producer binds the imported asset helper next to the executed server',()=>{
 const f=cleanGitInputs();
 try{
  const actualRoot=join(f.folder,'executed');mkdirSync(join(actualRoot,'tools/wasm-tests'),{recursive:true});
  const driverPath=join(actualRoot,'tools/wasm-tests/terraform-height-browser.test.mjs');
  copyFileSync(join(f.scriptsRoot,'tools/wasm-tests/terraform-height-browser.test.mjs'),driverPath);
  copyFileSync(join(f.scriptsRoot,'tools/serve-wasm.py'),join(actualRoot,'tools/serve-wasm.py'));
  writeFileSync(join(actualRoot,'tools/wasm_assets.py'),'# different imported serving behavior');
  assert.throws(()=>loadHeightPreflight({...f,driverPath}),/Executed asset helper differs/);
  assert.equal(existsSync(f.artifacts),false);
 }finally{rmSync(f.folder,{recursive:true,force:true});}
});


test('caller-authored source and runtime consistency never authenticates a compiler receipt',()=>{
 const input=data(),manifest={source_head:input.source.head,source_tree:input.source.native_tree,
  runtime:input.runtimeBuildBinding.runtime,compiler_verified:true,build_receipt:'caller authored'};
 const binding=bindHeightRuntime({manifest,manifestBytes:Buffer.from(JSON.stringify(manifest)),
  nativeTree:manifest.source_tree,compiledTree:manifest.source_tree,runtimeJS:input.runtimeJS,runtimeWasm:input.runtimeWasm});
 assert.equal(binding.compile_attribution_verified,false);
 assert.match(binding.scope,/compile attribution unverified/);
 input.runtimeBuildBinding={...input.runtimeBuildBinding,compile_attribution_verified:true};
 assert.throws(()=>buildHeightPreflight(input),/not an authenticated build receipt/);
});
