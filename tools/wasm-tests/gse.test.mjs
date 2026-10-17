import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = process.env.WASM_APP_DIR || `${root}build/wasm/bin`;
const result = spawnSync(process.execPath, [
  `${directory}/GLSMAC.js`, '--gse-tests', '--quiet', '--prefix', '/tmp/glsmac',
], { cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 10 * 1024 * 1024 });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
assert.ifError(result.error);
assert.equal(result.status, 0, 'WASM game exits successfully');
assert.doesNotMatch(result.stdout, /TEST FAILED|Testing complete, passed:/);
assert.match(result.stdout, /All tests passed\./, 'Full GSE suite completed');
