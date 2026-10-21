import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = process.env.WASM_APP_DIR || `${root}build/wasm/bin`;
const scriptsRoot = process.env.WASM_SCRIPTS_ROOT || root;
const snapshot = Object.fromEntries(['default', 'tests'].flatMap(kind =>
  readdirSync(`${scriptsRoot}/GLSMAC_data/${kind}`, {recursive: true})
    .filter(name => name.endsWith('.gls.js')).sort()
    .map(name => [`GLSMAC_data/${kind}/${name}`, readFileSync(`${scriptsRoot}/GLSMAC_data/${kind}/${name}`, 'utf8')])));
const expectedScripts = Object.keys(snapshot).filter(name => /^GLSMAC_data\/tests\/[^_/][^/]*\.gls\.js$/.test(name)).sort();
assert.ok(expectedScripts.length, 'The complete run must discover actual script tests');
const runtime = `${directory}/GLSMAC.js`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const runtimeHashes = [runtime, `${directory}/GLSMAC.wasm`].map(name => [name, hash(readFileSync(name))]);
console.log(`Full GSE scripts SHA-256: ${hash(JSON.stringify(snapshot))}; ${expectedScripts.length} script files plus native engine tests`);
// This serial run includes engine tests and every script. The isolated suites
// in fast.py have their own limits; this complete run also includes teardown
// and needs headroom on shared CI runners.
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('gse-full-worker.cjs', import.meta.url)),
], {cwd: root, encoding: 'utf8', timeout: 1200000, maxBuffer: 10 * 1024 * 1024,
  input: JSON.stringify({runtime, snapshot, prefix: '/tmp/glsmac-full-gse'})});
// Flush complete child output before a failing assertion exits the parent.
// Otherwise CI can lose the final progress lines needed to diagnose a timeout.
await new Promise(resolve => process.stdout.write(result.stdout || '', resolve));
await new Promise(resolve => process.stderr.write(result.stderr || '', resolve));
assert.ifError(result.error);
assert.equal(result.status, 0, 'WASM game exits successfully');
assert.doesNotMatch(result.stdout, /TEST FAILED|Testing complete, passed:/);
assert.match(result.stdout, /All tests passed\./, 'Full GSE suite completed');
assert.match(result.stdout, /^\s*test if tests work\.\.\.$/m, 'Native engine tests were included');
const visited = [...result.stdout.matchAll(/^\s*testing \.\/(GLSMAC_data\/tests\/[^/\r\n]+\.gls\.js)\.\.\.$/gm)].map(match => match[1]).sort();
assert.deepEqual(visited, expectedScripts, 'Every discovered non-helper script executed exactly once');
for (const [name, digest] of runtimeHashes) assert.equal(hash(readFileSync(name)), digest, 'The test engine stayed unchanged');
