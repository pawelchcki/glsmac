// Run native engine tests and the supplied current GSE partition in a fresh FS.
// Omitting --gse-tests-script is intentional: that flag skips the C++ tests.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');

// Export only the real adapter boundaries for asset-free fake-FS tests. Importing
// this module never requires a runtime or executes a native/game entrypoint.
async function prepareSnapshot(snapshot) {
  const {nativeFontPath,nativeResourceBytes,nativeResources}=await import('./gse-shards.mjs');
  if (!snapshot || !Object.hasOwn(snapshot, 'GLSMAC_data/tests/_behavior.gls.js') ||
      !Object.hasOwn(snapshot, 'GLSMAC_data/default/main.gls.js')) {
    throw new Error('The complete current production and test snapshot is required');
  }
  const resources=nativeResources(snapshot),font=nativeResourceBytes(snapshot),scripts=[];
  for (const [filename,source] of Object.entries(snapshot)) {
    if(filename===nativeFontPath)continue;
    if (!/^GLSMAC_data\/(default|tests)\/.+\.gls\.js$/.test(filename) ||
        path.posix.normalize(filename) !== filename || typeof source!=='string') {
      throw new Error(`Unexpected script snapshot path/type: ${filename}`);
    }
    scripts.push([filename,source]);
  }
  return {scripts,font,resources};
}

function mountSnapshot(FS,prepared,print=console.log) {
  const root='/full-gse-snapshot';
  for(const [filename,source] of prepared.scripts) {
    const destination=`${root}/${filename}`;
    FS.mkdirTree(path.posix.dirname(destination));FS.writeFile(destination,source);
  }
  const identity=prepared.resources[0],destination=`${root}/${identity.path}`;
  FS.mkdirTree(path.posix.dirname(destination));
  FS.writeFile(destination,new Uint8Array(prepared.font));
  const actual=Buffer.from(FS.readFile(destination));
  assert.ok(actual.equals(prepared.font),'Mounted native font bytes differ');
  assert.equal(actual.length,identity.bytes);
  assert.equal(createHash('sha256').update(actual).digest('hex'),identity.sha256);
  // Includes removed from the host cannot fall back to old embedded scripts.
  FS.chdir(root);
  print('GSE_NATIVE_RESOURCES|'+JSON.stringify({version:1,resources:prepared.resources}));
  const mounted=FS.readdir(`${root}/GLSMAC_data/tests`)
    .filter(name=>/^[^_/.][^/]*\.gls\.js$/.test(name)).sort()
    .map(name=>`GLSMAC_data/tests/${name}`);
  print('GSE_MOUNTED_ENTRIES|'+JSON.stringify(mounted));
}

async function run() {
  const {runtime,snapshot,prefix}=JSON.parse(fs.readFileSync(0,'utf8'));
  const prepared=await prepareSnapshot(snapshot); // Fail before any runtime require.
  const executable=path.resolve(runtime);
  process.argv=[process.execPath,executable,'--gse-tests','--quiet','--prefix',prefix];
  const Module=require(executable);
  Module.onRuntimeInitialized=()=>mountSnapshot(Module.FS,prepared);
}

module.exports={prepareSnapshot,mountSnapshot};
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
