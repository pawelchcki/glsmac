import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);

test('real WASM engine threads deliver callbacks, preserve module affinity and join after shutdown', async () => {
  const { stdout, stderr } = await run(process.execPath, [
    fileURLToPath(new URL('build/thread-runtime.cjs', import.meta.url)),
  ], { timeout: 14000 });
  assert.equal(stderr, '');
  assert.match(stdout, /Thread callbacks, module affinity, reverse shutdown and join passed/);
});
