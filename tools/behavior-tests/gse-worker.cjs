// Run real GSE code with fresh scripts in an isolated WASM process. No display.
const fs = require('node:fs');
const path = require('node:path');

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
