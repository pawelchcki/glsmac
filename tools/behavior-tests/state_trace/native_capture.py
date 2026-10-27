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


def capture_script(runtime, script, *, timeout=180):
    """Execute current host scripts in one immutable runtime, never reference data."""
    execution = {'candidate_executed': False, 'worker_started': False,
                 'native_execution_confirmed': False, 'process_returncode': None}
    started = time.perf_counter()
    log = ''
    try:
        runtime, script = Path(runtime).resolve(), Path(script).resolve()
        files = (runtime, runtime.with_suffix('.wasm'), WORKER, script)
        hashes = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
        snapshot = create_snapshot(ROOT)
        alias = 'GLSMAC_data/tests/terrain_observation_probe.gls.js'
        snapshot[alias] = script.read_text()
        execution.update(runtime_js_sha256=hashes[str(runtime)],
                         runtime_wasm_sha256=hashes[str(runtime.with_suffix('.wasm'))],
                         worker_sha256=hashes[str(WORKER)], probe_sha256=hashes[str(script)],
                         scripts_sha256=fingerprint(snapshot), timeout_s=timeout)
        with tempfile.TemporaryDirectory(prefix='terrain-native-') as temporary:
            source = Path(temporary) / 'scripts.json'
            source.write_text(canonical(snapshot))
            request = canonical(dict(runtime=str(runtime), snapshot=str(source),
                                     script=alias, prefix=temporary))
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
