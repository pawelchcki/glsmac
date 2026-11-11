import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('SDK completes the notification while the synchronous context is live', () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('build/proxy-context.cjs', import.meta.url)),
  ], { encoding: 'utf8', timeout: 10_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PROXY_CONTEXT_LIVE_DURING_SIGNAL/);
});
