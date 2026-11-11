import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
mkdirSync(new URL('build/', import.meta.url), { recursive: true });
const result = spawnSync(process.env.EMCC || 'emcc', [
  'proxy-context-lifetime.c', '-O0', '-pthread',
  '-sPROXY_TO_PTHREAD=1', '-sPTHREAD_POOL_SIZE=1', '-sEXIT_RUNTIME=1',
  '-Wl,--wrap=pthread_mutex_lock', '-Wl,--wrap=pthread_mutex_unlock',
  '-Wl,--wrap=pthread_cond_signal', '-o', 'build/proxy-context.cjs',
], { cwd: directory, stdio: 'inherit' });
if (result.error) console.error(`Cannot run Emscripten: ${result.error.message}`);
process.exitCode = result.status ?? 1;
