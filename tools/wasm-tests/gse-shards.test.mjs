import assert from 'node:assert/strict';
import test from 'node:test';
import {combine,plan,snapshotAt} from './gse-shards.mjs';
import {fileURLToPath} from 'node:url';

const source={'GLSMAC_data/default/main.gls.js':'production',
  'GLSMAC_data/tests/_behavior.gls.js':'helper',
  'GLSMAC_data/tests/nested/input.gls.js':'support',
  ...Object.fromEntries(['a','b','c','d','e'].map(n=>[`GLSMAC_data/tests/${n}.gls.js`,n]))};
const runtime={'GLSMAC.js':'a'.repeat(64),'GLSMAC.wasm':'b'.repeat(64)};
const fixture=()=>[1,2].map(index=>({version:1,completed:true,native_engine_tests:true,
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
  assert.throws(()=>plan({'GLSMAC_data/default/main.gls.js':'no tests'}));
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
  const reports=parts.map(part=>({version:1,completed:true,native_engine_tests:true,
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
