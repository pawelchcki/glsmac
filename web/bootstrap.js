'use strict';

const statusElement = document.getElementById('status');
const startButton = document.getElementById('start');
const assetInput = document.getElementById('assets');
const installerInput = document.getElementById('installer');
const sourceInput = document.getElementById('asset-source');
const remoteInput = document.getElementById('asset-url');
const cachedInput = document.getElementById('cached-assets');
const clearButton = document.getElementById('clear-assets');
const storageElement = document.getElementById('storage-status');
const canvas = document.getElementById('canvas');
const logElement = document.getElementById('log');
const configuration = globalThis.GLSMAC_CONFIG || {};
remoteInput.value = new URL(configuration.assetManifestURL || './assets/manifest.json', document.baseURI).href;

function setStatus(message) {
  statusElement.textContent = message;
}

function log(message) {
  logElement.textContent += `${message}\n`;
  logElement.scrollTop = logElement.scrollHeight;
}

function updateSource() {
  for (const section of document.querySelectorAll('[data-source]')) {
    section.hidden = section.dataset.source !== sourceInput.value;
  }
}
sourceInput.addEventListener('change', updateSource);
assetInput.addEventListener('change', () => { sourceInput.value = 'local'; updateSource(); });
installerInput.addEventListener('change', () => { sourceInput.value = 'installer'; updateSource(); });

async function updateSavedSources() {
  const datasets = await Module.assetStore.list();
  cachedInput.replaceChildren(...datasets.map((dataset) => {
    const option = document.createElement('option');
    option.value = dataset.id;
    option.textContent = `${dataset.label} — ${dataset.files.length} files`;
    return option;
  }));
  clearButton.disabled = datasets.length === 0;
  storageElement.textContent = datasets.length
    ? 'Saved assets are available after reload. Hosted files are cached as the game requests them.'
    : 'Local files and downloaded assets will be saved in this browser.';
  return datasets;
}

async function initializeAssets() {
  try {
    Module.assetStore = new GLSMACAssets.AssetStore({ fs: Module.FS, onStatus: setStatus });
    await Module.assetStore.open();
    const datasets = await updateSavedSources();
    sourceInput.value = datasets.length ? 'cached' : configuration.assetManifestURL ? 'remote' : 'installer';
    startButton.disabled = false;
    assetInput.disabled = false;
    installerInput.disabled = false;
    sourceInput.disabled = false;
    remoteInput.disabled = false;
    updateSource();
    document.body.dataset.state = 'ready';
    setStatus('Ready. Choose where to load your game assets.');
  } catch (error) {
    log(error.stack || String(error));
    setStatus(`Could not open browser storage: ${error.message}`);
    document.body.dataset.state = 'failed';
  }
}

// Configure before loading Emscripten; main starts after source selection.
var Module = {
  canvas,
  noInitialRun: true,
  print: log,
  printErr: log,
  onAbort(reason) {
    setStatus(`GLSMAC stopped: ${reason}`);
    document.body.dataset.state = 'failed';
  },
  onExit(code) {
    setStatus(`GLSMAC exited (${code}).`);
    document.body.dataset.state = code === 0 ? 'exited' : 'failed';
  },
  preRun: [() => {
    const fs = Module.FS;
    fs.mkdirTree('/persist');
    fs.mkdirTree('/smac');
    fs.mount(Module.IDBFS, { autoPersist: true }, '/persist');
    Module.addRunDependency('restore-settings');
    fs.syncfs(true, (error) => {
      if (error) log(`Settings could not be restored: ${error}`);
      Module.removeRunDependency('restore-settings');
    });
  }],
  onRuntimeInitialized: initializeAssets,
};

clearButton.addEventListener('click', async () => {
  clearButton.disabled = true;
  startButton.disabled = true;
  try {
    await Module.assetStore.clear(cachedInput.value);
    const remaining = await updateSavedSources();
    if (!remaining.length) sourceInput.value = 'installer';
    updateSource();
    setStatus('Saved assets removed.');
  } catch (error) {
    setStatus(`Could not remove saved assets: ${error.message}`);
    clearButton.disabled = false;
  } finally {
    startButton.disabled = false;
  }
});

startButton.addEventListener('click', async () => {
  const controls = [startButton, assetInput, installerInput, sourceInput, remoteInput, cachedInput, clearButton];
  for (const control of controls) control.disabled = true;
  let started = false;
  try {
    if (sourceInput.value === 'installer') {
      const files = await GLSMACInstaller.extract(installerInput.files, { onProgress: setStatus });
      await Module.assetStore.importFiles(files, { label: 'GOG Alpha Centauri installation' });
    } else if (sourceInput.value === 'local') {
      await Module.assetStore.importFiles(assetInput.files, {
        label: assetInput.files[0]?.webkitRelativePath.split('/')[0] || 'Local game files',
      });
    } else if (sourceInput.value === 'remote') {
      await Module.assetStore.useRemote(remoteInput.value);
    } else if (sourceInput.value === 'cached') {
      if (!await Module.assetStore.restore(cachedInput.value)) throw new Error('Select a saved asset source.');
    }
    navigator.storage?.persist?.().catch(() => {});
    document.getElementById('setup').hidden = true;
    document.body.dataset.state = 'running';
    setStatus('GLSMAC is running.');
    canvas.focus();
    started = true;
    Module.callMain(['--windowed', '--smacpath', '/smac']);
  } catch (error) {
    log(error.stack || String(error));
    setStatus(`Could not start GLSMAC: ${error.message}`);
    document.body.dataset.state = started ? 'failed' : 'ready';
    if (!started) {
      for (const control of controls) control.disabled = false;
      await updateSavedSources();
    }
  }
});

updateSource();
async function loadApplication() {
  try {
    document.body.dataset.state = 'loading';
    await GLSMACIsolation.prepare({ onStatus: setStatus });
    const script = document.createElement('script');
    script.src = 'GLSMAC.js';
    script.onerror = () => Module.onAbort('Could not load GLSMAC.js');
    document.body.append(script);
  } catch (error) {
    log(error.stack || String(error));
    Module.onAbort(error.message || String(error));
  }
}
loadApplication();
