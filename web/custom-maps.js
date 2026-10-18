'use strict';

// Custom terrain maps use the existing persistent filesystem, separately from
// the selected installation and its lazily materialized /smac assets.
(() => {
  const directory = '/persist/glsmac/maps';
  const signature = [84, 69, 82, 82, 65, 78, 77, 65, 80, 0, 26];
  const tileOffset = 15 + 0xaa4;

  function mapName(name) {
    if (typeof name !== 'string' || !name || /[/\\:\x00-\x1f\x7f]/.test(name)
        || !/\.(mp|gsm)$/i.test(name)) {
      throw new Error('Choose .MP or .GSM map files with plain filenames.');
    }
    return name;
  }

  function dimensions(width, height) {
    return Number.isInteger(width) && Number.isInteger(height)
      && width > 0 && height > 0 && width <= 4096 && height <= 4096
      && width % 2 === 0 && height % 2 === 0;
  }

  function typedDimension(bytes, offset) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes[offset] !== 2 || view.getUint32(offset + 1, true) !== 8) return NaN;
    let checksum = 0;
    for (let index = offset + 5; index < offset + 13; ++index) checksum ^= bytes[index];
    if (checksum !== bytes[offset + 13]) return NaN;
    return Number(view.getBigInt64(offset + 5, true));
  }

  async function validate(file) {
    const name = mapName(file.name);
    const bytes = new Uint8Array(await file.slice(0, tileOffset).arrayBuffer());
    const view = new DataView(bytes.buffer);
    if (/\.mp$/i.test(name)) {
      if (bytes.length < tileOffset || !signature.every((value, index) => bytes[index] === value)
          || view.getUint32(11, true) !== 5) {
        throw new Error(`${name}: not a supported Alpha Centauri .MP map.`);
      }
      const width = view.getUint32(15, true);
      const height = view.getUint32(19, true);
      const count = width * height / 2;
      const abstractWidth = Math.floor((width + 4) / 5);
      const abstractHeight = Math.floor((height + 4) / 5);
      const abstractCount = Math.floor((abstractWidth + 1) / 2) * abstractHeight;
      if (!dimensions(width, height) || view.getUint32(35, true) !== count
          || view.getUint32(47, true) > 64
          || view.getUint32(15 + 0xa24, true) !== abstractWidth
          || view.getUint32(15 + 0xa28, true) !== abstractHeight
          || view.getUint32(15 + 0xa2c, true) !== abstractCount
          || file.size !== tileOffset + count * 44 + abstractCount) {
        throw new Error(`${name}: invalid or truncated .MP map.`);
      }
      if (view.getUint32(43, true) !== 0) {
        throw new Error(`${name}: flat maps are not supported; choose a wrapping map.`);
      }
    } else {
      if (bytes.length < 28) throw new Error(`${name}: invalid or truncated .GSM map.`);
      const width = typedDimension(bytes, 0);
      const height = typedDimension(bytes, 14);
      if (!dimensions(width, height) || file.size < 28 + width * height / 2 * 174) {
        throw new Error(`${name}: invalid or truncated .GSM map.`);
      }
    }
    // The engine validates the complete terrain records when a map is loaded.
    return { name, bytes: new Uint8Array(await file.arrayBuffer()) };
  }

  class CustomMaps {
    constructor(fs) {
      this.fs = fs;
      this.busy = false;
      this.fs.mkdirTree(directory);
    }

    list() {
      return this.fs.readdir(directory)
        .filter((name) => /\.(mp|gsm)$/i.test(name)
          && this.fs.isFile(this.fs.stat(`${directory}/${name}`).mode))
        .sort((left, right) => left.toLowerCase().localeCompare(right.toLowerCase()));
    }

    sync() {
      return new Promise((resolve, reject) => {
        this.fs.syncfs(false, (error) => error ? reject(error) : resolve());
      });
    }

    async importFiles(selectedFiles) {
      if (this.busy) throw new Error('Wait for the current map import to finish.');
      const files = [...selectedFiles];
      if (!files.length) throw new Error('Choose one or more .MP or .GSM maps first.');
      this.busy = true;
      const written = [];
      try {
        const names = new Set(this.list().map((name) => name.toLowerCase()));
        for (const file of files) {
          const name = mapName(file.name);
          const key = name.toLowerCase();
          if (names.has(key)) throw new Error(`${name}: a map with this name is already saved or selected. Rename the file before importing.`);
          names.add(key);
        }
        // Validate the entire batch before writing any file.
        const validated = [];
        for (const file of files) validated.push(await validate(file));
        for (const file of validated) {
          const path = `${directory}/${file.name}`;
          written.push(path);
          this.fs.writeFile(path, file.bytes);
        }
        await this.sync();
        return validated.map((file) => file.name);
      } catch (error) {
        for (const path of written) {
          try { this.fs.unlink(path); } catch {}
        }
        if (written.length) {
          try { await this.sync(); } catch {}
        }
        throw error;
      } finally {
        this.busy = false;
      }
    }
  }

  globalThis.GLSMACCustomMaps = { CustomMaps };
})();
