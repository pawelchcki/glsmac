import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

from protocol import ProtocolError
from ui import unit_orders_original as reference
from ui.vision import VisionError


class UnitOrdersReferenceGuards(unittest.TestCase):
    def test_public_sequences_are_bounded_valid_inputs(self):
        suite = json.loads((Path(__file__).parent / "ui/cases/unit-orders.json").read_text())
        self.assertEqual(len(suite["cases"]), len({case["id"] for case in suite["cases"]}))
        for case in suite["cases"]:
            with self.subTest(case=case["id"]):
                self.assertEqual(case["algorithm"], reference.ALGORITHM)
                reference.validate_input(case["input"])

    def test_rejects_unknown_or_unbounded_inputs(self):
        invalid = [None, [], {}, {"actions": "hold"}, {"actions": [], "year": 0},
                   {"actions": [True]}, {"actions": ["Sentry"]}, {"actions": ["hold"] * 13},
                   {"actions": ["advance"]}, {"actions": ["hold", "activate", "advance"]},
                   {"actions": ["hold", "advance", "advance", "advance"]}]
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                reference.validate_input(value)

    def test_unknown_contract_fails_before_starting_wine_or_ocr(self):
        request = {"cases": [{"id": "unknown", "algorithm": "unknown", "input": {"actions": []}}]}
        with patch.object(sys, "argv", ["unit_orders_original.py", "--artifacts", "/tmp/unused-orders-guard"]), \
                patch.object(reference, "load_request", return_value=request), \
                patch.object(reference, "OriginalDriver") as driver, \
                patch.object(reference, "OrderVision") as vision, \
                self.assertRaisesRegex(ProtocolError, "unsupported"):
            reference.main()
        driver.assert_not_called()
        vision.assert_not_called()

    def test_invalid_input_fails_before_starting_wine_or_ocr(self):
        request = {"cases": [{"id": "bad", "algorithm": reference.ALGORITHM,
                               "input": {"actions": ["teleport"]}}]}
        with patch.object(sys, "argv", ["unit_orders_original.py", "--artifacts", "/tmp/unused-orders-guard"]), \
                patch.object(reference, "load_request", return_value=request), \
                patch.object(reference, "OriginalDriver") as driver, \
                patch.object(reference, "OrderVision") as vision, self.assertRaises(ProtocolError):
            reference.main()
        driver.assert_not_called()
        vision.assert_not_called()

    def test_bad_visible_labels_cannot_be_inferred_from_other_fields(self):
        # Synthetic reader outputs: an OCR miss must fail, rather than supply
        # an expected order or reinterpret a movement label as internal state.
        for movement, order, year in [("MOVES: 0", "NO ORDERS", "2101"),
                                      ("MOVES: 1", "HALD", "2101"),
                                      ("ALREADY MOVED", "NO ORDERS", "21?1")]:
            reader = reference.OrderVision.__new__(reference.OrderVision)
            with self.subTest(movement=movement, order=order, year=year), \
                    patch.object(reader, "require_text", side_effect=VisionError("not a base screen")), \
                    patch.object(reader, "line", side_effect=[movement, order, year]), \
                    self.assertRaises(VisionError):
                reader.state(object())


if __name__ == "__main__":
    unittest.main()
