// Existing headless GSE execution, with an optional native RNG state input.
const fs = require('node:fs');
const path = require('node:path');
const request = JSON.parse(fs.readFileSync(0, 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(request.snapshot, 'utf8'));
if (!Object.hasOwn(snapshot, request.script)) throw Error('Missing trace script');
const runtime = path.resolve(request.runtime);
process.argv = [process.execPath, runtime, '--gse-tests', '--gse-tests-script',
  `./${request.script}`, '--quiet', '--prefix', request.prefix];
if (request.rng_state !== null) process.argv.push('--quickstart', '--quickstart-seed', request.rng_state);
const Module = require(runtime);
Module.onRuntimeInitialized = () => {
  const root = '/state-trace-snapshot';
  for (const [filename, source] of Object.entries(snapshot)) {
    const destination = `${root}/${filename}`;
    Module.FS.mkdirTree(path.posix.dirname(destination));
    Module.FS.writeFile(destination, source);
  }
  Module.FS.chdir(root);
};
