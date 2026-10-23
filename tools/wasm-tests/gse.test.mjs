import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {hash, plan, snapshotAt} from './gse-shards.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = process.env.WASM_APP_DIR || `${root}build/wasm/bin`;
const scriptsRoot = process.env.WASM_SCRIPTS_ROOT || root;
const snapshot = snapshotAt(scriptsRoot);
const {values}=parseArgs({options:{shard:{type:'string'},report:{type:'string'}}});
const shard=(values.shard||'1/1').match(/^([1-9]\d*)\/([1-9]\d*)$/);
assert.ok(shard,'GSE shard must be INDEX/COUNT');
const partition=plan(snapshot,Number(shard[1]),Number(shard[2]));
const expectedScripts=partition.selected;
const runtime = `${directory}/GLSMAC.js`;
const runtimeHashes = [runtime, `${directory}/GLSMAC.wasm`].map(name => [name, hash(readFileSync(name))]);
console.log(`Full GSE source SHA-256: ${partition.source_sha256}; partition ${partition.index}/${partition.count}: ${expectedScripts.length}/${partition.all.length} scripts plus native engine tests`);
// Every process includes native engine tests and its declared script partition.
// Without --shard this retains the complete serial run. Keep the existing
// process limit; CI coverage aggregation requires all disjoint partitions.
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('gse-full-worker.cjs', import.meta.url)),
], {cwd: root, encoding: 'utf8', timeout: 1200000, maxBuffer: 10 * 1024 * 1024,
  input: JSON.stringify({runtime, snapshot:partition.mounted, prefix: `/tmp/glsmac-full-gse-${partition.index}-${partition.count}`})});
// Flush complete child output before a failing assertion exits the parent.
// Otherwise CI can lose the final progress lines needed to diagnose a timeout.
await new Promise(resolve => process.stdout.write(result.stdout || '', resolve));
await new Promise(resolve => process.stderr.write(result.stderr || '', resolve));
assert.ifError(result.error);
assert.equal(result.status, 0, 'WASM game exits successfully');
assert.doesNotMatch(result.stdout, /TEST FAILED|Testing complete, passed:/);
assert.match(result.stdout, /All tests passed\./, 'Full GSE suite completed');
assert.match(result.stdout, /^\s*test if tests work\.\.\.$/m, 'Native engine tests were included');
const mounted=[...result.stdout.matchAll(/^GSE_MOUNTED_ENTRIES\|([^\r\n]+)$/gm)];
assert.equal(mounted.length,1,'The supplied snapshot mounted before native execution');
assert.deepEqual(JSON.parse(mounted[0][1]),expectedScripts,'Actual scanned directory matches this partition');
const visited = [...result.stdout.matchAll(/^\s*testing \.\/(GLSMAC_data\/tests\/[^/\r\n]+\.gls\.js)\.\.\.$/gm)].map(match => match[1]).sort();
assert.deepEqual(visited, expectedScripts, 'Every discovered non-helper script executed exactly once');
for (const [name, digest] of runtimeHashes) assert.equal(hash(readFileSync(name)), digest, 'The test engine stayed unchanged');
if(values.report) {
  mkdirSync(dirname(values.report),{recursive:true});
  writeFileSync(values.report,JSON.stringify({version:1,completed:true,
    partition:{index:partition.index,count:partition.count},source_sha256:partition.source_sha256,
    runtime_sha256:{'GLSMAC.js':runtimeHashes[0][1],'GLSMAC.wasm':runtimeHashes[1][1]},
    scripts:visited,native_engine_tests:true},null,2)+'\n');
}
