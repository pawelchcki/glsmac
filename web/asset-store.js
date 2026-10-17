'use strict';

// Game reads happen on WASM workers. This manager performs asynchronous file
// and network I/O on the browser thread, materializing only requested files.
(() => {
  const hashPattern = /^[a-f0-9]{64}$/;
  const mount = '/smac';

  function safePath(path) {
    if (typeof path !== 'string' || !path || /[\\\x00-\x1f\x7f]/.test(path)
        || path.split('/').some((part) => !part || part === '.' || part === '..')) {
      throw new Error(`Invalid asset path: ${String(path)}`);
    }
    return path;
  }

  async function digest(bytes) {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function manifestFiles(files, remote) {
    if (!Array.isArray(files) || !files.length) throw new Error('The asset manifest contains no files.');
    const paths = new Set();
    const result = files.map((entry) => {
      const path = safePath(entry.path);
      if (paths.has(path)) throw new Error(`Duplicate asset: ${path}`);
      paths.add(path);
      if (!Number.isSafeInteger(entry.size) || entry.size < 0) throw new Error(`Invalid asset size: ${path}`);
      if (remote && !hashPattern.test(entry.sha256)) throw new Error(`Missing SHA-256 for asset: ${path}`);
      return { path, size: entry.size, ...(remote ? { sha256: entry.sha256 } : {}) };
    });
    for (const path of paths) {
      const parts = path.split('/');
      parts.pop();
      while (parts.length) {
        if (paths.has(parts.join('/'))) throw new Error(`Asset conflicts with a directory: ${path}`);
        parts.pop();
      }
    }
    return result.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error || new Error('Browser storage transaction was aborted.'));
      transaction.onerror = () => {}; // onabort reports the transaction failure.
    });
  }

  class AssetStore {
    constructor({ fs, databaseName = 'glsmac-assets-v1', onStatus = () => {} }) {
      if (!fs) throw new Error('The game filesystem is required.');
      this.fs = fs;
      this.databaseName = databaseName;
      this.onStatus = onStatus;
      this.current = null;
      this.entries = new Map();
      this.loaded = new Set();
      this.pending = new Map();
      this.database = null;
    }

    async open() {
      if (this.database) return this;
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('datasets', { keyPath: 'id' });
        const files = request.result.createObjectStore('assets', { keyPath: 'key' });
        files.createIndex('dataset', 'dataset');
        request.result.createObjectStore('settings');
      };
      this.database = await requestResult(request);
      this.database.onversionchange = () => this.database.close();
      this.fs.mkdirTree(mount);
      return this;
    }

    async operation(store, mode, action) {
      if (!this.database) await this.open();
      const transaction = this.database.transaction(store, mode);
      const done = transactionDone(transaction);
      // Register the completion handlers before awaiting any request.
      const result = await Promise.all([requestResult(action(transaction.objectStore(store))), done]);
      return result[0];
    }

    async list() {
      const records = await this.operation('datasets', 'readonly', (store) => store.getAll());
      return records.sort((left, right) => right.lastUsed - left.lastUsed);
    }

    async save(record) {
      if (!this.database) await this.open();
      const transaction = this.database.transaction(['datasets', 'settings'], 'readwrite');
      const done = transactionDone(transaction);
      try {
        transaction.objectStore('datasets').put(record);
        transaction.objectStore('settings').put(record.id, 'selected');
      } catch (error) {
        transaction.abort();
        await done.catch(() => {});
        throw error;
      }
      await done;
    }

    removeTree(path) {
      for (const name of this.fs.readdir(path)) {
        if (name === '.' || name === '..') continue;
        const child = `${path}/${name}`;
        if (this.fs.isDir(this.fs.stat(child).mode)) {
          this.removeTree(child);
          this.fs.rmdir(child);
        } else {
          this.fs.unlink(child);
        }
      }
    }

    activate(record) {
      if (this.pending.size) throw new Error('Wait for asset downloads to finish before changing the source.');
      this.removeTree(mount);
      this.entries = new Map(record.files.map((file) => [file.path, file]));
      this.loaded.clear();
      for (const file of record.files) {
        const path = `${mount}/${file.path}`;
        this.fs.mkdirTree(path.slice(0, path.lastIndexOf('/')));
        this.fs.writeFile(path, new Uint8Array(0));
        // Metadata is available for discovery without downloading file bodies.
        this.fs.lookupPath(path).node.usedBytes = file.size;
      }
      this.current = record;
      this.onStatus(`${record.label}: ${record.files.length} assets available on demand.`);
    }

    async restore(id) {
      id ||= await this.operation('settings', 'readonly', (store) => store.get('selected'));
      if (!id) return false;
      const record = await this.operation('datasets', 'readonly', (store) => store.get(id));
      if (!record) return false;
      record.files = manifestFiles(record.files, record.kind === 'remote');
      record.lastUsed = Date.now();
      await this.save(record);
      this.activate(record);
      return true;
    }

    async useRemote(manifestURL) {
      const url = new URL(manifestURL, document.baseURI);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS asset manifest URL.');
      this.onStatus('Reading hosted asset manifest…');
      const response = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Asset manifest returned HTTP ${response.status}.`);
      const manifest = await response.json();
      if (manifest.version !== 1 || !hashPattern.test(manifest.id)) throw new Error('Unsupported asset manifest.');
      const files = manifestFiles(manifest.files, true);
      const record = {
        id: manifest.id, kind: 'remote', label: `Hosted assets (${url.hostname})`,
        manifestURL: response.url || url.href, files, lastUsed: Date.now(),
      };
      await this.save(record);
      this.activate(record);
      return record;
    }

    async importFiles(selectedFiles, { label = 'Local game files' } = {}) {
      const selected = [...selectedFiles];
      if (!selected.length) throw new Error('Select a game folder first.');
      const entries = selected.map((file) => {
        const parts = (file.webkitRelativePath || file.name).split('/');
        if (file.webkitRelativePath) parts.shift();
        return { path: safePath(parts.join('/')), size: file.size, file, modified: file.lastModified };
      });
      const files = manifestFiles(entries, false);
      const fingerprint = entries.map(({ path, size, modified }) => ({ path, size, modified }))
        .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
      const id = `local-${await digest(new TextEncoder().encode(JSON.stringify(fingerprint)))}`;
      const record = { id, kind: 'local', label, files, lastUsed: Date.now() };
      // Store File/Blob objects directly; no full-folder copy into WASM memory.
      // Commit the files and source together. A failed import must not leave
      // orphaned blobs or overwrite files in a previously saved installation.
      if (!this.database) await this.open();
      const transaction = this.database.transaction(['assets', 'datasets', 'settings'], 'readwrite');
      const done = transactionDone(transaction);
      try {
        const assets = transaction.objectStore('assets');
        for (const [index, entry] of entries.entries()) {
          this.onStatus(`Saving local game files: ${index + 1} / ${entries.length}`);
          assets.put({ key: `${id}\0${entry.path}`, dataset: id, blob: entry.file });
        }
        transaction.objectStore('datasets').put(record);
        transaction.objectStore('settings').put(id, 'selected');
      } catch (error) {
        transaction.abort();
        await done.catch(() => {});
        throw error;
      }
      await done;
      this.activate(record);
      return record;
    }

    async ensureFile(path) {
      if (!this.current || !path.startsWith(`${mount}/`)) return false;
      const relative = safePath(path.slice(mount.length + 1));
      const entry = this.entries.get(relative);
      if (!entry) throw new Error(`Asset is missing from the selected source: ${relative}`);
      if (this.loaded.has(relative)) return true;
      if (!this.pending.has(relative)) {
        const promise = this.materialize(relative, entry).finally(() => this.pending.delete(relative));
        this.pending.set(relative, promise);
      }
      return this.pending.get(relative);
    }

    async materialize(path, entry) {
      const record = this.current;
      const key = `${record.id}\0${path}`;
      let cached = await this.operation('assets', 'readonly', (store) => store.get(key));
      let bytes = cached ? new Uint8Array(await cached.blob.arrayBuffer()) : null;
      const valid = async (data) => data && data.byteLength === entry.size
        && (!entry.sha256 || await digest(data) === entry.sha256);
      if (bytes && !await valid(bytes)) {
        await this.operation('assets', 'readwrite', (store) => store.delete(key));
        cached = null;
        bytes = null;
      }
      if (!bytes) {
        if (record.kind === 'local') throw new Error(`Saved asset is unavailable; reselect your game folder: ${path}`);
        this.onStatus(`Downloading ${path}…`);
        const encoded = path.split('/').map(encodeURIComponent).join('/');
        const url = new URL(encoded, new URL('.', record.manifestURL));
        let response;
        try {
          response = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
        } catch (error) {
          throw new Error(`Could not download ${path}. Check the connection and asset host CORS settings. ${error.message}`);
        }
        if (!response.ok) throw new Error(`Could not download ${path}: HTTP ${response.status}.`);
        bytes = new Uint8Array(await response.arrayBuffer());
        if (!await valid(bytes)) throw new Error(`Asset verification failed (size or SHA-256): ${path}`);
        await this.operation('assets', 'readwrite', (store) => store.put({
          key, dataset: record.id, blob: new Blob([bytes]),
        }));
      }
      this.fs.writeFile(`${mount}/${path}`, bytes);
      this.loaded.add(path);
      this.onStatus(`Loaded ${path} from ${cached ? 'browser storage' : record.kind === 'local' ? 'local files' : 'the asset host'}.`);
      return true;
    }

    async clear(id) {
      if (this.pending.size) throw new Error('Wait for asset downloads to finish before clearing storage.');
      if (!id) {
        await this.operation('assets', 'readwrite', (store) => store.clear());
        await this.operation('datasets', 'readwrite', (store) => store.clear());
        await this.operation('settings', 'readwrite', (store) => store.clear());
      } else {
        const transaction = this.database.transaction('assets', 'readwrite');
        const done = transactionDone(transaction);
        const request = transaction.objectStore('assets').index('dataset').openCursor(IDBKeyRange.only(id));
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) { cursor.delete(); cursor.continue(); }
        };
        await done;
        await this.operation('datasets', 'readwrite', (store) => store.delete(id));
        if (await this.operation('settings', 'readonly', (store) => store.get('selected')) === id) {
          await this.operation('settings', 'readwrite', (store) => store.delete('selected'));
        }
      }
      if (!id || this.current?.id === id) {
        this.removeTree(mount);
        this.current = null;
        this.entries.clear();
        this.loaded.clear();
      }
    }
  }

  globalThis.GLSMACAssets = { AssetStore };
})();
