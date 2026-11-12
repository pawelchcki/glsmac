import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const importerSource = readFileSync(new URL('../../web/installer-import.js', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../../web/installer-worker.js', import.meta.url), 'utf8');
const core = ['alpha.txt', 'arialnb.ttf', 'openinga.pcx', 'terranx.exe'];

function importer(deliver) {
  const workers = [];
  class Worker {
    constructor(url) {
      this.url = String(url);
      this.terminated = 0;
      workers.push(this);
    }
    postMessage(request) {
      this.request = request;
      deliver(this, request, workers.length);
    }
    terminate() { ++this.terminated; }
  }
  const context = vm.createContext({ Worker, URL, File, document: { baseURI: 'https://example.test/game/' } });
  vm.runInContext(importerSource, context, { filename: 'installer-import.js' });
  return { extract: context.GLSMACInstaller.extract, workers };
}

function send(worker, messages) {
  queueMicrotask(() => {
    for (const data of messages) worker.onmessage({ data });
  });
}

function input(name = 'setup.exe') {
  return new File(['synthetic archive input'], name, { lastModified: 123456 });
}

test('installer selection errors create no worker and preserve the selected input files', async () => {
  const bridge = importer(() => { throw new Error('Invalid selection reached a worker'); });
  const exe = input();
  const invalid = [[], [input('setup.bin')], [exe, input('other.exe')], [exe, input('notes.txt')]];
  for (const files of invalid) await assert.rejects(bridge.extract(files), /Select/);
  assert.equal(bridge.workers.length, 0);
  assert.equal(await exe.text(), 'synthetic archive input');
  assert.equal(exe.lastModified, 123456);
});

test('installer importer publishes only a completed batch with relative paths and source timestamps', async () => {
  const progress = [];
  const exe = input('SETUP.EXE');
  const companion = input('setup-1.bin');
  const bridge = importer((worker) => send(worker, [
    { type: 'progress', message: 'Reading synthetic input' },
    { type: 'file', path: 'alpha.txt', blob: new Blob(['rules']) },
    { type: 'file', path: 'FX/Opening.wav', blob: new Blob([new Uint8Array([1, 2, 3])]) },
    { type: 'done', files: 2, bytes: 8 },
  ]));
  const files = await bridge.extract([exe, companion], { onProgress: (message) => progress.push(message) });
  assert.deepEqual(Array.from(files, (file) => [file.name, file.webkitRelativePath, file.lastModified, file.size]), [
    ['alpha.txt', 'Installation/alpha.txt', 123456, 5],
    ['Opening.wav', 'Installation/FX/Opening.wav', 123456, 3],
  ]);
  assert.equal(await files[0].text(), 'rules');
  assert.deepEqual([...new Uint8Array(await files[1].arrayBuffer())], [1, 2, 3]);
  assert.deepEqual(progress, ['Opening the GOG installer on your device…', 'Reading synthetic input',
    'Unpacked 1 game files…', 'Unpacked 2 game files…']);
  const [worker] = bridge.workers;
  assert.equal(worker.url, 'https://example.test/game/installer-worker.js');
  assert.equal(worker.request.installer, 'SETUP.EXE');
  assert.deepEqual(Array.from(worker.request.files), [exe, companion]);
  assert.equal(worker.terminated, 1);
});

test('partial installer output is discarded on failure and a fresh retry starts without old files', async () => {
  const bridge = importer((worker, request, attempt) => send(worker, attempt === 1 ? [
    { type: 'file', path: 'partial.txt', blob: new Blob(['partial']) },
    { type: 'error', message: 'Synthetic companion read failed' },
  ] : [
    { type: 'file', path: 'complete.txt', blob: new Blob(['complete']) },
    { type: 'done' },
  ]));
  await assert.rejects(bridge.extract([input()]), /Synthetic companion read failed/);
  const files = await bridge.extract([input()]);
  assert.deepEqual(Array.from(files, (file) => file.webkitRelativePath), ['Installation/complete.txt']);
  assert.deepEqual(bridge.workers.map((worker) => worker.terminated), [1, 1]);
});

test('invalid extracted paths reject the entire batch and terminate each worker', async () => {
  for (const path of ['../alpha.txt', '/alpha.txt', 'FX//opening.wav', 'FX\\opening.wav', 'FX/./opening.wav', 'bad\0name']) {
    const bridge = importer((worker) => send(worker, [
      { type: 'file', path: 'earlier.txt', blob: new Blob(['valid earlier file']) },
      { type: 'file', path, blob: new Blob(['invalid']) },
    ]));
    await assert.rejects(bridge.extract([input()]), /invalid game file path/);
    assert.equal(bridge.workers[0].terminated, 1);
  }
});

test('worker startup, message decoding, posting and empty extraction failures all clean up', async () => {
  const failures = [
    [(worker) => queueMicrotask(() => worker.onerror()), /could not run/],
    [(worker) => queueMicrotask(() => worker.onmessageerror()), /unreadable data/],
    [() => { throw new Error('Synthetic post failure'); }, /Synthetic post failure/],
    [(worker) => send(worker, [{ type: 'done' }]), /no compatible game files/],
  ];
  for (const [deliver, message] of failures) {
    const bridge = importer(deliver);
    await assert.rejects(bridge.extract([input()]), message);
    assert.equal(bridge.workers[0].terminated, 1);
  }
});

function workerFixture(options = {}) {
  const messages = [];
  const modules = [];
  const imports = [];
  const self = { postMessage: (message) => messages.push(message) };
  const context = vm.createContext({ self, File, Blob, Set, Uint8Array,
    importScripts: (path) => imports.push(path),
    createInnoextract: async (configuration) => {
      const files = new Map();
      const audit = { mounts: [], unmounts: [], unlinks: [], calls: [], reads: [] };
      const module = {
        audit,
        FS: {
          mkdirTree() {},
          mount: (type, data, path) => audit.mounts.push({ type, data, path }),
          unmount: (path) => audit.unmounts.push(path),
          readFile: (path) => files.get(path),
          unlink: (path) => { audit.unlinks.push(path); files.delete(path); },
        },
        WORKERFS: { stream_ops: {}, reader: { readAsArrayBuffer: (bytes) => {
          audit.reads.push(bytes.byteLength);
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        } } },
        ccall: async (name, result, argumentTypes, arguments_) => {
          audit.calls.push([name, result, Array.from(argumentTypes), Array.from(arguments_)]);
          if (!arguments_[1]) {
            for (const path of options.listing || core) configuration.print(path);
            return options.listStatus || 0;
          }
          if (options.inspectReads) await options.inspectReads(module);
          for (const path of options.outputs || core) {
            const target = `/out/${path}`;
            files.set(target, new TextEncoder().encode(`synthetic ${path}`));
            await module.onExtractedFile(target);
          }
          return options.extractStatus || 0;
        },
      };
      modules.push(module);
      return module;
    },
  });
  vm.runInContext(workerSource, context, { filename: 'installer-worker.js' });
  return { messages, modules, imports, extract: (files = [input()], installer = 'setup.exe') =>
    self.onmessage({ data: { type: 'extract', files, installer } }) };
}

test('installer worker validates companion identities before loading any extractor and recovers for retry', async () => {
  const fixture = workerFixture();
  for (const files of [[input(), input('SETUP.EXE')], [input('../setup.exe')], [input('setup.bin')], [{}]]) {
    await fixture.extract(files);
    assert.equal(fixture.messages.at(-1).type, 'error');
    assert.equal(fixture.modules.length, 0);
    assert.deepEqual(fixture.imports, []);
  }
  await fixture.extract();
  assert.equal(fixture.messages.at(-1).type, 'done');
  assert.equal(fixture.modules.length, 1);
  assert.deepEqual(fixture.modules[0].audit.unmounts, ['/input']);
});

test('worker listing gates extraction and excludes support files from a completed batch', async () => {
  const incomplete = workerFixture({ listing: core.filter((path) => path !== 'openinga.pcx') });
  await incomplete.extract();
  assert.equal(incomplete.messages.at(-1).type, 'error');
  assert.match(incomplete.messages.at(-1).message, /does not contain/);
  assert.equal(incomplete.modules[0].audit.calls.length, 1);
  assert.deepEqual(incomplete.modules[0].audit.unmounts, ['/input']);
  const valid = workerFixture({ listing: [...core, '__support/metadata.txt', 'app/uninstaller.exe', 'FX/'],
    outputs: [...core, '__support/metadata.txt', 'app/uninstaller.exe'] });
  await valid.extract();
  assert.deepEqual(valid.messages.filter((message) => message.type === 'file').map((message) => message.path), core);
  assert.equal(valid.messages.at(-1).type, 'done');
  assert.equal(valid.messages.at(-1).files, core.length);
  assert.deepEqual(valid.modules[0].audit.unlinks, [...core, '__support/metadata.txt', 'app/uninstaller.exe'].map((path) => `/out/${path}`));
  assert.deepEqual(valid.modules[0].audit.unmounts, ['/input']);
});

test('partial, duplicate and unexpected extractor output never produces a completed worker batch', async () => {
  for (const options of [
    { outputs: core.slice(0, 2) },
    { outputs: [core[0], core[0]] },
    { outputs: [core[0], 'unlisted.txt'] },
    { outputs: core, extractStatus: 1 },
  ]) {
    const fixture = workerFixture(options);
    await fixture.extract();
    assert.equal(fixture.messages.at(-1).type, 'error');
    assert.equal(fixture.messages.some((message) => message.type === 'done'), false);
    assert.deepEqual(fixture.modules[0].audit.unmounts, ['/input']);
    assert.ok(fixture.modules[0].audit.unlinks.length >= 1, 'Emitted MEMFS output is released on failure');
  }
});

test('WORKERFS reads retain exact bytes across cached chunk boundaries, EOF and companion changes', async () => {
  const first = Uint8Array.from({ length: 2 * 1048576 + 17 }, (_, index) => index % 251);
  const second = Uint8Array.from([31, 32, 33, 34]);
  const slices = [];
  const node = (name, bytes) => ({ size: bytes.length, contents: { slice(start, end) {
    slices.push([name, start, end]);
    return bytes.slice(start, end);
  } } });
  const fixture = workerFixture({ inspectReads(module) {
    const source = node('exe', first);
    const companion = node('bin', second);
    const read = module.WORKERFS.stream_ops.read;
    const target = new Uint8Array(80).fill(255);
    assert.equal(read({ node: source }, target, 4, 48, 1048560), 48);
    assert.deepEqual([...target.slice(4, 52)], [...first.slice(1048560, 1048608)]);
    assert.equal(read({ node: source }, target, 0, 8, 1048608), 8);
    assert.deepEqual([...target.slice(0, 8)], [...first.slice(1048608, 1048616)]);
    assert.equal(read({ node: source }, target, 0, 40, first.length - 7), 7);
    assert.deepEqual([...target.slice(0, 7)], [...first.slice(-7)]);
    assert.equal(read({ node: source }, target, 0, 8, first.length), 0);
    assert.equal(read({ node: companion }, target, 2, 8, 1), 3);
    assert.deepEqual([...target.slice(2, 5)], [32, 33, 34]);
  } });
  await fixture.extract();
  assert.equal(fixture.messages.at(-1).type, 'done');
  assert.deepEqual(slices, [['exe', 0, 1048576], ['exe', 1048576, 2097152],
    ['exe', 2097152, first.length], ['bin', 0, 4]]);
});
