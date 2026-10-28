import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
mkdirSync(new URL('build/', import.meta.url), { recursive: true });
const sources = ['buffer-copy.cpp', '../../src/types/Buffer.cpp', '../../src/common/Common.cpp',
  '-I../../src', '-std=c++23', '-O1', '-g', '-fexceptions', '-ffunction-sections', '-fdata-sections'];
for (const [compiler, flags] of [
  [process.env.CXX || 'c++', ['-fsanitize=address', '-fno-omit-frame-pointer', '-Wl,--gc-sections', '-o', 'build/buffer-copy-native']],
  [process.env.EMXX || 'em++', ['-sENVIRONMENT=node', '-sEXIT_RUNTIME=1', '-sASSERTIONS=2', '-o', 'build/buffer-copy.cjs']],
]) {
  const result = spawnSync(compiler, [...sources, ...flags], { cwd: directory, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
