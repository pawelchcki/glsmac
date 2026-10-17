import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
mkdirSync(new URL('build/', import.meta.url), { recursive: true });

// Real production filesystem reads run on pthreads, with asynchronous browser
// downloads on the main thread. The C++ fixture supplies embedded test bytes.
const result = spawnSync(process.env.EMXX || 'em++', [
  'asset-bridge.cpp',
  '../../src/util/FS.cpp',
  '../../src/util/BrowserAssets.cpp',
  '-I../../src',
  '-std=c++17',
  '-O1',
  '-g',
  '-fexceptions',
  '-pthread',
  '-sPROXY_TO_PTHREAD=1',
  '-sPTHREAD_POOL_SIZE=3',
  '-sALLOW_BLOCKING_ON_MAIN_THREAD=0',
  '-sENVIRONMENT=web,worker',
  '-sMODULARIZE=1',
  '-sEXPORT_NAME=createAssetBridge',
  '-sEXIT_RUNTIME=1',
  '-sASSERTIONS=2',
  '-sFORCE_FILESYSTEM=1',
  '-sEXPORTED_RUNTIME_METHODS=FS,callMain',
  '-o', 'build/asset-bridge.js',
], { cwd: directory, stdio: 'inherit' });

if (result.error) {
  console.error(`Cannot run Emscripten: ${result.error.message}`);
  console.error('Activate emsdk_env.sh, or set EMXX to the em++ executable.');
}
process.exitCode = result.status ?? 1;
