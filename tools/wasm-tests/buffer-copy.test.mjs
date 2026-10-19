import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

for (const [name, command, args] of [
  ['native AddressSanitizer', fileURLToPath(new URL('build/buffer-copy-native', import.meta.url)), []],
  ['WASM', process.execPath, [fileURLToPath(new URL('build/buffer-copy.cjs', import.meta.url))]],
]) {
  test(`copied serialization buffers append safely and preserve independent read positions: ${name}`, () => {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^BUFFER_COPY_PASS 4$/m);
  });
}
