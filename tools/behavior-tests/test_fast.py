"""Fail-closed output parsing and isolation/concurrency checks for the fast lane."""

from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import fast
from protocol import ProtocolError


GOOD = "BEHAVIOR_BEGIN first\nBEHAVIOR_PASS first\nBEHAVIOR_SUMMARY 1 3\nAll tests passed.\n"


class OutputTests(unittest.TestCase):
    def test_node_worker_preserves_short_writes_and_multibyte_output(self):
        result = subprocess.run(
            ['node', '--test', str(fast.DIRECTORY / 'gse-worker-output.test.cjs')],
            cwd=fast.ROOT, capture_output=True, text=True, timeout=30,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_success_requires_real_assertions_and_complete_named_scenarios(self):
        self.assertEqual(fast.parse_output(GOOD), {
            "scenarios": 1, "assertions": 3, "scenario_names": ["first"],
        })
        for bad in (
            GOOD.replace("All tests passed.", ""),
            GOOD + "!!! TEST FAILED: assertion\n",
            GOOD.replace("BEHAVIOR_PASS first\n", ""),
            GOOD.replace("SUMMARY 1 3", "SUMMARY 0 3"),
            GOOD.replace("SUMMARY 1 3", "SUMMARY 1 0"),
            GOOD.replace("SUMMARY 1 3", "SUMMARY 2 3"),
            GOOD + "BEHAVIOR_SUMMARY 1 3\n",
            GOOD.replace("BEHAVIOR_SUMMARY", "BEHAVIOR_BEGIN first\nBEHAVIOR_PASS first\nBEHAVIOR_SUMMARY"),
        ):
            with self.subTest(output=bad), self.assertRaises(ProtocolError):
                fast.parse_output(bad)

    def test_older_assertion_only_scripts_are_counted_as_one_file_scenario(self):
        result = fast.parse_output("BEHAVIOR_SUMMARY 1 9\nAll tests passed.\n")
        self.assertEqual(result["scenario_names"], [])
        self.assertEqual(result["assertions"], 9)


class CatalogTests(unittest.TestCase):
    def test_duplicate_scripts_empty_suites_and_false_parity_claims_are_rejected(self):
        base = {"version": 1, "suites": [{
            "id": "test-one", "script": "GLSMAC_data/tests/example.gls.js",
            "domains": ["ui"], "evidence": "glsmac-regression",
        }]}
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "catalog.json"
            path.write_text(json.dumps(base))
            self.assertEqual(fast.load_catalog(path), base)
            for changed in (
                base | {"version": True}, base | {"suites": []},
                base | {"suites": base["suites"] * 2},
                base | {"suites": [base["suites"][0], base["suites"][0] | {"id": "test-two"}]},
                base | {"suites": [base["suites"][0] | {"evidence": "original-parity"}]},
                base | {"suites": [base["suites"][0] | {"script": "../outside.gls.js"}]},
            ):
                path.write_text(json.dumps(changed))
                with self.subTest(catalog=changed), self.assertRaises(ProtocolError):
                    fast.load_catalog(path)

    def test_snapshot_captures_host_edits_without_mutating_the_host(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for directory in ("GLSMAC_data/tests", "GLSMAC_data/default"):
                (root / directory).mkdir(parents=True)
            script = root / "GLSMAC_data/tests/example.gls.js"
            script.write_text("test.assert(true);")
            snapshot = fast.create_snapshot(root)
            script.write_text("test.assert(false);")
            self.assertEqual(snapshot["GLSMAC_data/tests/example.gls.js"], "test.assert(true);")
            self.assertEqual(script.read_text(), "test.assert(false);")


class WorkerTests(unittest.TestCase):
    def suite(self, suite_id="test-one"):
        return {"id": suite_id, "script": "GLSMAC_data/tests/example.gls.js",
                "domains": ["ui"], "evidence": "glsmac-regression"}

    def run_worker(self, source, timeout=2):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            worker = root / "synthetic-worker.py"
            worker.write_text(source)
            return fast.run_suite(self.suite(), root / "unused.js", root / "snapshot.json",
                                  root, timeout, node=sys.executable, worker=worker)

    def test_crash_cannot_pass_even_with_success_output(self):
        result = self.run_worker(f"print({GOOD!r}); raise SystemExit(3)")
        self.assertEqual(result["status"], "failed")
        self.assertIn("exited 3", result["reason"])

    def test_worker_failures_timeout_and_partial_output_remain_failures(self):
        for source in (
            "print('All tests passed.')",
            "print('BEHAVIOR_BEGIN incomplete')",
            "import time; time.sleep(5)",
        ):
            with self.subTest(source=source):
                self.assertEqual(self.run_worker(source, timeout=0.2)["status"], "failed")

    def test_parallel_workers_use_distinct_prefixes_and_start_before_either_finishes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            worker = root / "synthetic-worker.py"
            # This barrier fails if the probes become sequential. No sleep-based
            # performance threshold is used to decide whether concurrency worked.
            worker.write_text(
                "import json,sys,time\nfrom pathlib import Path\n"
                "request=json.load(sys.stdin)\n"
                "root=Path(request['snapshot']).parent\n"
                "marker=root/(request['prefix'].split('/')[-1]+'.started')\n"
                "marker.write_text(request['prefix'])\n"
                "deadline=time.monotonic()+2\n"
                "while len(list(root.glob('*.started')))<2:\n"
                "    if time.monotonic()>deadline: raise SystemExit(4)\n"
                "    time.sleep(0.005)\n"
                f"print({GOOD!r})\n"
            )
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda suite: fast.run_suite(
                    suite, root / "unused.js", root / "snapshot.json", root, 4,
                    node=sys.executable, worker=worker,
                ), [self.suite("first"), self.suite("second")]))
            self.assertTrue(all(result["status"] == "passed" for result in results), results)
            prefixes = {path.read_text() for path in root.glob("*.started")}
            self.assertEqual(len(prefixes), 2)


