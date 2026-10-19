"""UI transport, discovery and trace integrity using synthetic observations.

These are harness tests. They are never original-game reference evidence.
"""

from copy import deepcopy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from protocol import ProtocolError
from ui import discover, probe
from ui.vision import VisionError, consensus


def menu(entries, selected=None, caption=None):
    return {"kind": "sliding-menu", "caption": caption, "entries": entries,
            "selected": [] if selected is None else [selected]}


class UiContractTests(unittest.TestCase):
    def test_ocr_requires_agreement_without_a_dictionary_of_expected_labels(self):
        self.assertEqual(consensus(["NEW CONTROL", "NEW CONTROL", "NOISE"]), "NEW CONTROL")
        for readings in (["A", "B", "C"], ["", "", "A"]):
            with self.subTest(readings=readings), self.assertRaises(VisionError):
                consensus(readings)

    def test_strict_actions_do_not_accept_coordinates_or_expected_outputs(self):
        probe.validate_input({"actions": [{"choose": "START GAME"}, {"key": "Escape"}]})
        for data in ({}, {"actions": [], "expected": "MAIN"}, {"actions": None},
                     {"actions": [{}]}, {"actions": [{"choose": ""}]},
                     {"actions": [{"choose": "Start Game"}]}, {"actions": [{"key": "F12"}]},
                     {"actions": [{"key": True}]}, {"actions": [{"click": [3, 5]}]},
                     {"actions": [{"choose": "START GAME", "key": "Enter"}]},
                     {"actions": [{"key": "Escape"}] * 25}):
            with self.subTest(data=data), self.assertRaises(ProtocolError):
                probe.validate_input(data)

    def test_actions_use_observed_controls_and_capture_every_checkpoint(self):
        driver = Mock()
        first = menu(["SYNTHETIC CHOICE"], "SYNTHETIC CHOICE")
        last = menu(["SYNTHETIC RESULT"])
        controls = [{"text": "SYNTHETIC CHOICE", "x": 721, "y": 456}]
        case = discover.case_for([{"choose": "SYNTHETIC CHOICE"}, {"key": "Escape"}])
        with tempfile.TemporaryDirectory() as directory, patch.object(probe, "observe", side_effect=[
            (first, controls), (last, []), (first, controls),
        ]):
            result = probe.run_case(driver, Mock(), case, Path(directory), 2)
        self.assertEqual(result, {"completed": True, "failure": None, "trace": [first, last, first]})
        driver.reset.assert_called_once()
        driver.click.assert_called_once_with(721, 456)
        driver.key.assert_called_once_with("Escape")

    def test_missing_and_ambiguous_controls_cannot_silently_choose_another_entry(self):
        for controls in ([], [{"text": "OTHER", "x": 1, "y": 2}],
                         [{"text": "WANTED", "x": 1, "y": 2}] * 2):
            driver = Mock()
            state = menu([row["text"] for row in controls])
            with tempfile.TemporaryDirectory() as directory, patch.object(probe, "observe", return_value=(state, controls)):
                result = probe.run_case(driver, Mock(), discover.case_for([{"choose": "WANTED"}]), Path(directory), 2)
            self.assertFalse(result["completed"])
            self.assertEqual(result["trace"], [state])
            self.assertEqual(result["failure"]["kind"], "missing-or-ambiguous-control")
            driver.click.assert_not_called()

    def test_observer_requires_repeated_state_and_never_substitutes_expected_labels(self):
        first, last = menu(["A", "B"]), menu(["C", "D"])
        vision = Mock()
        vision.read.side_effect = [(first, []), VisionError("animation"), (last, []), (last, [])]
        with patch.object(probe.time, "sleep"):
            result = probe.observe(Mock(), vision, Path("synthetic.png"), 1)
        self.assertEqual(result, (last, []))
        self.assertEqual(vision.read.call_count, 4)

    def test_unreadable_screens_are_errors_rather_than_empty_matching_menus(self):
        vision = Mock()
        vision.read.side_effect = VisionError("unreadable")
        with patch.object(probe.time, "sleep"), patch.object(probe.time, "monotonic", side_effect=[0, 0, 2]):
            with self.assertRaisesRegex(VisionError, "unreadable"):
                probe.observe(Mock(), vision, Path("synthetic.png"), 1)


class UiDiscoveryTests(unittest.TestCase):
    def test_discovery_uses_original_observations_without_inventing_reference_answers(self):
        state = menu(["NEW MENU", "EXIT GAME", "QUICK START"], "NEW MENU")
        def observe(_driver, _vision, case, _path, _timeout):
            return {"trace": [deepcopy(state)], "completed": True, "failure": None}
        with tempfile.TemporaryDirectory() as directory, patch.object(discover, "run_case", side_effect=observe):
            suite, coverage = discover.discover(Mock(), Mock(), Path(directory), max_cases=8, context_depth=0)
        self.assertEqual(coverage["distinct_menus"], 1)
        self.assertEqual(len(coverage["excluded"]), 2)
        self.assertFalse(coverage["complete"])
        self.assertEqual(len(suite["cases"]), 5)
        actions = [case["input"]["actions"] for case in suite["cases"]]
        self.assertIn([{"choose": "NEW MENU"}], actions)
        self.assertIn([{"key": "ArrowDown"}], actions)
        self.assertNotIn([{"choose": "EXIT GAME"}], actions)
        for case in suite["cases"]:
            self.assertEqual(set(case), {"id", "algorithm", "input"})

    def test_discovery_preserves_blocked_edges_and_bounded_pending_work(self):
        first = {"trace": [menu(["UNSUPPORTED MODAL", "ANOTHER MENU"])], "completed": True, "failure": None}
        with tempfile.TemporaryDirectory() as directory, patch.object(discover, "run_case", side_effect=[first, VisionError("unsupported modal")]):
            suite, coverage = discover.discover(Mock(), Mock(), Path(directory), max_cases=2)
        self.assertEqual(len(suite["cases"]), 1)
        self.assertEqual(len(coverage["unobserved"]), 1)
        self.assertTrue(coverage["pending_paths"])
        self.assertFalse(coverage["complete"])

    def test_identical_visible_menus_retain_distinct_random_and_custom_routes(self):
        def observe(_driver, _vision, case, _path, _timeout):
            actions = case["input"]["actions"]
            if not actions or "key" in actions[-1]:
                state = menu(["RANDOM", "CUSTOM"])
            elif len(actions) == 1:
                state = menu(["SMALL", "LARGE"], caption="SAME SIZE MENU")
            else:
                state = menu(["STOP", "EXIT GAME"], caption="DESTINATION")
            return {"trace": [state], "completed": True, "failure": None}
        with tempfile.TemporaryDirectory() as directory, patch.object(discover, "run_case", side_effect=observe):
            suite, coverage = discover.discover(Mock(), Mock(), Path(directory), max_cases=20, context_depth=2)
        paths = [case["input"]["actions"] for case in suite["cases"]]
        for route in ("RANDOM", "CUSTOM"):
            self.assertIn([{"choose": route}, {"choose": "SMALL"}], paths)


if __name__ == "__main__":
    unittest.main()
