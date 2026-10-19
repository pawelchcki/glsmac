"""Headless transport and emulator guards; synthetic programs are not evidence."""

import importlib.util
import itertools
import json
from pathlib import Path
import struct
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import audit
import compare
import original
from protocol import ProtocolError
from ui import generate_custom, headless, original_headless as controller


DIRECTORY = Path(__file__).parent / "ui"


def custom_case(name="synthetic", choices=()):
    return {"id": name, "algorithm": controller.ALGORITHM,
            "input": {"choices": list(choices), "preferences": [1, 1, 1, 1]}}


class HeadlessContractTests(unittest.TestCase):
    def test_custom_input_is_bounded_and_cancellation_is_terminal(self):
        controller.validate_input(custom_case(choices=[0, 1, 2, -1])["input"])
        invalid = [{}, {"choices": [], "preferences": [1] * 3},
                   {"choices": [], "preferences": [1, 1, True, 1]},
                   {"choices": [], "preferences": [1, 1, 1.0, 1]},
                   {"choices": [], "preferences": [-1, 1, 1, 1]},
                   {"choices": [], "preferences": [3, 1, 1, 1]},
                   {"choices": [], "preferences": [1] * 4, "expected": "pass"}]
        invalid += [custom_case(choices=choices)["input"] for choices in
                    ([0] * 5, [-1, 0], [-1, -1], [True], [0.0], [3], [-2])]
        for values in invalid:
            with self.subTest(values=values), self.assertRaises(ProtocolError):
                controller.validate_input(values)

    def test_generator_covers_the_declared_combinations_without_answers(self):
        cases = generate_custom.make_suite()["cases"]
        self.assertEqual(len(cases), 215)
        self.assertEqual(len({case["id"] for case in cases}), 215)
        for case in cases:
            self.assertEqual(set(case), {"id", "algorithm", "input"})
            controller.validate_input(case["input"])
        preferences = {tuple(c["input"]["preferences"]) for c in cases if c["id"].startswith("preferences-")}
        answers = {tuple(c["input"]["choices"]) for c in cases if c["id"].startswith("confirm-")}
        self.assertEqual(preferences, set(itertools.product(range(3), repeat=4)))
        self.assertEqual(answers, set(itertools.product(range(3), repeat=4)))
        self.assertEqual(sum(c["id"].startswith("cancel-") for c in cases), 40)
        self.assertEqual(sum(c["id"].startswith("prefix-") for c in cases), 13)
        self.assertEqual(json.loads((DIRECTORY / "cases/custom-map.json").read_text()), generate_custom.make_suite())

    def test_checked_in_original_evidence_is_bound_to_all_inputs(self):
        references = audit.load_references(DIRECTORY / "catalog.json")
        self.assertEqual({r["id"] for r in references}, {"menus", "custom-map"})
        count = 0
        for reference in references:
            suite = compare.read_json(DIRECTORY / reference["cases"])
            compare.validate_observations(compare.read_json(DIRECTORY / reference["observations"]), suite)
            count += len(suite["cases"])
        self.assertEqual(count, 256)

    def test_runtime_success_is_not_itself_an_observation(self):
        for output in ("", "All tests passed.\n", "HUI_CASE|synthetic\nAll tests passed.\n"):
            with self.subTest(output=output), self.assertRaises(ProtocolError):
                headless.parse_output(output, [custom_case()])

    def test_custom_protocol_preserves_actual_fields(self):
        output = "[test:1] HUI_CASE|synthetic\nHUI_CUSTOM_MENU|ocean|2\nHUI_CUSTOM_DONE|waiting|0|\nAll tests passed.\n"
        result = headless.parse_output(output, [custom_case()])
        self.assertEqual(result[0]["output"], {"menus": [{"screen": "ocean", "selected": 2}],
                                              "status": "waiting", "consumed": 0, "parameters": None})

    def test_malformed_custom_protocol_cannot_supply_partial_answers(self):
        for lines in ("HUI_CUSTOM_MENU|ocean|3\nHUI_CUSTOM_DONE|waiting|0|",
                      "HUI_CUSTOM_MENU|ocean|1\nHUI_CUSTOM_DONE|confirmed|0|",
                      "HUI_CUSTOM_MENU|ocean|1\nHUI_CUSTOM_DONE|waiting|0|0,0,0,0",
                      "HUI_CUSTOM_MENU|ocean|1\nHUI_CUSTOM_DONE|waiting|1|",
                      "HUI_CUSTOM_DONE|waiting|0|", "HUI_CUSTOM_MENU|ocean",
                      "HUI_CUSTOM_MENU|ocean|word", "HUI_UNKNOWN", "HUI_DONE|true"):
            output = "HUI_CASE|synthetic\n" + lines + "\nAll tests passed.\n"
            with self.subTest(lines=lines), self.assertRaises(ProtocolError):
                headless.parse_output(output, [custom_case()])

    def test_duplicate_reordered_and_unknown_cases_are_rejected(self):
        def row(name):
            return f"HUI_CASE|{name}\nHUI_CUSTOM_MENU|ocean|0\nHUI_CUSTOM_DONE|waiting|0|\n"
        cases = [custom_case("first"), custom_case("second")]
        for names in (("second", "first"), ("first", "first"), ("first",), ("unknown", "second")):
            with self.subTest(names=names), self.assertRaises(ProtocolError):
                headless.parse_output("".join(row(name) for name in names) + "All tests passed.\n", cases)

    def test_menu_completion_requires_every_input_checkpoint(self):
        case = {"id": "menu", "algorithm": "ui.menu_trace.v1", "input": {"actions": [{"key": "Escape"}]}}
        screen = "HUI_SCREEN|\nHUI_ENTRY|0|true|ACTUAL\nHUI_SCREEN_END\n"
        for body in (screen + "HUI_DONE|true", "HUI_DONE|true", screen + "HUI_DONE|false",
                     screen.replace("|true|", "|false|") + "HUI_DONE|true"):
            with self.subTest(body=body), self.assertRaises(ProtocolError):
                headless.parse_output("HUI_CASE|menu\n" + body + "\nAll tests passed.\n", [case])
        valid = headless.parse_output("HUI_CASE|menu\n" + screen * 2 + "HUI_DONE|true\nAll tests passed.\n", [case])
        self.assertEqual(len(valid[0]["output"]["trace"]), 2)

    def test_runtime_error_is_preserved_as_error(self):
        output = "HUI_CASE|synthetic\nHUI_ERROR|Error|unexpected popup\nAll tests passed.\n"
        self.assertEqual(headless.parse_output(output, [custom_case()])[0]["status"], "error")
        with self.assertRaises(ProtocolError):
            headless.parse_output(output.replace("All tests passed.", "Test failed."), [custom_case()])

    def test_negative_response_uses_gse_expression_syntax(self):
        self.assertEqual(headless.gse_literal([-1, 0]), "[(0 - 1),0]")

    def test_parallel_batches_preserve_order_and_reject_mixed_snapshots(self):
        args = SimpleNamespace(batch_size=1, jobs=2, runtime=Path("synthetic.js"))
        cases = [custom_case("first"), custom_case("second")]
        def response(_command, request, timeout):
            return {"implementation": {"scripts_sha256": "same"},
                    "results": [{"id": row["id"], "status": "error", "reason": "synthetic"} for row in request["cases"]]}
        with patch.object(compare, "run_probe", side_effect=response):
            metadata, results = headless.run_batches(cases, args)
        self.assertEqual(metadata["workers"], 2)
        self.assertEqual([row["id"] for row in results], ["first", "second"])
        with patch.object(compare, "run_probe", side_effect=[
            {"implementation": {"scripts_sha256": "first"}, "results": []},
            {"implementation": {"scripts_sha256": "second"}, "results": []},
        ]), self.assertRaisesRegex(ProtocolError, "different runtime/script snapshots"):
            headless.run_batches(cases, args)


