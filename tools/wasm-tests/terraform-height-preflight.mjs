// Metadata preparation only: reads declared source/runtime/input bytes without
// evaluating scripts, loading WASM, creating a browser, or claiming native state.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync,lstatSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {declaredTerrain,fixtureSources,rateOneSource} from './terraform-browser-inputs.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');

export function bindHeightRuntime({manifest,manifestBytes,nativeTree,compiledTree,runtimeJS,runtimeWasm}){
  assert.match(manifest.source_head,/^[0-9a-f]{40}$/,'Runtime build source revision is required');
  const tree=manifest.source_tree??manifest.src_tree;
  assert.match(tree,/^[0-9a-f]{40}$/);
  if(manifest.source_tree!==undefined&&manifest.src_tree!==undefined)assert.equal(manifest.source_tree,manifest.src_tree);
  assert.equal(tree,compiledTree,'Build revision does not contain declared native source');
  assert.equal(tree,nativeTree,'Runtime was built from different native source');
  const runtime={'GLSMAC.js':sha(runtimeJS),'GLSMAC.wasm':sha(runtimeWasm)};
  for(const[name,digest]of Object.entries(runtime))assert.equal(manifest.runtime[name],digest,`Runtime build bytes differ: ${name}`);
  return{schema:'native-source-runtime.v1',provenance_sha256:sha(manifestBytes),source_head:manifest.source_head,
    native_tree:tree,runtime,compile_attribution_verified:false,scope:'Declared native source/runtime consistency; compile attribution unverified; Default scripts separately captured'};
}

export function claimHeightCapture({artifacts,prepared,report}){
  const allowed=new Set(['preflight.json','fixture-main.gls.js','fixture-world.gls.js','fixture-map.MP']);
  if(existsSync(artifacts)){
    assert.ok(lstatSync(artifacts).isDirectory()&&!lstatSync(artifacts).isSymbolicLink(),'Capture directory must be a real directory');
    for(const name of readdirSync(artifacts)){
      assert.ok(allowed.has(name),`Capture directory already contains run output: ${name}`);
      const entry=lstatSync(resolve(artifacts,name));assert.ok(entry.isFile()&&!entry.isSymbolicLink(),'Prepared inputs must be regular files');
    }
  }
  const digest=writeHeightPreflight({artifacts,...prepared,report});
  // Cooperative concurrent launches share this atomic one-use claim. Even an
  // unsuccessful launch consumes it; historical output is never truncated.
  writeFileSync(resolve(artifacts,'capture-claim.json'),JSON.stringify({version:1,preflight_sha256:digest,candidate_execution_requested:true})+'\n',{flag:'wx'});
  return digest;
}

export function assertHeightSourcesClean(scriptsRoot){
  const consumed=['src','GLSMAC_data/default','tools/serve-wasm.py','tools/wasm_assets.py','tools/wasm-tests/terraform-height-preflight.mjs','GLSMAC_data/tests/_state_trace_observer.gls.js',
    'GLSMAC_data/tests/_terrain_trace_observer.gls.js','GLSMAC_data/tests/_terraform_cooperation_observer.gls.js',
    'tools/wasm-tests/terraform-height-browser.test.mjs','tools/wasm-tests/terraform-height-observation.mjs',
    'tools/wasm-tests/terraform-browser-inputs.mjs','tools/wasm-tests/fixtures/terraform-height-main.gls.js',
    'tools/wasm-tests/fixtures/terraform-controls-main.gls.js','tools/wasm-tests/fixtures/terraform-controls-world.gls.js',
    'tools/wasm-tests/browser-log-cursor.mjs','tools/wasm-tests/browser-native-log-hook.mjs',
    'tools/wasm-tests/runtime-fetch-barrier.mjs','tools/wasm-tests/terraform-browser-geometry.mjs','tools/wasm-tests/terraform-browser-pointer.mjs'];
  const changes=execFileSync('git',['status','--porcelain=v1','-z','--untracked-files=all','--ignored=matching','--',...consumed],{cwd:scriptsRoot,encoding:'utf8'});
  assert.equal(changes,'','Relevant tracked, untracked or ignored source differs from declared clean HEAD');
}

export function terrainOverrideTable(original,executed){
  const rows=bytes=>{let active=false;const out=[];
    for(const[line,text]of bytes.toString('latin1').split('\n').entries()){
      const trimmed=text.trim();if(trimmed==='#TERRAIN'){active=true;continue;}
      if(active&&trimmed.startsWith('#'))break;
      if(active&&trimmed&&!trimmed.startsWith(';'))out.push({line:line+1,fields:text.split(';')[0].trimEnd().split(',').map(field=>field.trim())});
    }return out;};
  const before=rows(original),after=rows(executed);assert.equal(before.length,20);assert.equal(after.length,20);
  return before.map((row,index)=>{
    const next=after[index];assert.equal(row.line,next.line);assert.equal(row.fields.length,next.fields.length);
    for(let field=0;field<row.fields.length;field++)if(field!==4)assert.equal(row.fields[field],next.fields[field],'Only shared duration input may change');
    assert.match(row.fields[4],/^\d+$/);assert.equal(next.fields[4],'1');
    return{row:index,line:row.line,land_name:row.fields[0],land_prerequisite:row.fields[1],sea_name:row.fields[2],sea_prerequisite:row.fields[3],
      field:'shared_turns',field_index:4,old:Number(row.fields[4]),new:1,applies_to:['land','sea']};
  });
}

