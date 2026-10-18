"""The harness must fail closed; these synthetic fixtures are not game evidence."""

from copy import deepcopy
import io
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import compare
from protocol import (
    ProtocolError, canonical, decode_json, fingerprint, probe_request,
    validate_cases, validate_distance_input, validate_response,
)


def suite():
    return {"version": 1, "name": "Synthetic harness test", "cases": [
        {"id": "synthetic-a", "algorithm": "synthetic.v1", "input": {"value": 3}},
        {"id": "synthetic-b", "algorithm": "synthetic.v1", "input": {"value": 7}},
    ]}


def response():
    return {"version": 1, "implementation": {
        "name": "synthetic-unit-test-double", "kind": "candidate",
    }, "results": [
        {"id": "synthetic-a", "status": "ok", "output": {"value": 4}},
        {"id": "synthetic-b", "status": "ok", "output": {"value": 8}},
    ]}


def record():
    request = probe_request(suite())
    outputs = {item["id"]: item["output"] for item in response()["results"]}
    # Deliberately synthetic metadata only for testing validation, not a recording.
    return {"version": 1, "suite_sha256": fingerprint(request), "repeat": 2,
            "captured_at": "2000-01-01T00:00:00+00:00", "reference": {
                "name": "synthetic-unit-test-double", "kind": "original-executable",
                "executable_sha256": "a" * 64, "adapter_version": 1,
            }, "observations": [
                {"id": case["id"], "case_sha256": fingerprint(case), "output": outputs[case["id"]]}
                for case in request["cases"]
            ]}


class ProtocolTests(unittest.TestCase):
    def test_strict_json_rejects_duplicate_fields_and_nonfinite_numbers(self):
        for text in ('{"x":1,"x":2}', '{"x":NaN}', '{"x":Infinity}', '{"x":1e999}', '{} trailing'):
            with self.subTest(text=text), self.assertRaises(ProtocolError):
                decode_json(text)

    def test_empty_duplicate_and_accidentally_embedded_expectations_are_rejected(self):
        invalid = []
        value = suite()
        value["cases"] = []
        invalid.append(value)
        value = suite()
        value["cases"].append(value["cases"][0])
        invalid.append(value)
        value = suite()
        value["cases"][0]["expected"] = 4
        invalid.append(value)
        value = suite()
        value["version"] = True
        invalid.append(value)
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                validate_cases(value)

    def test_original_coordinate_contract_rejects_coercion_and_bad_tiles(self):
        valid = {"width": 80, "x1": 1, "x2": 79, "y": 1}
        validate_distance_input(valid)
        for updates in (
            {"width": True}, {"x1": 1.0}, {"x1": 0}, {"x2": 80}, {"width": 3},
            {"width": 81}, {"y": -1}, {"y": 4096}, {"extra": 1},
        ):
            with self.subTest(updates=updates), self.assertRaises(ProtocolError):
                validate_distance_input(valid | updates)

    def test_missing_duplicate_extra_results_and_bad_statuses_do_not_pass(self):
        invalid = []
        value = response()
        value["results"].pop()
        invalid.append(value)
        value = response()
        value["results"].append(value["results"][0])
        invalid.append(value)
        value = response()
        value["results"][0]["id"] = "other-case"
        invalid.append(value)
        value = response()
        value["results"][0]["status"] = "skip"
        invalid.append(value)
        value = response()
        value["results"][0]["ignored"] = 1
        invalid.append(value)
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                validate_response(value, suite())


