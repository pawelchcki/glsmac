"""Strict candidate transport checks; synthetic values are not reference evidence."""

from copy import deepcopy
import io
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from economy import headless, run
from protocol import ProtocolError


def case(case_id="fixture"):
    return {"id": case_id, "algorithm": headless.ALGORITHM, "input": {
        "faction_id": 1, "base_id": 0, "x": 0, "y": 0,
        "land": True, "river": False, "headquarters": False, "recycling_tanks": False,
    }}


def output(ids=("fixture",)):
    markers = [f"HECO_RESULT|{case_id}|2|1|1" for case_id in ids]
    return "\n".join(markers + [f"HECO_DONE|{len(ids)}", f"BEHAVIOR_SUMMARY 1 {len(ids) * 3}", "All tests passed."])


class EconomyCandidateTests(unittest.TestCase):
    def test_input_validation_rejects_unknown_fields_types_and_unrecorded_fixture(self):
        original = case()["input"]
        headless.validate_input(original)
        bad = [dict(original, answer=3), dict(original, faction_id=True), dict(original, base_id=2),
               dict(original, x=2), dict(original, y=1), dict(original, faction_id=0),
               dict(original, faction_id=8), dict(original, land=1), dict(original, recycling_tanks=0),
               dict(original, land=False, river=True), dict(original, x=4, y=4)]
        missing = dict(original)
        del missing["headquarters"]
        for data in bad + [missing, None]:
            with self.subTest(data=data), self.assertRaises(ProtocolError):
                headless.validate_input(data)

    def test_gse_literal_preserves_boolean_and_string_types(self):
        self.assertEqual(headless.gse_literal({"flag": True, "off": False, "number": 1}), "{flag:true,off:false,number:1}")
        self.assertEqual(headless.gse_literal("a'b\\c\n"), "'a\\'b\\\\c\\n'")
        for data in (None, 1.5, {"bad-field": 0}):
            with self.subTest(data=data), self.assertRaises(ProtocolError):
                headless.gse_literal(data)

    def test_parser_accepts_real_print_prefix_and_signed_integer_observations(self):
        text = output().replace("HECO_RESULT|fixture|2|1|1", "[print] HECO_RESULT|fixture|-2|1|1")
        observed = headless.parse_output(text, [case()])
        self.assertEqual(observed[0]["output"], {"NUTRIENTS": -2, "MINERALS": 1, "ENERGY": 1})

    def test_parser_rejects_missing_duplicate_reordered_and_malformed_results(self):
        good = output(("first", "second"))
        first = "HECO_RESULT|first|2|1|1"
        second = "HECO_RESULT|second|2|1|1"
        invalid = [good.replace(first + "\n", ""), good.replace(second, first),
                   good.replace(first, second).replace(second + "\nHECO_DONE", first + "\nHECO_DONE"),
                   good.replace(first, first + "|extra"), good.replace(first, "HECO_RESULT|first|true|1|1"),
                   good.replace(first, "HECO_RESULT|first|2.0|1|1"),
                   good.replace(first, "HECO_RESULT|first|02|1|1"), good.replace(first, "garbage " + first),
                   good.replace(first, "HECO_UNKNOWN|first"), good.replace("HECO_DONE|2", "HECO_DONE|1"),
                   good.replace("HECO_DONE|2", ""), good + "\nHECO_DONE|2", good + "\n" + first]
        for text in invalid:
            with self.subTest(text=text), self.assertRaises(ProtocolError):
                headless.parse_output(text, [case("first"), case("second")])

    def test_parser_requires_engine_success_exact_assertions_and_complete_summary(self):
        good = output()
        for text in (good.replace("All tests passed.", ""), good + "\nTEST FAILED",
                     good.replace("BEHAVIOR_SUMMARY 1 3", "BEHAVIOR_SUMMARY 1 0"),
                     good.replace("BEHAVIOR_SUMMARY 1 3", "BEHAVIOR_SUMMARY 1 6"),
                     good + "\nBEHAVIOR_SUMMARY 1 3", good.replace("BEHAVIOR_SUMMARY 1 3", "")):
            with self.subTest(text=text), self.assertRaises(ProtocolError):
                headless.parse_output(text, [case()])

    def test_unknown_algorithm_is_unsupported_without_executing_a_runtime(self):
        unknown = dict(case(), algorithm="economy.unknown.v1")
        with patch.object(headless, "runtime_hashes") as hashes, patch.object(headless.fast, "create_snapshot") as snapshot:
            _, rows = headless.replay([unknown])
        hashes.assert_not_called()
        snapshot.assert_not_called()
        self.assertEqual(rows[0]["status"], "unsupported")

    def test_invalid_input_fails_before_any_worker_or_snapshot(self):
        invalid = case()
        invalid["input"]["expected"] = {"NUTRIENTS": 2}
        with patch.object(headless.fast, "create_snapshot") as snapshot, self.assertRaises(ProtocolError):
            headless.replay([invalid])
        snapshot.assert_not_called()

    def test_worker_receives_inputs_only_and_immutable_script_snapshot(self):
        original = {"GLSMAC_data/tests/_behavior.gls.js": "instrumentation", "production": "unchanged"}
        hashes = {"runtime_js_sha256": "js", "runtime_sha256": "wasm"}
        requests = []

        def execute(command, **kwargs):
            from protocol import decode_json
            request = decode_json(kwargs["input"])
            snapshot = decode_json(Path(request["snapshot"]).read_text())
            source = snapshot[request["script"]]
            self.assertEqual(snapshot["production"], "unchanged")
            self.assertNotIn("expected", source)
            self.assertNotIn("description", source)
            self.assertIn("land:true", source)
            self.assertEqual(kwargs["timeout"], 30)
            requests.append(request)
            case_id = "first" if "id:'first'" in source else "second"
            return SimpleNamespace(returncode=0, stdout=output((case_id,)), stderr="")

        cases = [dict(case("first"), description="expected answers never reach the fixture"), case("second")]
        saved = deepcopy(cases)
        with tempfile.TemporaryDirectory() as directory, patch.object(headless, "runtime_hashes", return_value=hashes), \
                patch.object(headless.fast, "create_snapshot", return_value=original) as snapshot, \
                patch.object(headless.subprocess, "run", side_effect=execute):
            metadata, rows = headless.replay(cases, jobs=2, batch_size=1, log_directory=directory)
        snapshot.assert_called_once()
        self.assertEqual(cases, saved)
        self.assertEqual(original, {"GLSMAC_data/tests/_behavior.gls.js": "instrumentation", "production": "unchanged"})
        self.assertEqual([row["id"] for row in rows], ["first", "second"])
        self.assertEqual(len({request["snapshot"] for request in requests}), 2)
        self.assertEqual(len({request["prefix"] for request in requests}), 2)
        self.assertEqual(metadata["runtime_sha256"], "wasm")
        self.assertEqual(len(metadata["scripts_sha256"]), 64)

    def test_runtime_change_worker_failure_and_timeout_are_strict_failures(self):
        hashes = {"runtime_sha256": "before"}
        errors = [SimpleNamespace(returncode=1, stdout="", stderr="crash"),
                  subprocess.TimeoutExpired("node", 30, output=b"partial output")]
        for response in errors:
            with self.subTest(response=response), tempfile.TemporaryDirectory() as directory, \
                    patch.object(headless, "runtime_hashes", return_value=hashes), \
                    patch.object(headless.fast, "create_snapshot", return_value={}), \
                    patch.object(headless.subprocess, "run", side_effect=response if isinstance(response, Exception) else None,
                                 return_value=response), self.assertRaises(ProtocolError):
                headless.replay([case()], log_directory=directory)
        with tempfile.TemporaryDirectory() as directory, \
                patch.object(headless, "runtime_hashes", side_effect=[hashes, {"runtime_sha256": "after"}]), \
                patch.object(headless.fast, "create_snapshot", return_value={}), \
                patch.object(headless.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout=output(), stderr="")), \
                self.assertRaisesRegex(ProtocolError, "runtime changed"):
            headless.replay([case()], log_directory=directory)

    def test_validate_only_reports_evidence_without_candidate_agreement(self):
        with tempfile.TemporaryDirectory() as directory, patch("sys.stdout", new=io.StringIO()):
            report = Path(directory) / "validation.json"
            self.assertEqual(run.main(["--validate-only", "--report", str(report)]), 0)
            from protocol import decode_json
            observed = decode_json(report.read_text())
        self.assertFalse(observed["summary"]["candidate_executed"])
        self.assertNotIn("matched", observed["summary"])
        self.assertEqual(observed["summary"]["reference_cases"], 504)


if __name__ == "__main__":
    unittest.main()
