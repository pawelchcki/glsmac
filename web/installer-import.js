'use strict';

(() => {
  async function extract(selectedFiles, { onProgress = () => {} } = {}) {
    const files = [...selectedFiles];
    const installers = files.filter((file) => /\.exe$/i.test(file.name));
    if (installers.length !== 1) throw new Error('Select one GOG installer EXE, together with any companion BIN files.');
    if (files.some((file) => !/\.(exe|bin)$/i.test(file.name))) {
      throw new Error('Select the installer EXE and its companion BIN files only.');
    }
    const worker = new Worker(new URL('installer-worker.js', document.baseURI));
    const extracted = [];
    onProgress('Opening the GOG installer on your device…');
    try {
      return await new Promise((resolve, reject) => {
        worker.onerror = () => reject(new Error('The installer unpacker could not run. Reload the website and try again.'));
        worker.onmessageerror = () => reject(new Error('The installer unpacker returned unreadable data.'));
        worker.onmessage = ({ data }) => {
          try {
            if (data.type === 'progress') {
              onProgress(data.message);
            } else if (data.type === 'file') {
              const path = data.path;
              if (typeof path !== 'string' || !path || /[\\\x00-\x1f\x7f]/.test(path)
                  || path.split('/').some((part) => !part || part === '.' || part === '..')) {
                throw new Error('The installer contains an invalid game file path.');
              }
              const file = new File([data.blob], path.split('/').at(-1), {
                lastModified: installers[0].lastModified,
              });
              Object.defineProperty(file, 'webkitRelativePath', { value: `Installation/${path}` });
              extracted.push(file);
              onProgress(`Unpacked ${extracted.length} game files…`);
            } else if (data.type === 'done') {
              if (!extracted.length) throw new Error('The installer contains no compatible game files.');
              resolve(extracted);
            } else if (data.type === 'error') {
              reject(new Error(data.message || 'Could not unpack this GOG installer.'));
            }
          } catch (error) {
            reject(error);
          }
        };
        worker.postMessage({ type: 'extract', files, installer: installers[0].name });
      });
    } finally {
      worker.terminate();
    }
  }

  globalThis.GLSMACInstaller = { extract };
})();
