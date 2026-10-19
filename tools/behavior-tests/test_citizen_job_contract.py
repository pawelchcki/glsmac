"""Fail closed before starting an original process for malformed job requests."""

import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from protocol import ProtocolError, validate_response
from ui import citizen_job_original as reference


class CitizenJobContractTests(unittest.TestCase):
    def test_declared_sequences_are_valid_without_an_original_installation(self):
        suite = json.loads((Path(__file__).parent / "ui/cases/citizen-job.json").read_text())
        for case in suite["cases"]:
            with self.subTest(case=case["id"]):
                reference.validate_input(case["input"])

    def test_rejects_malformed_actions_and_impossible_dialog_order(self):
        invalid = [None, {}, {"actions": [], "extra": True}, {"actions": {}},
                   {"actions": [True]}, {"actions": [1]}, {"actions": [None]},
                   {"actions": ["open", "open"]}, {"actions": ["confirm"]},
                   {"actions": ["cancel"]}, {"actions": ["Enter"]},
                   {"actions": ["Escape"]}, {"actions": ["ArrowDown"]},
                   {"actions": ["DOCTOR"]}, {"actions": ["WORKER"]},
                   {"actions": ["open", "unknown"]},
                   {"actions": ["open", "cancel", "Home"]},
                   {"actions": ["open", "cancel"] * 13}]
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                reference.validate_input(value)

    def assert_rejected_before_launch(self, cases):
        with patch.object(sys, "argv", ["citizen_job_original.py"]), \
                patch.object(reference, "load_request", return_value={"version": 1, "cases": cases}), \
                patch.object(reference, "OriginalDriver") as driver, \
                patch.object(reference, "JobVision") as vision:
            with self.assertRaises(ProtocolError):
                reference.main()
            driver.assert_not_called()
            vision.assert_not_called()

    def test_unrecognized_contract_cannot_launch_original(self):
        self.assert_rejected_before_launch([
            {"id": "wrong-contract", "algorithm": "ui.unrecognized.v1", "input": {"actions": []}},
        ])

    def test_late_invalid_case_is_rejected_before_any_original_launch(self):
        self.assert_rejected_before_launch([
            {"id": "valid", "algorithm": reference.ALGORITHM, "input": {"actions": ["open"]}},
            {"id": "invalid", "algorithm": reference.ALGORITHM, "input": {"actions": ["cancel"]}},
        ])

    def test_capture_writes_a_complete_protocol_response(self):
        request = {"version": 1, "cases": [
            {"id": "probe", "algorithm": reference.ALGORITHM, "input": {"actions": ["open"]}},
        ]}
        output = {"trace": [{"screen": "base", "psych_bonus": 0}]}
        with tempfile.TemporaryDirectory() as temporary, \
                patch.object(sys, "argv", ["citizen_job_original.py", "--assets", temporary,
                                            "--artifacts", temporary]), \
                patch.object(reference, "load_request", return_value=request), \
                patch.object(reference.shutil, "which", return_value="unit-test-wine"), \
                patch.object(reference, "OriginalDriver") as driver, \
                patch.object(reference, "JobVision") as vision, \
                patch.object(reference, "run_case", return_value=output), \
                patch.object(reference, "write_response") as write:
            driver.return_value.metadata = {"name": "synthetic-protocol-check", "kind": "unit-test"}
            vision.return_value.vision.version = "unit-test"
            vision.return_value.vision.model_sha256 = "0" * 64
            reference.main()
            metadata, results = write.call_args.args
            response = {"version": 1, "implementation": metadata, "results": results}
            self.assertEqual(validate_response(response, request)["probe"]["output"], output)
            driver.return_value.close.assert_called_once()
            vision.return_value.vision.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
