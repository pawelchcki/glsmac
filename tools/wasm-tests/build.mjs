import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
mkdirSync(new URL('build/', import.meta.url), { recursive: true });

const result = spawnSync(process.env.EMXX || 'em++', [
  'canvas.cpp',
  '-std=c++17',
  '-O1',
  '-g',
  '-Wall',
  '-Wextra',
  '-Werror',
  '--no-entry',
  '-sMODULARIZE=1',
  '-sENVIRONMENT=web,node',
  '-sMIN_WEBGL_VERSION=2',
  '-sMAX_WEBGL_VERSION=2',
  '-sASSERTIONS=2',
  '-sGL_ASSERTIONS=1',
  '-sALLOW_MEMORY_GROWTH=1',
  '-sEXPORTED_RUNTIME_METHODS=HEAPU8',
  '-o', 'build/canvas.cjs',
], { cwd: directory, stdio: 'inherit' });

if (result.error) {
  console.error(`Cannot run Emscripten: ${result.error.message}`);
  console.error('Activate emsdk_env.sh, or set EMXX to the em++ executable.');
}
process.exitCode = result.status ?? 1;