export function buildHeightPreflight({source,runtimeJS,runtimeWasm,runtimeBuildBinding,originalRules,executedRules,map,main,world,helpers,seed}){
  assert.ok(Buffer.isBuffer(map));assert.equal(map.subarray(0,11).toString('binary'),'TERRANMAP\0\x1a');
  for(const key of ['head','native_tree','default_tree'])assert.match(source[key],/^[0-9a-f]{40}$/);
  assert.equal(runtimeBuildBinding.compile_attribution_verified,false,'Caller metadata is not an authenticated build receipt');
  assert.equal(runtimeBuildBinding.schema,'native-source-runtime.v1');assert.equal(runtimeBuildBinding.native_tree,source.native_tree);
  assert.deepEqual(runtimeBuildBinding.runtime,{'GLSMAC.js':sha(runtimeJS),'GLSMAC.wasm':sha(runtimeWasm)});
  const width=map.readUInt32LE(15),height=map.readUInt32LE(19),tiles=map.readUInt32LE(35);
  return{version:1,kind:'terraform-height-producer-preflight.v1',candidate_executed:false,phase:'before-native-launch',
    head:source.head,native_tree:source.native_tree,default_tree:source.default_tree,
    runtime:{js:sha(runtimeJS),wasm:sha(runtimeWasm)},runtime_build_binding:runtimeBuildBinding,original_rules_sha256:sha(originalRules),executed_rules_sha256:sha(executedRules),
    override_table:terrainOverrideTable(originalRules,executedRules),source_sha256:source.files,
    input_sha256:{main:sha(main),world:sha(world),helpers:sha(JSON.stringify(helpers)),map:sha(map)},
    production_default_sha256:source.production_default_sha256,
    declared_map:{width,height,tiles,bytes:map.length},seed_requested:seed,browser_budget_ms:180000,
    native_policy_observation:'not available before launch; require actual TH_INPUTS and every retained native world in the auditor'};
}

export function loadHeightPreflight({scriptsRoot,build,assets,seed,runtimeProvenancePath=process.env.WASM_RUNTIME_PROVENANCE||resolve(build,'provenance.json'),driverPath=resolve(scriptsRoot,'tools/wasm-tests/terraform-height-browser.test.mjs')}){
  // A future producer must reject ambiguity before it reads/emits a clean
  // HEAD-labelled snapshot. Historical captures gain no retrospective receipt.
  assertHeightSourcesClean(scriptsRoot);
  const read=name=>readFileSync(resolve(scriptsRoot,name));
  const main=read('tools/wasm-tests/fixtures/terraform-height-main.gls.js'),world=fixtureSources(scriptsRoot,{water:false}).world;
  const names=['_state_trace_observer','_terrain_trace_observer','_terraform_cooperation_observer'];
  const helpers=Object.fromEntries(names.map(name=>[name,read(`GLSMAC_data/tests/${name}.gls.js`).toString('utf8')]));
  const files=Object.fromEntries(['tools/serve-wasm.py','tools/wasm_assets.py','tools/wasm-tests/terraform-height-preflight.mjs','tools/wasm-tests/terraform-height-observation.mjs','tools/wasm-tests/terraform-browser-inputs.mjs',
    'tools/wasm-tests/fixtures/terraform-height-main.gls.js','tools/wasm-tests/fixtures/terraform-controls-world.gls.js',
    'tools/wasm-tests/browser-log-cursor.mjs','tools/wasm-tests/browser-native-log-hook.mjs','tools/wasm-tests/runtime-fetch-barrier.mjs',
    'tools/wasm-tests/terraform-browser-geometry.mjs','tools/wasm-tests/terraform-browser-pointer.mjs',
    ...names.map(name=>`GLSMAC_data/tests/${name}.gls.js`)].map(name=>[name,sha(read(name))]));
  assert.equal(files['tools/wasm-tests/terraform-browser-inputs.mjs'],sha(readFileSync(new URL('terraform-browser-inputs.mjs',import.meta.url))),'Executed input helper differs from declared source root');
  files['executed_node_driver']=sha(readFileSync(driverPath));files['preflight_producer']=sha(readFileSync(fileURLToPath(import.meta.url)));
  assert.equal(files['preflight_producer'],files['tools/wasm-tests/terraform-height-preflight.mjs'],'Executed preflight differs from declared source root');
  assert.equal(files['tools/serve-wasm.py'],sha(readFileSync(resolve(dirname(driverPath),'../serve-wasm.py'))),'Executed asset server differs from declared source root');
  assert.equal(files['tools/wasm_assets.py'],sha(readFileSync(resolve(dirname(driverPath),'../wasm_assets.py'))),'Executed asset helper differs from declared source root');
  const scripts=Object.fromEntries(readdirSync(resolve(scriptsRoot,'GLSMAC_data/default'),{recursive:true}).filter(name=>name.endsWith('.gls.js')).sort()
    .map(name=>[`GLSMAC_data/default/${name}`,read(`GLSMAC_data/default/${name}`).toString('utf8')]));
  const rev=ref=>execFileSync('git',['rev-parse',ref],{cwd:scriptsRoot,encoding:'utf8'}).trim();
  const runtimeJS=readFileSync(resolve(build,'GLSMAC.js')),runtimeWasm=readFileSync(resolve(build,'GLSMAC.wasm'));
  const manifestBytes=readFileSync(runtimeProvenancePath),manifest=JSON.parse(manifestBytes);
  assert.match(manifest.source_head,/^[0-9a-f]{40}$/,'Runtime build source revision is required');
  const runtimeBuildBinding=bindHeightRuntime({manifest,manifestBytes,nativeTree:rev('HEAD:src'),compiledTree:rev(`${manifest.source_head}:src`),runtimeJS,runtimeWasm});
  const originalRules=readFileSync(resolve(assets,'alphax.txt')),executedRules=rateOneSource(originalRules),map=declaredTerrain();
  const record=buildHeightPreflight({source:{head:rev('HEAD'),native_tree:rev('HEAD:src'),default_tree:rev('HEAD:GLSMAC_data/default'),files,production_default_sha256:sha(JSON.stringify(scripts))},
    runtimeJS,runtimeWasm,runtimeBuildBinding,originalRules,executedRules,map,main,world,helpers,seed});
  return{record,main,world,map};
}

