"""Reference integrity checks must never be confused with candidate parity."""

from copy import deepcopy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import audit
import compare
from protocol import ProtocolError


class AuditTests(unittest.TestCase):
    def test_every_recorded_suite_is_registered_exactly_once(self):
        references = audit.load_references(audit.DIRECTORY / "catalog.json")
        self.assertEqual({item["cases"] for item in references}, {
            path.relative_to(audit.DIRECTORY).as_posix() for path in (audit.DIRECTORY / "cases").glob("*.json")
        })
        self.assertEqual({item["observations"] for item in references}, {
            path.relative_to(audit.DIRECTORY).as_posix() for path in (audit.DIRECTORY / "observations").glob("*.json")
        })

    def test_validation_does_not_claim_candidate_execution(self):
        reference = audit.load_references(audit.DIRECTORY / "catalog.json")[1]
        with patch.object(compare, "run_probe", side_effect=AssertionError("candidate must not run")):
            result = audit.check_reference(reference)
        self.assertTrue(result["observations_validated"])
        self.assertFalse(result["candidate_executed"])
        self.assertNotIn("comparison", result)

    def test_original_only_specs_remain_unsupported_and_never_match(self):
        reference = audit.load_references(audit.DIRECTORY / "catalog.json")[1]
        suite = compare.read_json(audit.DIRECTORY / reference["cases"])
        unsupported = {"version": 1, "implementation": {"name": "synthetic-test-double", "kind": "candidate"},
                       "results": [{"id": case["id"], "status": "unsupported", "reason": "pending"} for case in suite["cases"]]}
        with patch.object(compare, "run_probe", return_value=unsupported):
            result = audit.check_reference(reference, command="synthetic")
        self.assertTrue(result["candidate_executed"])
        self.assertEqual(result["comparison"]["summary"], {
            "matched": 0, "mismatched": 0, "unsupported": len(suite["cases"]), "errors": 0,
        })

    def test_changed_inputs_cannot_reuse_reference_evidence(self):
        reference = audit.load_references(audit.DIRECTORY / "catalog.json")[0]
        suite = compare.read_json(audit.DIRECTORY / reference["cases"])
        evidence = compare.read_json(audit.DIRECTORY / reference["observations"])
        suite["cases"][0]["input"]["x1"] += 2
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            compare.write_json(directory / reference["cases"], suite)
            compare.write_json(directory / reference["observations"], evidence)
            with patch.object(compare, "run_probe", side_effect=AssertionError("must reject before execution")):
                with self.assertRaisesRegex(ProtocolError, "different inputs"):
                    audit.check_reference(reference, "synthetic", directory=directory)

    def test_duplicate_and_traversing_reference_paths_are_rejected(self):
        base = {"version": 1, "references": audit.load_references(audit.DIRECTORY / "catalog.json")}
        invalid = []
        invalid.append({"references": []})
        invalid.append({"references": [base["references"][0], base["references"][0]]})
        changed = deepcopy(base)
        changed["references"][0]["cases"] = "cases/../outside.json"
        invalid.append(changed)
        changed = deepcopy(base)
        changed["references"][1]["observations"] = changed["references"][0]["observations"]
        invalid.append(changed)
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "catalog.json"
            for catalog in invalid:
                path.write_text(json.dumps(catalog))
                with self.subTest(catalog=catalog), self.assertRaises(ProtocolError):
                    audit.load_references(path)

    def test_full_validation_report_is_explicitly_not_a_parity_result(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "report.json"
            with patch("sys.stdout", new=io.StringIO()):
                self.assertEqual(audit.main(["--validate-only", "--report", str(path)]), 0)
            report = compare.read_json(path)
            self.assertEqual(report["kind"], "original-evidence-validation")
            self.assertFalse(report["summary"]["candidate_executed"])
            self.assertNotIn("matched", report["summary"])
            self.assertEqual(report["summary"]["reference_cases"], sum(item["cases"] for item in report["results"]))


if __name__ == "__main__":
    unittest.main()
