"""Candidate protocol guards; synthetic marker fixtures contain no game answers."""

import json
from pathlib import Path
import unittest

from protocol import ProtocolError
from ui import unit_orders_headless as candidate


def case(case_id="one", actions=()):
    return {"id": case_id, "algorithm": candidate.ALGORITHM, "input": {"actions": list(actions)}}


def world(index=0, year=0):
    return (f"UORD_STATE|{index}|world|{year}\n"
            "UORD_MOVEMENT|VISIBLE MOVEMENT TEXT\nUORD_ORDER|VISIBLE ORDER TEXT\nUORD_STATE_END\n")


def base(index=1, year=0):
    return f"UORD_STATE|{index}|base|{year}\nUORD_STATE_END\n"


def complete(trace=None, case_id="one"):
    return f"UORD_CASE|{case_id}\n" + (world() if trace is None else trace) + "UORD_DONE\nAll tests passed.\n"


class UnitOrdersHeadlessTests(unittest.TestCase):
    def reject(self, text, cases=None):
        with self.assertRaises(ProtocolError):
            candidate.parse_output(text, [case()] if cases is None else cases)

    def test_reads_displayed_labels_without_deriving_them(self):
        text = complete().replace("VISIBLE MOVEMENT TEXT", "  ARBITRARY\tMOVEMENT  ").replace("VISIBLE ORDER TEXT", "ORDER: ALPHA")
        result = candidate.parse_output(text, [case()])[0]
        self.assertEqual(result, {"id": "one", "status": "ok", "output": {"trace": [
            {"screen": "world", "year_delta": 0, "movement_label": "ARBITRARY MOVEMENT", "order_label": "ORDER: ALPHA"}]}})

    def test_base_checkpoint_omits_hidden_unit_labels(self):
        result = candidate.parse_output(complete(world() + base()), [case(actions=["skip"])])[0]
        self.assertEqual(result["output"]["trace"][1], {"screen": "base", "year_delta": 0})

    def test_accepts_native_years_without_calculating_order_or_advance_effects(self):
        result = candidate.parse_output(complete(world() + world(1, 1) + world(2, 2)),
                                        [case(actions=["advance", "advance"])])[0]
        self.assertEqual([row["year_delta"] for row in result["output"]["trace"]], [0, 1, 2])

    def test_rejects_partial_action_traces_and_incomplete_checkpoint(self):
        self.reject(complete(), [case(actions=["hold"])])
        self.reject(complete(world().replace("UORD_STATE_END\n", "")))
        self.reject(complete(world() + "UORD_STATE|1|world|0\n"), [case(actions=["skip"])])
        self.reject("UORD_CASE|one\n" + world() + "All tests passed.\n")

    def test_rejects_reordered_duplicate_or_missing_case_ids(self):
        self.reject(complete(case_id="two"), [case("one"), case("two")])
        self.reject(complete() + complete(), [case("one"), case("two")])
        self.reject(complete(), [case("one"), case("two")])
        self.reject(complete(case_id="unknown"))

    def test_rejects_reordered_or_duplicate_checkpoint_indices(self):
        for index in [0, 2, "01", "invalid"]:
            with self.subTest(index=index):
                self.reject(complete(world() + world(index)), [case(actions=["hold"])])

    def test_rejects_duplicate_missing_or_unknown_label_fields(self):
        for marker in ["UORD_MOVEMENT|VISIBLE MOVEMENT TEXT\n", "UORD_ORDER|VISIBLE ORDER TEXT\n"]:
            with self.subTest(marker=marker):
                self.reject(complete(world().replace(marker, "")))
                self.reject(complete(world().replace(marker, marker * 2)))
        self.reject(complete(world().replace("UORD_ORDER", "UORD_UNKNOWN_FIELD")))
        self.reject(complete(world().replace("world", "base")))
        self.reject(complete(world().replace("VISIBLE ORDER TEXT", "")))
        self.reject(complete(world().replace("VISIBLE ORDER TEXT", "lowercase")))

    def test_rejects_unknown_screens_statuses_and_extra_fields(self):
        self.reject(complete(world().replace("|world|", "|unknown|")))
        self.reject(complete(world().replace("UORD_STATE_END", "UORD_STATUS|ok\nUORD_STATE_END")))
        self.reject(complete(world().replace("|world|0", "|world|0|extra")))
        self.reject(complete().replace("UORD_DONE", "UORD_DONE|ok"))

    def test_rejects_malformed_native_year_and_nonzero_initial_delta(self):
        for value in ["-1", "3", "0.0", "true", "nan", "", "+1", "01", " 0", "1"]:
            with self.subTest(value=value):
                self.reject(complete(world().replace("|world|0", f"|world|{value}")))

    def test_rejects_explicit_engine_failure_even_with_success_marker(self):
        for marker in ["TEST FAILED", "Testing complete, passed: 0", "FATAL ERROR", "Aborted(native error)"]:
            with self.subTest(marker=marker):
                self.reject(complete() + marker + "\n")

    def test_requires_genuine_success_marker(self):
        self.reject(complete().replace("All tests passed.\n", ""))
        self.reject(complete().replace("All tests passed.", "Not All tests passed."))

    def test_explicit_control_failure_remains_error_not_partial_success(self):
        text = "UORD_CASE|one\n" + world() + "UORD_ERROR|Error|Missing actual unit control\nAll tests passed.\n"
        self.assertEqual(candidate.parse_output(text, [case(actions=["hold"])]), [
            {"id": "one", "status": "error", "reason": "Error|Missing actual unit control"}])
        self.reject(text.replace("UORD_ERROR|Error|Missing actual unit control", "UORD_ERROR"))

    def test_public_cases_are_valid_without_reading_observations(self):
        suite = json.loads((Path(__file__).parent / "ui/cases/unit-orders.json").read_text())
        for item in suite["cases"]:
            with self.subTest(case=item["id"]):
                candidate.validate_input(item["input"])

    def test_input_shape_action_bounds_and_explicit_advance_cap(self):
        candidate.validate_input({"actions": []})
        candidate.validate_input({"actions": ["hold", "advance", "advance"]})
        for value in [None, {}, {"actions": [], "extra": 1}, {"actions": {}}, {"actions": [True]},
                      {"actions": ["unknown"]}, {"actions": ["hold"] * 13}, {"actions": ["advance"] * 3}]:
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                candidate.validate_input(value)


if __name__ == "__main__":
    unittest.main()
