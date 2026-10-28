import assert from 'node:assert/strict';
import {runStreamingWorker} from './streaming-worker.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {hash, nativeCensusEvidence, nativeResources, plan, snapshotAt} from './gse-shards.mjs';

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
const result = await runStreamingWorker(process.execPath, [
  fileURLToPath(new URL('gse-full-worker.cjs', import.meta.url)),
], {cwd: root, timeout: 1200000, maxBuffer: 10 * 1024 * 1024,
  input: JSON.stringify({runtime, snapshot:partition.mounted, prefix: `/tmp/glsmac-full-gse-${partition.index}-${partition.count}`})});
// Progress was forwarded while executing; complete bounded output remains here
// for the same strict failure, completion and partition assertions.
await Promise.all([new Promise(resolve=>process.stdout.write('',resolve)),
  new Promise(resolve=>process.stderr.write('',resolve))]);
assert.ifError(result.error);
assert.equal(result.status, 0, 'WASM game exits successfully');
// runStreamingWorker resolves only in its actual child 'close' handler. This
// fact is recorded after awaiting it, never inferred from APP/TAP/native text.
const nativeResult={close_observed:true,status:result.status,signal:result.signal,
  error:result.error,stdout:result.stdout,stderr:result.stderr};
const nativeCensus=nativeCensusEvidence(nativeResult,nativeResources(snapshot));
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
  writeFileSync(values.report,JSON.stringify({version:2,completed:true,
    partition:{index:partition.index,count:partition.count},source_sha256:partition.source_sha256,
    runtime_sha256:{'GLSMAC.js':runtimeHashes[0][1],'GLSMAC.wasm':runtimeHashes[1][1]},
    scripts:visited,native_engine_tests:true,native_result:nativeResult,
    native_census:nativeCensus},null,2)+'\n');
}
