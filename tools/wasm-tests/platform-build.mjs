import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
mkdirSync(new URL('build/', import.meta.url), { recursive: true });

// Compile the real filesystem, UUID, request queue and browser network backends.
// Engine.cpp supplies the normal Class logging symbols; unused engine code is
// removed by the linker. No game engine or graphics context is constructed.
const result = spawnSync(process.env.EMXX || 'em++', [
  'platform.cpp',
  '../../src/util/UUID.cpp',
  '../../src/util/FS.cpp',
  '../../src/common/Mutex.cpp',
  '../../src/common/Common.cpp',
  '../../src/engine/Engine.cpp',
  '../../src/network/Network.cpp',
  '../../src/network/impl/Browser.cpp',
  '../../src/network/simpletcp/Browser.cpp',
  '-I../../src',
  '-std=c++17',
  '-O1',
  '-g',
  '-DFASTDEBUG=1',
  '-fexceptions',
  '--no-entry',
  '-sMODULARIZE=1',
  '-sENVIRONMENT=web,node',
  '-sASSERTIONS=2',
  '-sEXPORTED_RUNTIME_METHODS=UTF8ToString,ccall,FS',
  '-o', 'build/platform.cjs',
], { cwd: directory, stdio: 'inherit' });

if (result.error) {
  console.error(`Cannot run Emscripten: ${result.error.message}`);
  console.error('Activate emsdk_env.sh, or set EMXX to the em++ executable.');
}
process.exitCode = result.status ?? 1;
