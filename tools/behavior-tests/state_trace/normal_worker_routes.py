#!/usr/bin/env python3
"""Measure the bounded native normal-map acceptance suite through gse-worker.

This uses the standard immutable script snapshot and strict output parser.
Marker intervals are observed process wall time (including transport), not a
claim of original timing parity or an isolated algorithm CPU benchmark.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools/behavior-tests'))
import fast


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--timeout', type=float, default=180)
    parser.add_argument('--suite', choices=['normal-worker-routes', 'normal-worker-tubes', 'sea-worker-home-port', 'terraforming-cooperation-capacity'], default='normal-worker-routes')
    args = parser.parse_args()
    runtime = args.runtime.resolve()
    suite = [row for row in fast.load_catalog(ROOT / 'tools/behavior-tests/catalog.json')['suites'] if row['id'] == args.suite]
    if len(suite) != 1:
        raise fast.ProtocolError('Acceptance suite must have one real catalog registration')
    fast.lanes.select('regression', suite, 'all')
    snapshot = fast.canonical(fast.create_snapshot(ROOT))
    output = args.report.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    snapshot_path = output.with_suffix('.scripts.json')
    snapshot_path.write_text(snapshot)
    request = {'runtime': str(runtime), 'snapshot': str(snapshot_path), 'script': suite[0]['script'], 'prefix': '/tmp/glsmac-normal-route'}
    output.with_suffix('.request.json').write_text(fast.canonical(request))
    before_hashes = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in [runtime, runtime.with_suffix('.wasm')]}
    rss_path = output.with_suffix('.rss-kib.txt')
    start = time.monotonic()
    lines = []
    markers = []
    process = subprocess.Popen(['/usr/bin/time', '-f', '%M', '-o', str(rss_path), 'node', str(ROOT / 'tools/behavior-tests/gse-worker.cjs')],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=ROOT)
    def read():
        for line in process.stdout:
            lines.append(line)
            if re.match(r'^\s*(?:\[[^\]\r\n]+\]\s*)?NORMAL_ROUTE_', line):
                markers.append({'elapsed_ms': round((time.monotonic() - start) * 1000, 3), 'line': line.rstrip('\n')})
    reader = threading.Thread(target=read, daemon=True)
    reader.start()
    process.stdin.write(fast.canonical(request))
    process.stdin.close()
    timed_out = False
    try:
        process.wait(timeout=args.timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        # time execs/waits for node. Kill the actual worker too on timeout.
        subprocess.run(['pkill', '-KILL', '-P', str(process.pid)], check=False)
        process.kill()
        process.wait()
    reader.join(timeout=5)
    log = ''.join(lines)
    output.with_suffix('.log').write_text(log)
    reason = ''
    counts = {}
    try:
        if timed_out or reader.is_alive():
            raise fast.ProtocolError('Acceptance worker exceeded its deadline or failed to drain')
        if process.returncode != 0:
            raise fast.ProtocolError('Acceptance worker exited ' + str(process.returncode))
        counts = fast.parse_output(log)
        for path in [runtime, runtime.with_suffix('.wasm')]:
            if hashlib.sha256(path.read_bytes()).hexdigest() != before_hashes[path.name]:
                raise fast.ProtocolError('Immutable runtime changed during acceptance')
    except fast.ProtocolError as error:
        reason = str(error)
    rss_text = rss_path.read_text().strip() if rss_path.exists() else ''
    rss_lines = rss_text.splitlines()
    peak_rss = int(rss_lines[-1]) if rss_lines and rss_lines[-1].isdigit() else None
    report = {'version': 1, 'scope': 'candidate application acceptance; no original timing or route policy agreement claimed',
              'host': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'runtime': str(runtime), 'runtime_hashes': before_hashes,
              'scripts_sha256': hashlib.sha256(snapshot.encode()).hexdigest(), 'script': suite[0]['script'],
              'script_sha256': hashlib.sha256(json.loads(snapshot)[suite[0]['script']].encode()).hexdigest(),
              'candidate_executed': 'testing ./' + suite[0]['script'] in log, 'process_exit': process.returncode,
              'status': 'failed' if reason else 'passed', 'reason': reason, 'counts': counts,
              'elapsed_ms': round((time.monotonic() - start) * 1000, 3), 'worker_peak_rss_kib': peak_rss,
              'measurement': 'Linux time maximum resident set of the node WASM worker; marker times include stdout transport',
              'markers': markers}
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ['host', 'status', 'reason', 'counts', 'elapsed_ms', 'worker_peak_rss_kib']}))
    return 1 if reason else 0


if __name__ == '__main__':
    raise SystemExit(main())
