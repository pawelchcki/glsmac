import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const create_module = createRequire(import.meta.url)('./build/platform.cjs');
const module = await create_module();
module._InitPlatform();

test('real WASM UUID generator produces unique RFC 4122 version 4 identifiers', () => {
  const generated = new Set();
  for (let i = 0; i < 1024; i++) {
    const uuid = module.UTF8ToString(module._GenerateUUID());
    assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.ok(!generated.has(uuid), `Duplicate UUID: ${uuid}`);
    generated.add(uuid);
  }
});

test('embedded resources resolve independently of existing virtual directories', () => {
  const paths = [
    'GLSMAC_data/default/fixture.txt',
    './GLSMAC_data/default/fixture.txt',
    '/GLSMAC_data/default/fixture.txt',
    'GLSMAC_data/tests/../default/fixture.txt',
    '/GLSMAC_data/tests/../default/fixture.txt',
    '/GLSMAC_data/tests/nested/../../default/fixture.txt',
  ];
  const exists = (path) => module.ccall('PlatformFileExists', 'boolean', ['string'], [path]);
  const read = (path, binary) => module.ccall('ReadPlatformFile', 'string',
    ['string', 'number'], [path, binary]);
  const check = () => {
    for (const path of paths) {
      assert.ok(exists(path), `Embedded file exists: ${path}`);
      assert.equal(read(path, 0), 'embedded', `Text read: ${path}`);
      assert.equal(read(path, 1), 'embedded', `Binary read: ${path}`);
    }
  };

  // Cover embedded-only files, then the mixed layout in the full GSE suite:
  // tests are real virtual files while default scripts live in the C++ registry.
  check();
  module.FS.mkdirTree('/GLSMAC_data/tests/nested');
  check();
  try {
    module.FS.chdir('/GLSMAC_data/tests');
    assert.ok(exists('../default/fixture.txt'));
    assert.equal(read('../default/fixture.txt', 0), 'embedded');
  } finally {
    module.FS.chdir('/');
  }

  // A file supplied through the virtual filesystem still overrides the builtin.
  module.FS.mkdirTree('/GLSMAC_data/default');
  module.FS.writeFile('/GLSMAC_data/default/fixture.txt', 'external');
  assert.equal(read(paths[0], 0), 'external');
  assert.equal(read(paths[0], 1), 'external');
  module.FS.unlink('/GLSMAC_data/default/fixture.txt');
  assert.equal(read(paths[0], 0), 'embedded');
  assert.equal(exists('GLSMAC_data/default/missing.txt'), false);
  assert.equal(exists(''), false);
});

test('browser TCP failures preserve the real asynchronous network module contract', () => {
  module._CreateNetwork();
  try {
    for (const host of [0, 1, 0]) {
      const id = module._ConnectNetwork(host);
      assert.equal(module._GetNetworkResult(id), 0, 'request is pending before Iterate');
      module._IterateNetwork();
      assert.equal(module._GetNetworkResult(id), 2, 'unsupported TCP returns R_ERROR');
      assert.match(module.UTF8ToString(module._GetNetworkMessage()), /TCP multiplayer.*unavailable.*browser/);
      assert.equal(module._GetNetworkMode(), 0, 'a failed connection stays in CM_NONE');
      assert.equal(module._GetNetworkResult(id), 0, 'a response can only be consumed once');
    }

    const canceled = module._ConnectNetwork(0);
    module._CancelNetworkRequest(canceled);
    module._IterateNetwork();
    assert.equal(module._GetNetworkResult(canceled), 0, 'canceled requests are removed');

    const disconnect = module._DisconnectNetwork();
    module._IterateNetwork();
    assert.equal(module._GetNetworkResult(disconnect), 1, 'disconnecting while offline succeeds');
    const events = module._GetNetworkEvents();
    module._IterateNetwork();
    assert.equal(module._GetNetworkResult(events), 1);
    assert.equal(module._GetNetworkEventCount(), 0, 'failed connections emit no connected events');
  } finally {
    module._StopNetwork();
    module._DestroyNetwork();
  }
});
