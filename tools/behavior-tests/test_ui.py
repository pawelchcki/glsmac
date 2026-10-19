"""UI transport, discovery and trace integrity using synthetic observations.

These are harness tests. They are never original-game reference evidence.
"""

from copy import deepcopy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from protocol import ProtocolError
from ui import discover, probe, run
from ui.vision import MenuVision, VisionError, consensus


def menu(entries, selected=None, caption=None):
    return {"kind": "sliding-menu", "caption": caption, "entries": entries,
            "selected": [] if selected is None else [selected]}


class UiContractTests(unittest.TestCase):
    def test_render_profile_validates_both_references_and_includes_custom_flow(self):
        with tempfile.TemporaryDirectory() as directory, patch("sys.stdout", new=io.StringIO()):
            report = Path(directory) / "validation.json"
            self.assertEqual(run.main(["--render-smoke", "--validate-only", "--report", str(report)]), 0)
            observed = json.loads(report.read_text())
        self.assertFalse(observed["summary"]["candidate_executed"])
        self.assertEqual(observed["summary"]["reference_cases"], 7)
        self.assertEqual({row["id"] for row in observed["results"]}, {"menus", "navigation"})
        selected = [case for row in observed["results"] for case in row["selected_case_ids"]]
        self.assertIn("menu-8d46dd28eda8", selected)
        self.assertTrue(all(row["source_suite_sha256"] for row in observed["results"]))

    def cached_observer(self):
        # Synthetic pixel buffers exercise caching without Pillow/Tesseract.
        observer = MenuVision.__new__(MenuVision)
        observer.Image = Mock()
        image = observer.Image.open.return_value.convert.return_value.resize.return_value
        image.tobytes.return_value = b"synthetic pixels"
        observer.observations = {}
        observer.read_image = Mock(return_value=(menu(["ACTUAL"], "ACTUAL"), [{"text": "ACTUAL", "x": 4, "y": 5}]))
        return observer, image

    def test_pixel_cache_reuses_exact_pixels_and_isolates_mutable_results(self):
        observer, image = self.cached_observer()
        first = observer.read("same-path.png")
        first[0]["entries"][0] = "CALLER MUTATION"
        first[1][0]["x"] = 999
        second = observer.read("different-path.png")
        self.assertEqual(second[0]["entries"], ["ACTUAL"])
        self.assertEqual(second[1][0]["x"], 4)
        observer.read_image.assert_called_once()
        image.tobytes.return_value = b"changed rendered pixels"
        observer.read("same-path.png")
        self.assertEqual(observer.read_image.call_count, 2)

    def test_failed_observation_never_enters_pixel_cache(self):
        observer, _ = self.cached_observer()
        observer.read_image.side_effect = VisionError("unsupported frame")
        for _ in range(2):
            with self.assertRaises(VisionError):
                observer.read("frame.png")
        self.assertEqual(observer.observations, {})
        self.assertEqual(observer.read_image.call_count, 2)

    def test_pixel_cache_is_bounded_and_evicted_pixels_require_observation(self):
        observer, image = self.cached_observer()
        for index in range(129):
            image.tobytes.return_value = str(index).encode()
            observer.read("frame.png")
        self.assertEqual(len(observer.observations), 128)
        observer.read("frame.png")
        self.assertEqual(observer.read_image.call_count, 129)
        image.tobytes.return_value = b"0"
        observer.read("frame.png")
        self.assertEqual(observer.read_image.call_count, 130)

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
