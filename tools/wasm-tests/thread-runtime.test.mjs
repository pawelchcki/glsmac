import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);

for (const target of ['native', 'wasm']) test(`real ${target} engine threads deliver callbacks, preserve affinity and stop collection before teardown`, async () => {
  const program = fileURLToPath(new URL(`build/thread-runtime${target === 'native' ? '-native' : '.cjs'}`, import.meta.url));
  const { stdout, stderr } = await run(target === 'native' ? program : process.execPath,
    target === 'native' ? [] : [program], { timeout: 14000 });
  assert.equal(stderr, '');
  assert.match(stdout, /Thread callbacks, module affinity, reverse shutdown and join passed/);
  assert.match(stdout, /In-flight collection finishes and joins before resource teardown/);
  assert.match(stdout, /Background workers quiesce before UI-owned script state teardown/);
});