export function writeHeightPreflight({artifacts,record,main,world,map,report}){
  if(report){
    assert.deepEqual(report.runtime_build_binding,record.runtime_build_binding,'Capture runtime provenance differs from preparation');
    for(const[reportKey,value]of Object.entries({host_head:record.head,native_source_tree:record.native_tree,default_tree:record.default_tree,
      runtime_js_sha256:record.runtime.js,runtime_wasm_sha256:record.runtime.wasm,observer_sha256:record.input_sha256.main,
      world_input_sha256:record.input_sha256.world,observer_helpers_sha256:record.input_sha256.helpers,
      production_default_sha256:record.production_default_sha256,seed_requested:record.seed_requested,driver_sha256:record.source_sha256.executed_node_driver}))assert.equal(report[reportKey],value,`Preflight differs from actual capture snapshot: ${reportKey}`);
    assert.equal(report.height_observation_sha256,record.source_sha256['tools/wasm-tests/terraform-height-observation.mjs']);
    for(const[name,digest]of Object.entries(report.shared_helpers_sha256))assert.equal(record.source_sha256[`tools/wasm-tests/${name}`],digest,`Executed shared helper differs: ${name}`);
    assert.equal(report.source_override.original_sha256,record.original_rules_sha256);assert.equal(report.source_override.rate_one_sha256,record.executed_rules_sha256);
  }
  mkdirSync(artifacts,{recursive:true});
  const text=JSON.stringify(record,null,2)+'\n';
  // An identical preparation may be consumed by the later capture. Never
  // relabel or overwrite a historical/different preflight or fixture artifact.
  for(const[name,bytes]of [['preflight.json',text],['fixture-main.gls.js',main],['fixture-world.gls.js',world],['fixture-map.MP',map]]){
    const path=resolve(artifacts,name),buffer=Buffer.from(bytes);
    if(existsSync(path))assert.deepEqual(readFileSync(path),buffer,`Refusing to overwrite different ${name}`);
    else writeFileSync(path,buffer,{flag:'wx'});
  }
  return sha(text);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={};
  assert.equal(args.length%2,0,'Expected --scripts-root/--app-dir/--assets-dir/--artifacts-dir pairs');
  const keys={'--scripts-root':'scriptsRoot','--app-dir':'build','--assets-dir':'assets','--artifacts-dir':'artifacts','--runtime-provenance':'runtimeProvenancePath'};
  for(let i=0;i<args.length;i+=2){assert.ok(keys[args[i]]);assert.equal(options[keys[args[i]]],undefined);options[keys[args[i]]]=resolve(args[i+1]);}
  for(const key of ['scriptsRoot','build','assets','artifacts'])assert.ok(options[key],`Missing ${key}`);
  const prepared=loadHeightPreflight({...options,seed:'1651011033:1377505029:3019448108:3247278135'});
  const digest=writeHeightPreflight({...options,...prepared});
  console.log(JSON.stringify({candidate_executed:false,preflight_sha256:digest,path:resolve(options.artifacts,'preflight.json')}));
}
