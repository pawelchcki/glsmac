import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
mkdirSync(new URL('build/', import.meta.url), { recursive: true });

// Use production Thread and Class; the engine-free adapter supplies logging
// symbols without pulling unrelated engine RTTI into sanitizer instrumentation.
const sources = [
  'thread-runtime.cpp',
  '../../src/common/Thread.cpp',
  '../../src/common/Common.cpp',
  'thread-log.cpp',
  '-I../../src',
  '-std=c++23',
  '-O1',
  '-g',
  '-DFASTDEBUG=1',
  '-fexceptions',
  '-pthread',
];
for (const [compiler, flags] of [
  [process.env.CXX || 'c++', ['-ffunction-sections', '-fdata-sections', '-Wl,--gc-sections', '-o', 'build/thread-runtime-native']],
  [process.env.EMXX || 'em++', ['-sPROXY_TO_PTHREAD=1', '-sPTHREAD_POOL_SIZE=3', '-sALLOW_BLOCKING_ON_MAIN_THREAD=0',
    '-sENVIRONMENT=node', '-sEXIT_RUNTIME=1', '-sASSERTIONS=2', '-o', 'build/thread-runtime.cjs']],
]) {
  const result = spawnSync(compiler, [...sources, ...flags], {cwd: directory, stdio: 'inherit'});
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