@unittest.skipUnless(importlib.util.find_spec("unicorn"), "optional original-reference emulator not installed")
class HeadlessOriginalGuardTests(unittest.TestCase):
    def oracle(self, program):
        image = bytearray(original.IMAGE_SIZE)
        offset = controller.ENTRY - original.IMAGE_BASE
        image[offset:offset + len(program)] = program
        return controller.MenuOracle(bytes(image))

    def jump(self, address, offset=0):
        return b"\xE9" + struct.pack("<i", address - (controller.ENTRY + offset) - 5)

    def test_fixture_is_fresh_for_every_original_execution(self):
        # Synthetic increment, then jump to the observation boundary.
        program = b"\xFF\x05" + struct.pack("<I", controller.PARAMETERS + 4)
        oracle = self.oracle(program + self.jump(next(iter(controller.STOPS)), len(program)))
        for _ in range(3):
            self.assertEqual(oracle.probe_custom(custom_case()["input"])["parameters"], [1, 0, 0, 0])

    def test_unverified_code_and_dependencies_are_rejected(self):
        for destination in (0x0058CEF0, 0x0058D000):
            with self.subTest(destination=destination), self.assertRaises(original.ProbeError):
                self.oracle(self.jump(destination)).probe_custom(custom_case()["input"])

    def test_adjacent_mapped_memory_is_not_an_implicit_fixture(self):
        for opcode in (b"\xA1", b"\xA3"):
            program = opcode + struct.pack("<I", controller.PARAMETERS + 28)
            with self.subTest(opcode=opcode), self.assertRaisesRegex(original.ProbeError, "outside fixture"):
                self.oracle(program).probe_custom(custom_case()["input"])

    def test_original_code_is_protected_from_writes(self):
        program = b"\xA3" + struct.pack("<I", controller.ENTRY)
        with self.assertRaisesRegex(original.ProbeError, "protected memory|outside fixture"):
            self.oracle(program).probe_custom(custom_case()["input"])

    def test_interrupts_and_infinite_loops_do_not_count_as_observations(self):
        with self.assertRaisesRegex(original.ProbeError, "interrupt"):
            self.oracle(b"\xCD\x80").probe_custom(custom_case()["input"])
        with patch.object(controller, "MAX_INSTRUCTIONS", 20), self.assertRaisesRegex(original.ProbeError, "execution limit"):
            self.oracle(b"\xEB\xFE").probe_custom(custom_case()["input"])


if __name__ == "__main__":
    unittest.main()
