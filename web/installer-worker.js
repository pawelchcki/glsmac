'use strict';

// The selected executable is parsed as an archive. No Windows program runs,
// and WORKERFS reads slices of the user's File instead of copying it into WASM.
let busy = false;

function gamePath(path) {
  const parts = path.split('/');
  if (!parts.length || parts.some((part) => !part || part === '.' || part === '..'
      || /[\\\x00-\x1f\x7f]/.test(part))) {
    throw new Error('The installer contains an invalid file path.');
  }
  if (['__redist', '__support', 'app'].includes(parts[0].toLowerCase())) return null;
  return parts.join('/');
}

self.onmessage = async ({ data }) => {
  if (data?.type !== 'extract' || busy) return;
  busy = true;
  let module;
  try {
    const files = [...data.files];
    const names = new Set();
    for (const file of files) {
      if (!(file instanceof File) || !file.name || /[/\\\x00-\x1f\x7f]/.test(file.name)
          || file.name === '.' || file.name === '..' || names.has(file.name.toLowerCase())) {
        throw new Error('Select the installer executable and its original companion files.');
      }
      names.add(file.name.toLowerCase());
    }
    if (!files.some((file) => file.name === data.installer && /\.exe$/i.test(file.name))) {
      throw new Error('Select a GOG offline installer executable.');
    }
    self.postMessage({ type: 'progress', message: 'Loading the installer extractor…' });
    importScripts('innoextract.js');
    let phase = 'list';
    const listing = [];
    const errors = [];
    module = await createInnoextract({
      noInitialRun: true,
      noExitRuntime: true,
      print(message) { if (phase === 'list') listing.push(message); },
      printErr(message) {
        errors.push(String(message));
        if (errors.length > 8) errors.shift();
      },
    });
    module.FS.mkdirTree('/input');
    module.FS.mkdirTree('/out');
    module.FS.mount(module.WORKERFS, { files }, '/input');
    // C++ streams request small reads. Buffer one 1 MiB slice so extraction
    // does not make a FileReaderSync call for every few kilobytes of input.
    let readCache;
    module.WORKERFS.stream_ops.read = (stream, buffer, offset, length, position) => {
      const node = stream.node;
      const available = Math.min(length, Math.max(0, node.size - position));
      let copied = 0;
      while (copied < available) {
        const cursor = position + copied;
        if (!readCache || readCache.node !== node || cursor < readCache.start
            || cursor >= readCache.start + readCache.bytes.byteLength) {
          const start = Math.floor(cursor / 1048576) * 1048576;
          const chunk = node.contents.slice(start, Math.min(start + 1048576, node.size));
          readCache = { node, start, bytes: new Uint8Array(module.WORKERFS.reader.readAsArrayBuffer(chunk)) };
        }
        const start = cursor - readCache.start;
        const count = Math.min(available - copied, readCache.bytes.byteLength - start);
        if (!count) throw new Error('The installer input could not be read.');
        buffer.set(readCache.bytes.subarray(start, start + count), offset + copied);
        copied += count;
      }
      return copied;
    };
    const input = `/input/${data.installer}`;
    const invoke = (extract) => module.ccall('ExtractInstaller', 'number', ['string', 'number'],
      [input, extract], { async: true });
    self.postMessage({ type: 'progress', message: 'Checking the installer contents…' });
    if (await invoke(0) !== 0) {
      throw new Error(errors.join('\n') || 'This is not a supported Inno Setup installer.');
    }
    const expected = new Set(listing.filter((path) => path && !path.endsWith('/'))
      .map(gamePath).filter(Boolean));
    const lowercase = new Set([...expected].map((path) => path.toLowerCase()));
    if (!lowercase.has('alpha.txt') || !lowercase.has('arialnb.ttf')
        || !lowercase.has('openinga.pcx')
        || (!lowercase.has('terran.exe') && !lowercase.has('terranx.exe'))) {
      throw new Error('This installer does not contain the Alpha Centauri game files.');
    }
    phase = 'extract';
    let count = 0;
    let bytes = 0;
    const extracted = new Set();
    module.onExtractedFile = async (path) => {
      if (!path.startsWith('/out/')) throw new Error('Unexpected installer output path.');
      const relative = gamePath(path.slice('/out/'.length));
      try {
        if (!relative) return;
        if (!expected.has(relative) || extracted.has(relative)) {
          throw new Error('The installer produced an unexpected or duplicate game file.');
        }
        const content = module.FS.readFile(path);
        const blob = new Blob([content]);
        self.postMessage({ type: 'file', path: relative, blob });
        extracted.add(relative);
        ++count;
        bytes += content.byteLength;
        if (count % 10 === 0 || count === expected.size) {
          self.postMessage({ type: 'progress', message: `Unpacking game files: ${count} / ${expected.size}` });
        }
      } finally {
        // The callback is awaited by Asyncify before decompression continues.
        // Retain the completed Blob, while releasing this file's MEMFS bytes.
        module.FS.unlink(path);
      }
    };
    if (await invoke(1) !== 0) {
      throw new Error(module.extractorError || errors.join('\n') || 'The installer could not be unpacked.');
    }
    if (extracted.size !== expected.size) throw new Error('The installer did not produce all expected game files.');
    self.postMessage({ type: 'done', files: count, bytes });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || String(error) });
  } finally {
    if (module) {
      try { module.FS.unmount('/input'); } catch {}
    }
    busy = false;
  }
};