@unittest.skipUnless((fast.ROOT / "build/wasm/bin/GLSMAC.js").is_file(), "build the FastDebug WASM engine to test the real loader")
class RealLoaderTests(unittest.TestCase):
    def run_snapshot(self, snapshot, script):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / "snapshot.json"
            path.write_text(json.dumps(snapshot))
            suite = {"id": "loader-probe", "script": script, "domains": ["gameplay"], "evidence": "glsmac-regression"}
            return fast.run_suite(suite, fast.ROOT / "build/wasm/bin/GLSMAC.js", path, root, 15)

    def test_new_host_script_runs_without_being_embedded(self):
        snapshot = fast.create_snapshot()
        script = "GLSMAC_data/tests/loader_probe.gls.js"
        snapshot[script] = "test.assert(true); #print('FRESH_TEST_SOURCE_EXECUTED');"
        result = self.run_snapshot(snapshot, script)
        self.assertEqual(result["status"], "passed", result)
        self.assertEqual(result["assertions"], 1)

    def test_deleted_production_module_cannot_fall_back_to_embedded_version(self):
        snapshot = fast.create_snapshot()
        del snapshot["GLSMAC_data/default/resources.gls.js"]
        result = self.run_snapshot(snapshot, "GLSMAC_data/tests/resources.gls.js")
        self.assertEqual(result["status"], "failed", result)
        self.assertIn("Could not find script for include", result["log"])

    def test_explicit_underscore_probe_executes_and_fails_instead_of_being_skipped(self):
        snapshot = fast.create_snapshot()
        script = "GLSMAC_data/tests/_known_loader_probe.gls.js"
        snapshot[script] = "test.assert(false, 'KNOWN_PROBE_REALLY_EXECUTED');"
        result = self.run_snapshot(snapshot, script)
        self.assertEqual(result["status"], "failed", result)
        self.assertIn("KNOWN_PROBE_REALLY_EXECUTED", result["log"])


if __name__ == "__main__":
    unittest.main()
