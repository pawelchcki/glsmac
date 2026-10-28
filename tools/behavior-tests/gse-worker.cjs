// Run real GSE code with fresh scripts in an isolated WASM process. No display.
const fs = require('node:fs');
const path = require('node:path');

// Emscripten's Node printer calls writeSync once and ignores a short write.
// Pipes can accept only a prefix of a large exact-JSON observation. Preserve
// all bytes on stdout/stderr; other file descriptors retain Node's behavior.
const originalWriteSync = fs.writeSync.bind(fs);
const backpressure = new Int32Array(new SharedArrayBuffer(4));
fs.writeSync = (fd, data, offsetOrOptions, length, position) => {
  if (fd !== 1 && fd !== 2) return originalWriteSync(fd, data, offsetOrOptions, length, position);
  let bytes = data, offset = offsetOrOptions;
  if (typeof data === 'string') {
    // Node accepts unknown/non-string encodings as UTF-8, but validates odd
    // hex input before writing. Delegate that error to the original overload.
    if (typeof length === 'string' && length.toLowerCase() === 'hex' && data.length % 2) {
      return originalWriteSync(fd, data, offsetOrOptions, length, position);
    }
    const encoding = typeof length === 'string' && Buffer.isEncoding(length) ? length : 'utf8';
    bytes = Buffer.from(data, encoding); // Encode once, including multibyte UTF-8.
    position = offsetOrOptions === undefined ? null : offsetOrOptions;
    offset = 0; length = bytes.byteLength;
  } else if (ArrayBuffer.isView(data)) {
    if (typeof offset === 'object') {
      ({offset = 0, length = data.byteLength - offset, position = null} = offsetOrOptions ?? {});
    }
    if (position === undefined) position = null;
    if (offset == null) offset = 0;
    // Leave Node responsible for validating invalid offset/length inputs.
    if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
      return originalWriteSync(fd, data, offset, length, position);
    }
    if (typeof length !== 'number') length = data.byteLength - offset;
  } else {
    return originalWriteSync(fd, data, offsetOrOptions, length, position);
  }
  let written = 0;
  do {
    let count;
    const at = typeof position === 'number' && Number.isInteger(position) && position >= 0 ? position + written : position;
    try {
      count = originalWriteSync(fd, bytes, offset + written, length - written, at);
    } catch (error) {
      if (error.code !== 'EINTR' && error.code !== 'EAGAIN' && error.code !== 'EWOULDBLOCK') throw error;
      // The existing parent worker timeout bounds a stalled consumer. Sleep
      // briefly while it drains instead of spinning or extending that limit.
      Atomics.wait(backpressure, 0, 0, 1);
      continue;
    }
    if (!Number.isInteger(count) || count < 0 || count > length - written || (count === 0 && written < length)) {
      throw new Error(`Invalid stdout/stderr write progress: ${count} of ${length - written} bytes`);
    }
    written += count;
  } while (written < length);
  return written;
};

const request = JSON.parse(fs.readFileSync(0, 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(request.snapshot, 'utf8'));
if (!Object.hasOwn(snapshot, request.script)) throw new Error('Test script is absent from the snapshot');
if (!Object.hasOwn(snapshot, 'GLSMAC_data/tests/_behavior.gls.js')) throw new Error('Missing behavior instrumentation');

const runtime = path.resolve(request.runtime);
// The built-in suite skips underscore files even when explicitly selected.
// Keep known failures out of that default suite, but execute an isolated alias
// when the user selects the separate, strictly failing known-issues catalog.
const scriptToRun = request.script.replace(/\/_([^/]+)$/, '/$1');
if (scriptToRun !== request.script && Object.hasOwn(snapshot, scriptToRun)) {
  throw new Error('Runtime test alias would shadow another script');
}
process.argv = [process.execPath, runtime, '--gse-tests', '--gse-tests-script',
  `./${scriptToRun}`, '--quiet', '--prefix', request.prefix];
if (request.initial_seed !== undefined) {
  const words = typeof request.initial_seed === 'string' ? request.initial_seed.split(':') : [];
  if (words.length !== 4 || words.some(word => !/^(0|[1-9][0-9]*)$/.test(word) || BigInt(word) > 0xffffffffn)) {
    throw new Error('Native seed must contain four canonical uint32 state words');
  }
  // Existing native Config/Game::Start applies this state before the declared
  // fixture's map or participants exist. Map and game logic share that RNG.
  process.argv.push('--quickstart', '--quickstart-seed', request.initial_seed);
}

// The generated CommonJS module exports before asynchronous WASM initialization.
// This hook runs after embedded files are installed and before the real main().
const Module = require(runtime);
Module.onRuntimeInitialized = () => {
  // An isolated root also blocks C++'s embedded-file fallback: a module deleted
  // from the host must not keep executing its old embedded version.
  const root = '/behavior-snapshot';
  for (const [filename, source] of Object.entries(snapshot)) {
    const destination = `${root}/${filename}`;
    Module.FS.mkdirTree(path.posix.dirname(destination));
    Module.FS.writeFile(destination, source);
  }
  Module.FS.writeFile(`${root}/${scriptToRun}`,
    "const __fast_behavior_probe = #include('./_behavior');\n" + snapshot[request.script] +
    '\n__fast_behavior_probe.finish();\n');
  Module.FS.chdir(root);
};
