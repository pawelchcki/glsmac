import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

export const hash = value => createHash('sha256').update(value).digest('hex');
export const entrypoint = /^GLSMAC_data\/tests\/[^_/][^/]*\.gls\.js$/;

// Main55e's third partition exhausted its existing20-minute deadline while
// the fourth completed in596s. Move these three measured heavy scripts to4
// (163s+105s+102s); keep the same four workers, bounds and complete inventory.
const fourWayHeavy = new Set([
  'GLSMAC_data/tests/unit_disband_controls.gls.js',
  'GLSMAC_data/tests/terraform_automation.gls.js',
  'GLSMAC_data/tests/terraforming_controls_all.gls.js',
]);

export function snapshotAt(root) {
  return Object.fromEntries(['default', 'tests'].flatMap(kind =>
    readdirSync(`${root}/GLSMAC_data/${kind}`, {recursive:true})
      .filter(name=>name.endsWith('.gls.js')).sort()
      .map(name=>[`GLSMAC_data/${kind}/${name}`,readFileSync(`${root}/GLSMAC_data/${kind}/${name}`,'utf8')])));
}

export function plan(snapshot, index=1, count=1) {
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
  const seen = new Set(); let runtime; const visited=[];
  for(const report of reports) {
    assert.equal(report.version,1,'Known GSE report format');
    assert.equal(report.completed,true,'A timed-out or failed run cannot satisfy coverage');
    assert.equal(report.native_engine_tests,true,'Native C++ engine tests must execute');
    assert.equal(report.source_sha256,expected.source_sha256,'Current complete source snapshot');
    assert.equal(report.partition.count,count,'Consistent partition count');
    const index=report.partition.index;
    assert.ok(!seen.has(index),'Duplicate GSE partition');seen.add(index);
    const partition=plan(snapshot,index,count);
    assert.deepEqual(report.scripts,partition.selected,'Every planned entrypoint executed exactly once');
    const hashes=report.runtime_sha256;
    assert.deepEqual(Object.keys(hashes).sort(),['GLSMAC.js','GLSMAC.wasm']);
    for(const digest of Object.values(hashes))assert.match(digest,/^[0-9a-f]{64}$/);
    if(runtime)assert.deepEqual(hashes,runtime,'One immutable test-engine artifact');
    else runtime=hashes;
    visited.push(...report.scripts);
  }
  assert.deepEqual(visited.sort(),expected.all,'Complete current script coverage without duplicates');
  return {version:1,completed:true,source_sha256:expected.source_sha256,
    runtime_sha256:runtime,partitions:count,scripts:expected.all,native_engine_tests:true};
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