class EvidenceTests(unittest.TestCase):
    def test_case_inputs_are_bound_even_when_the_id_is_unchanged(self):
        changed = suite()
        changed["cases"][0]["input"]["value"] = 42
        with self.assertRaisesRegex(ProtocolError, "different inputs"):
            compare.validate_observations(record(), changed)
        changed_record = record()
        changed_record["observations"][0]["case_sha256"] = "b" * 64
        with self.assertRaisesRegex(ProtocolError, "inputs changed"):
            compare.validate_observations(changed_record, suite())

    def test_incomplete_or_unidentified_reference_is_rejected(self):
        for field, value in (("kind", "candidate"), ("executable_sha256", "unknown"), ("adapter_version", True)):
            evidence = record()
            evidence["reference"][field] = value
            with self.subTest(field=field), self.assertRaises(ProtocolError):
                compare.validate_observations(evidence, suite())
        evidence = record()
        evidence["observations"].pop()
        with self.assertRaisesRegex(ProtocolError, "missing observations"):
            compare.validate_observations(evidence, suite())

    def test_capture_requires_repeatable_original_results_and_sends_inputs_only(self):
        original = response()
        original["implementation"] = record()["reference"]
        annotated_suite = suite()
        annotated_suite["cases"][0]["description"] = "private test rationale"
        with patch.object(compare, "run_probe", return_value=original) as run:
            captured = compare.capture_reference(annotated_suite, "synthetic command")
        self.assertEqual(run.call_count, 2)
        for call in run.call_args_list:
            self.assertEqual(call.args[1], probe_request(suite()))
            self.assertNotIn("observations", call.args[1])
        self.assertEqual(captured["reference"], original["implementation"])
        unstable = deepcopy(original)
        unstable["results"][0]["output"]["value"] += 1
        with patch.object(compare, "run_probe", side_effect=[original, unstable]):
            with self.assertRaisesRegex(ProtocolError, "nondeterministic"):
                compare.capture_reference(suite(), "synthetic command")
        unavailable = deepcopy(original)
        unavailable["results"][0] = {"id": "synthetic-a", "status": "unsupported", "reason": "not implemented"}
        with patch.object(compare, "run_probe", return_value=unavailable):
            with self.assertRaisesRegex(ProtocolError, "did not observe"):
                compare.capture_reference(suite(), "synthetic command")

    def test_existing_reference_is_protected_without_force(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "evidence.json"
            compare.write_json(path, record())
            original = path.read_bytes()
            with self.assertRaises(FileExistsError):
                compare.write_json(path, {"changed": True})
            self.assertEqual(path.read_bytes(), original)


class ComparisonTests(unittest.TestCase):
    def test_results_match_by_identity_independent_of_response_order(self):
        candidate = response()
        candidate["results"].reverse()
        report = compare.compare(suite(), record(), candidate)
        self.assertEqual(report["summary"], {"matched": 2, "mismatched": 0, "unsupported": 0, "errors": 0})

    def test_mutated_candidate_is_reported_without_changing_evidence(self):
        candidate = response()
        candidate["results"][0]["output"]["value"] = 99
        evidence = record()
        before = deepcopy(evidence)
        report = compare.compare(suite(), evidence, candidate)
        self.assertEqual(report["summary"]["mismatched"], 1)
        self.assertEqual(report["results"][0]["differences"], [
            {"path": '$["value"]', "expected": 4, "actual": 99},
        ])
        self.assertEqual(evidence, before)

    def test_exact_comparison_keeps_types_missing_values_and_trace_order(self):
        self.assertTrue(compare.differences({"x": 1}, {"x": True}))
        self.assertTrue(compare.differences({"x": 1}, {"x": 1.0}))
        self.assertTrue(compare.differences({"x": None}, {}))
        self.assertTrue(compare.differences({}, {"x": None}))
        self.assertTrue(compare.differences({"trace": [1, 2]}, {"trace": [2, 1]}))
        self.assertEqual(compare.differences({"a": 1, "b": 2}, {"b": 2, "a": 1}), [])

    def test_unsupported_and_probe_errors_are_separate_failures(self):
        candidate = response()
        candidate["results"][0] = {"id": "synthetic-a", "status": "unsupported", "reason": "pending implementation"}
        candidate["results"][1] = {"id": "synthetic-b", "status": "error", "reason": "crash"}
        report = compare.compare(suite(), record(), candidate)
        self.assertEqual(report["summary"], {"matched": 0, "mismatched": 0, "unsupported": 1, "errors": 1})

    def test_cli_exit_status_distinguishes_mismatch_and_infrastructure_error(self):
        with tempfile.TemporaryDirectory() as directory:
            cases = Path(directory) / "cases.json"
            evidence = Path(directory) / "observations.json"
            compare.write_json(cases, suite())
            compare.write_json(evidence, record())
            args = ["compare", "--cases", str(cases), "--reference", str(evidence), "--command", "synthetic"]
            candidate = response()
            candidate["results"][0]["output"]["value"] = -1
            with patch.object(compare, "run_probe", return_value=candidate), patch("sys.stdout", new=io.StringIO()):
                self.assertEqual(compare.main(args), 1)
            candidate["results"][0] = {"id": "synthetic-a", "status": "unsupported", "reason": "pending"}
            with patch.object(compare, "run_probe", return_value=candidate), patch("sys.stdout", new=io.StringIO()):
                self.assertEqual(compare.main(args), 1)
            with patch.object(compare, "run_probe", side_effect=ProtocolError("broken")), patch("sys.stderr", new=io.StringIO()):
                self.assertEqual(compare.main(args), 2)


class ProcessTests(unittest.TestCase):
    def command(self, script):
        return shlex.join([sys.executable, "-c", script])

    def test_real_process_receives_only_input_protocol_and_preserves_spaces(self):
        script = (
            "import json,sys; request=json.load(sys.stdin); "
            "assert request==" + repr(probe_request(suite())) + "; "
            "print(" + repr(canonical(response())) + ")"
        )
        actual = compare.run_probe(self.command(script), probe_request(suite()))
        self.assertEqual(actual, response())

    def test_non_json_crashes_and_timeouts_are_errors(self):
        for script in ("print('not JSON')", "raise SystemExit(3)", "import time;time.sleep(5)"):
            with self.subTest(script=script), self.assertRaises(ProtocolError):
                compare.run_probe(self.command(script), probe_request(suite()), timeout=0.2)


class ProductionCandidateTests(unittest.TestCase):
    def test_native_production_helper_matches_captured_original_observations(self):
        directory = Path(__file__).resolve().parent
        catalog = compare.read_json(directory / "catalog.json")
        command = shlex.join([sys.executable, str(directory / "glsmac.py"), "--target", "native"])
        for reference in catalog["references"]:
            with self.subTest(reference=reference["id"]):
                cases = compare.read_json(directory / reference["cases"])
                evidence = compare.read_json(directory / reference["observations"])
                candidate = compare.run_probe(command, probe_request(cases))
                report = compare.compare(cases, evidence, candidate)
                self.assertEqual(report["summary"], {"matched": len(cases["cases"]), "mismatched": 0, "unsupported": 0, "errors": 0})


if __name__ == "__main__":
    unittest.main()
