import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
mkdirSync(new URL('build/', import.meta.url), { recursive: true });

// Use the production Thread and Class implementation. Engine.cpp supplies the
// normal logging symbols; the linker removes the unused engine methods.
const result = spawnSync(process.env.EMXX || 'em++', [
  'thread-runtime.cpp',
  '../../src/common/Thread.cpp',
  '../../src/common/Common.cpp',
  '../../src/engine/Engine.cpp',
  '-I../../src',
  '-std=c++17',
  '-O1',
  '-g',
  '-DFASTDEBUG=1',
  '-fexceptions',
  '-pthread',
  '-sPROXY_TO_PTHREAD=1',
  '-sPTHREAD_POOL_SIZE=3',
  '-sALLOW_BLOCKING_ON_MAIN_THREAD=0',
  '-sENVIRONMENT=node',
  '-sEXIT_RUNTIME=1',
  '-sASSERTIONS=2',
  '-o', 'build/thread-runtime.cjs',
], { cwd: directory, stdio: 'inherit' });

if (result.error) {
  console.error(`Cannot run Emscripten: ${result.error.message}`);
  console.error('Activate emsdk_env.sh, or set EMXX to the em++ executable.');
}
process.exitCode = result.status ?? 1;
