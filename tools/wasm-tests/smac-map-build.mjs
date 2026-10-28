import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

mkdirSync(new URL('build/', import.meta.url), { recursive: true });
const result = spawnSync(process.env.EMXX || 'em++', [
  'smac-map.cpp', '../../src/game/backend/map/SMACMap.cpp',
  '-I../../src', '-std=c++23', '-O1', '-g', '-fexceptions', '-Wall', '-Wextra', '-Werror',
  '--no-entry', '-sMODULARIZE=1', '-sENVIRONMENT=node', '-sASSERTIONS=2',
  '-sEXPORTED_RUNTIME_METHODS=ccall,UTF8ToString',
  '-o', 'build/smac-map.cjs',
], { cwd: fileURLToPath(new URL('.', import.meta.url)), stdio: 'inherit' });
if (result.error) console.error(`Cannot run Emscripten: ${result.error.message}`);
process.exitCode = result.status ?? 1;
