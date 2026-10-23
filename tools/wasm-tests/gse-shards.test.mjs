import assert from 'node:assert/strict';
import test from 'node:test';
import {combine,plan} from './gse-shards.mjs';

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
