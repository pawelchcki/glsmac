// Run native engine tests and the supplied current GSE partition in a fresh FS.
// Omitting --gse-tests-script is intentional: that flag skips the C++ tests.
const fs = require('node:fs');
const path = require('node:path');

const {runtime, snapshot, prefix} = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!snapshot || !Object.hasOwn(snapshot, 'GLSMAC_data/tests/_behavior.gls.js') ||
    !Object.hasOwn(snapshot, 'GLSMAC_data/default/main.gls.js')) {
  throw new Error('The complete current production and test snapshot is required');
}
for (const filename of Object.keys(snapshot)) {
  if (!/^GLSMAC_data\/(default|tests)\/.+\.gls\.js$/.test(filename) || path.posix.normalize(filename) !== filename) {
    throw new Error(`Unexpected script snapshot path: ${filename}`);
  }
}
const executable = path.resolve(runtime);
process.argv = [process.execPath, executable, '--gse-tests', '--quiet', '--prefix', prefix];
const Module = require(executable);
Module.onRuntimeInitialized = () => {
  const root = '/full-gse-snapshot';
  for (const [filename, source] of Object.entries(snapshot)) {
    const destination = `${root}/${filename}`;
    Module.FS.mkdirTree(path.posix.dirname(destination));
    Module.FS.writeFile(destination, source);
  }
  // Includes removed from the host cannot fall back to old embedded scripts.
  Module.FS.chdir(root);
  const mounted = Module.FS.readdir(`${root}/GLSMAC_data/tests`)
    .filter(name=>/^[^_/.][^/]*\.gls\.js$/.test(name)).sort()
    .map(name=>`GLSMAC_data/tests/${name}`);
  console.log('GSE_MOUNTED_ENTRIES|' + JSON.stringify(mounted));
};
