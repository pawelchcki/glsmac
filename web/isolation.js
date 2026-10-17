'use strict';

// GitHub Pages cannot configure response headers. A service worker adds the
// isolation headers to same-origin responses before the game runtime starts.
(() => {
  const scriptURL = new URL(document.currentScript?.src || './isolation.js', document.baseURI);
  const workerURL = new URL('coi-serviceworker.js', scriptURL);
  const scope = new URL('./', scriptURL);
  const reloadKey = `glsmac-isolation-reloaded:${scope.pathname}`;

  function waitForActivation(worker) {
    if (!worker) return Promise.reject(new Error('The isolation service worker did not install.'));
    if (worker.state === 'activated') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(timer);
        worker.removeEventListener('statechange', changed);
        error ? reject(error) : resolve();
      };
      const changed = () => {
        if (worker.state === 'activated') finish();
        else if (worker.state === 'redundant') finish(new Error('The isolation service worker could not activate.'));
      };
      const timer = setTimeout(() => finish(new Error('Timed out preparing browser isolation.')), 20000);
      worker.addEventListener('statechange', changed);
      changed();
    });
  }

  function waitForControl() {
    const controlled = () => navigator.serviceWorker.controller?.scriptURL === workerURL.href;
    if (controlled()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener('controllerchange', changed);
        error ? reject(error) : resolve();
      };
      const changed = () => { if (controlled()) finish(); };
      const timer = setTimeout(() => finish(new Error('The isolation service worker could not control this page.')), 20000);
      navigator.serviceWorker.addEventListener('controllerchange', changed);
      changed();
    });
  }

  async function prepare({ onStatus = () => {} } = {}) {
    if (globalThis.crossOriginIsolated) {
      if (typeof SharedArrayBuffer === 'undefined') throw new Error('This browser does not support shared WASM memory.');
      // An already isolated running game must not register an update or reload.
      try { sessionStorage.removeItem(reloadKey); } catch {}
      return;
    }
    if (!globalThis.isSecureContext || !navigator.serviceWorker) {
      throw new Error('This build needs HTTPS and service worker support. Local development also works on localhost.');
    }
    let reloaded;
    try {
      reloaded = sessionStorage.getItem(reloadKey);
    } catch {
      throw new Error('Enable browser storage to prepare this game.');
    }
    if (reloaded) {
      throw new Error('Browser isolation could not be enabled. Check that service workers are allowed for this website.');
    }
    onStatus('Preparing this browser for WASM threads…');
    const registration = await navigator.serviceWorker.register(workerURL.href, {
      scope: scope.pathname,
      updateViaCache: 'none',
    });
    await waitForActivation(registration.installing || registration.waiting || registration.active);
    await waitForControl();
    sessionStorage.setItem(reloadKey, '1');
    onStatus('Reloading once to enable WASM threads…');
    location.reload();
    // Only the reloaded, isolated page may continue to load the game runtime.
    await new Promise(() => {});
  }

  globalThis.GLSMACIsolation = { prepare };
})();
