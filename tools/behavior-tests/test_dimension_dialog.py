import hashlib
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

from protocol import ProtocolError
from ui import dimension_dialog_contract as contract
from ui import dimension_dialog_headless as candidate
from ui import dimension_dialog_original as original
from ui.vision import VisionError


def case(name="first", algorithm=contract.ALGORITHM):
    return {"id": name, "algorithm": algorithm,
            "input": {"route": "random", "prior_preset": None, "text_profile": "default"}}


def marker(name="first"):
    return f"DIMENSION_RESULT|{name}|EXAMPLE|AXIS A|AXIS B|7|9|ACCEPT|BACK\n"


class DimensionDialogTests(unittest.TestCase):
    def test_exact_input_domain_and_no_expected_answer_fields(self):
        for route in ("random", "custom"):
            for prior in (None, 0, 1, 2, 3, 4):
                for profile in contract.TEXT_PROFILES:
                    contract.validate_input({"route": route, "prior_preset": prior, "text_profile": profile})
        base = case()["input"]
        for value in (None, {}, dict(base, route="other"), dict(base, prior_preset=True),
                      dict(base, prior_preset=1.0), dict(base, prior_preset=-1), dict(base, prior_preset=5),
                      dict(base, prior_preset=[]), dict(base, text_profile=[]), dict(base, text_profile="other"),
                      dict(base, expected="40")):
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                contract.validate_input(value)

    def test_candidate_returns_actual_control_text_without_replacing_values(self):
        rows = contract.parse_candidate("[./probe:1] " + marker() + "DIMENSION_DONE|1\n", [case()])
        self.assertEqual(rows[0]["output"], {"caption": "EXAMPLE", "labels": ["AXIS A", "AXIS B"],
                         "values": ["7", "9"], "buttons": ["ACCEPT", "BACK"]})

    def test_missing_duplicate_unknown_reordered_and_late_markers_fail(self):
        for output, cases in (("", [case()]), (marker(), [case()]),
                (marker() + marker() + "DIMENSION_DONE|1\n", [case()]),
                (marker("unknown") + "DIMENSION_DONE|1\n", [case()]),
                (marker("second") + marker() + "DIMENSION_DONE|2\n", [case(), case("second")]),
                (marker() + "DIMENSION_DONE|0\n", [case()]),
                (marker() + "DIMENSION_DONE|1\nDIMENSION_DONE|1\n", [case()]),
                ("DIMENSION_DONE|1\n" + marker(), [case()])):
            with self.subTest(output=output), self.assertRaises(ProtocolError):
                contract.parse_candidate(output, cases)

    def test_malformed_controls_and_runtime_failures_remain_errors(self):
        for output in (marker().replace("|7|9|", "|seven|9|"),
                       marker().replace("|AXIS A|", "||"), marker().replace("|EXAMPLE|", "||"),
                       marker() + "TEST FAILED: broken", marker() + "Unhandled exception",
                       marker() + "GSEInvalidCallError"):
            with self.subTest(output=output), self.assertRaises(ProtocolError):
                contract.parse_candidate(output + "\nDIMENSION_DONE|1\n", [case()])

    def test_unknown_original_contract_does_not_start_wine(self):
        with patch("sys.argv", ["original.py"]), \
                patch.object(original, "load_request", return_value={"cases": [case(algorithm="unknown.v1")]}), \
                patch.object(original, "capture") as capture, patch.object(original, "write_response") as write:
            original.main()
        capture.assert_not_called()
        self.assertEqual(write.call_args.args[1][0]["status"], "unsupported")

    def test_unknown_candidate_contract_does_not_start_wasm(self):
        with patch("sys.argv", ["candidate.py"]), \
                patch.object(candidate, "load_request", return_value={"cases": [case(algorithm="unknown.v1")]}), \
                patch.object(candidate, "headless") as headless, patch.object(candidate, "write_response") as write:
            candidate.main()
        headless.assert_not_called()
        self.assertEqual(write.call_args.args[1][0]["status"], "unsupported")

    def test_mixed_candidate_request_preserves_unsupported_order(self):
        row = {"id": "first", "status": "ok", "output": {}}
        with patch("sys.argv", ["candidate.py"]), \
                patch.object(candidate, "load_request", return_value={"cases": [case("unknown", "unknown.v1"), case()]}), \
                patch.object(candidate, "headless", return_value=({"name": "fixture", "kind": "candidate"}, [row])), \
                patch.object(candidate, "write_response") as write:
            candidate.main()
        self.assertEqual([r["id"] for r in write.call_args.args[1]], ["unknown", "first"])
        self.assertEqual([r["status"] for r in write.call_args.args[1]], ["unsupported", "ok"])

    def test_source_override_changes_only_declared_text_inputs(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            labels = [f"Text {n}" for n in range(contract.LABEL_COUNT)]
            raw = {"alphax.txt": b"synthetic rules\r\n", "xscript.txt": b"#CUSTOMMAP\r\n#xs 440\r\n#caption Old caption\r\n#OTHER\r\nKeep this\r\n",
                   "script.txt": b"#CUSTOMMAP\r\n#caption Common caption\r\n#END\r\n",
                   "labels.txt": ("#LABELS\r\n1131\r\n" + "\r\n".join(labels) + "\r\n").encode()}
            for name, content in raw.items():
                (directory / name).write_bytes(content)
            hashes = {name: hashlib.sha256(content).hexdigest() for name, content in raw.items()}
            with patch.object(original, "SOURCE_HASHES", hashes):
                untouched = original.text_files(directory, "default")
                modified = original.text_files(directory, "alternate")
            self.assertEqual(untouched, {name: raw[name] for name in ("labels.txt", "xscript.txt", "script.txt")})
            lines = modified["labels.txt"].decode().splitlines()[2:]
            for n, text in enumerate(lines):
                self.assertEqual(text, {1090: "Meridian", 1091: "Parallel"}.get(n, labels[n]))
            self.assertEqual(modified["xscript.txt"], raw["xscript.txt"].replace(b"Old caption", b"Alternate Dimensions"))
            self.assertEqual(modified["script.txt"], raw["script.txt"])
            self.assertEqual({name: (directory / name).read_bytes() for name in raw}, raw)

    def test_unrecognized_installed_data_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            for name in contract.SOURCE_HASHES:
                (directory / name).write_bytes(b"unrecognized")
            with self.assertRaises(ProtocolError):
                original.text_files(directory, "default")

    def test_common_caption_profile_preserves_mixed_case_source_filename(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            raw = {name: b"#CUSTOMMAP\r\n#caption Initial\r\n#END\r\n"
                   for name in contract.SOURCE_HASHES}
            raw["labels.txt"] = ("#LABELS\r\n1131\r\n" + "Text\r\n" * 1131).encode()
            for name, content in raw.items():
                (directory / ("Script.txt" if name == "script.txt" else name)).write_bytes(content)
            hashes = {name: hashlib.sha256(content).hexdigest() for name, content in raw.items()}
            with patch.object(original, "SOURCE_HASHES", hashes):
                modified = original.text_files(directory, "both")
            self.assertIn("Script.txt", modified)
            self.assertNotIn("script.txt", modified)
            self.assertIn(b"#caption Core Dimensions\r\n", modified["Script.txt"])
            self.assertIn(b"#caption Expansion Dimensions\r\n", modified["xscript.txt"])
            self.assertEqual((directory / "Script.txt").read_bytes(), raw["script.txt"])

    def test_ambiguous_case_variant_sources_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            for name in contract.SOURCE_HASHES:
                (directory / name).write_bytes(b"fixture")
            (directory / "Script.txt").write_bytes(b"fixture")
            with self.assertRaisesRegex(ProtocolError, "missing or ambiguous dimension source"):
                original.text_files(directory, "default")

    def test_missing_numeric_pixels_do_not_produce_a_guessed_value(self):
        image = SimpleNamespace(crop=lambda box: SimpleNamespace(width=3, height=3, getpixel=lambda point: (0, 0, 0)))
        with self.assertRaises(VisionError):
            original.DialogVision.number_bounds(image, (0, 0, 3, 3))

    def test_unexpected_viewport_is_not_rescaled_into_an_observation(self):
        image = SimpleNamespace(size=(800, 600)); image.convert = lambda mode: image
        observer = original.DialogVision(SimpleNamespace(Image=SimpleNamespace(open=lambda path: image)))
        with self.assertRaises(VisionError):
            observer.read("unused")


if __name__ == "__main__":
    unittest.main()
