#!/usr/bin/env python3
"""Run headless production regression scripts and reject logged test failures."""
import argparse
from pathlib import Path
import subprocess
import sys
import tempfile
import hashlib
import json
import time

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ["gc", "combat_rollback_regression", "unit_menu_order_lifecycle", "starvation_notice_controls", "typescript_boundary", "land_resource_sources"]

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--binary", type=Path, default=ROOT / "build/native/bin/GLSMAC")
parser.add_argument("--report-dir", type=Path, default=ROOT / "build/cpp-quality/native-tests")
args = parser.parse_args()
args.report_dir.mkdir(parents=True, exist_ok=True)
failed = False
binary = args.binary.resolve()
with binary.open("rb") as executable:
    runtime_hash = hashlib.file_digest(executable, "sha256").hexdigest()
results = []
for script in SCRIPTS:
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="glsmac-quality-") as prefix:
        result = subprocess.run([str(args.binary.resolve()), "--prefix", prefix,
                                 "--gse-tests", "--gse-tests-script",
                                 f"GLSMAC_data/tests/{script}.gls.js", "--quiet"], cwd=ROOT,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=120)
    (args.report_dir / f"{script}.log").write_text(result.stdout)
    # The legacy test process may return zero after logging a failed assertion.
    success = result.returncode == 0 and "All tests passed." in result.stdout and "TEST FAILED" not in result.stdout
    print(f"{script}: {'PASS' if success else 'FAIL'}", flush=True)
    results.append({"script": script, "passed": success, "exit_code": result.returncode,
                    "seconds": round(time.monotonic() - started, 3)})
    failed |= not success
(args.report_dir / "result.json").write_text(json.dumps({
    "runtime_sha256": runtime_hash, "llvm": json.loads(
        (ROOT / "tools/cpp-quality/toolchain.json").read_text())["llvm"],
    "scripts": results, "passed": not failed}, indent=2) + "\n")
sys.exit(int(failed))
