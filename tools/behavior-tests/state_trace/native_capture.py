"""Pinned candidate-only GSE transport for terrain/float observation probes."""
from pathlib import Path
import hashlib
import subprocess
import tempfile
import time

from fast import create_snapshot, parse_output
from protocol import ProtocolError, canonical, fingerprint

ROOT = Path(__file__).resolve().parents[3]
WORKER = ROOT / 'tools/behavior-tests/gse-worker.cjs'


class NativeCaptureError(ProtocolError):
    def __init__(self, message, execution, log=''):
        super().__init__(message)
        execution.setdefault('status', 'error')
        self.execution, self.log = execution, log


def seed_state(value):
    """Validate the actual native uint32 RNG state CLI, without selecting inputs."""
    if type(value) is not str or len(value.split(':')) != 4:
        raise ProtocolError('Native seed must contain four uint32 state words')
    words = value.split(':')
    if any(not word.isascii() or not word.isdecimal() or not 0 <= int(word) <= 0xffffffff
           or str(int(word)) != word for word in words):
        raise ProtocolError('Native seed must contain four canonical uint32 state words')
    return value


def capture_script(runtime, script, *, timeout=180, initial_seed=None):
    """Execute current host scripts in one immutable runtime, never reference data."""
    execution = {'candidate_executed': False, 'worker_started': False,
                 'native_execution_confirmed': False, 'process_returncode': None}
    started = time.perf_counter()
    log = ''
    try:
        if initial_seed is not None:
            seed_state(initial_seed)
            execution.update(initial_seed=initial_seed, seed_launch_flags=['--quickstart', '--quickstart-seed', initial_seed])
        runtime, script = Path(runtime).resolve(), Path(script).resolve()
        files = (runtime, runtime.with_suffix('.wasm'), WORKER, script)
        hashes = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
        snapshot = create_snapshot(ROOT)
        alias = 'GLSMAC_data/tests/terrain_observation_probe.gls.js'
        # Bind the exact emitted probe, even if its source file changes while
        # the worker is running. Read once for both digest and request.
        probe_bytes = script.read_bytes()
        hashes[str(script)] = hashlib.sha256(probe_bytes).hexdigest()
        snapshot[alias] = probe_bytes.decode('utf-8')
        execution.update(runtime_js_sha256=hashes[str(runtime)],
                         runtime_wasm_sha256=hashes[str(runtime.with_suffix('.wasm'))],
                         worker_sha256=hashes[str(WORKER)], probe_sha256=hashes[str(script)],
                         scripts_sha256=fingerprint(snapshot), timeout_s=timeout)
        with tempfile.TemporaryDirectory(prefix='terrain-native-') as temporary:
            source = Path(temporary) / 'scripts.json'
            source.write_text(canonical(snapshot))
            request_data = dict(runtime=str(runtime), snapshot=str(source), script=alias, prefix=temporary)
            if initial_seed is not None:
                request_data['initial_seed'] = initial_seed
            request = canonical(request_data)
            with subprocess.Popen(['node', str(WORKER)], stdin=subprocess.PIPE,
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  text=True, cwd=ROOT) as process:
                execution.update(candidate_executed=True, worker_started=True)
                try:
                    stdout, stderr = process.communicate(request, timeout=timeout)
                except subprocess.TimeoutExpired:
                    process.kill()
                    stdout, stderr = process.communicate()
                    execution.update(status='timeout', process_returncode=process.returncode,
                                     native_execution_confirmed='BEHAVIOR_BEGIN ' in stdout)
                    raise NativeCaptureError('Native observation timed out', execution, stdout + stderr)
        log = stdout + stderr
        execution['process_returncode'] = process.returncode
        execution['native_execution_confirmed'] = 'BEHAVIOR_BEGIN ' in log
        if any(hashlib.sha256(Path(path).read_bytes()).hexdigest() != digest for path, digest in hashes.items()):
            raise NativeCaptureError('Pinned runtime/probe changed during execution', execution, log)
        if process.returncode:
            raise NativeCaptureError('Native observation worker failed', execution, log)
        summary = parse_output(log)
        execution.update(status='ok', native_execution_confirmed=True, summary=summary)
        return log, execution
    except NativeCaptureError:
        raise
    except (OSError, ValueError, ProtocolError) as error:
        raise NativeCaptureError(str(error), execution, log) from error
    finally:
        execution['duration_s'] = round(time.perf_counter() - started, 6)
