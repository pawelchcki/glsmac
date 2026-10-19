import unittest
from unittest.mock import patch

from protocol import ProtocolError
from ui import size_keyboard


def case(name="accept"):
    return {"id": name, "algorithm": size_keyboard.ALGORITHM,
            "input": {"route": "random", "key": "Enter"}}


def menu(name="accept"):
    return (f"HUI_CASE|{name}\nHUI_SCREEN|DIFFICULTY\n"
            "HUI_ENTRY|0|true|CITIZEN\nHUI_SCREEN_END\nHUI_DONE|true\n")


class SizeKeyboardTests(unittest.TestCase):
    def test_unknown_contract_never_starts_an_engine(self):
        unknown = dict(case("unknown"), algorithm="unknown.v1")
        with patch("sys.argv", ["size_keyboard.py", "--target", "original"]), \
                patch.object(size_keyboard, "load_request", return_value={"cases": [unknown]}), \
                patch.object(size_keyboard, "headless") as headless, \
                patch.object(size_keyboard, "rendered") as rendered, \
                patch.object(size_keyboard, "write_response") as write:
            size_keyboard.main()
        headless.assert_not_called()
        rendered.assert_not_called()
        self.assertEqual(write.call_args.args[1][0]["status"], "unsupported")

    def test_mixed_requests_preserve_unsupported_case_order(self):
        unknown = dict(case("unknown"), algorithm="unknown.v1")
        actual = {"id": "accept", "status": "ok", "output": {"after": {"kind": "popup"}}}
        with patch("sys.argv", ["size_keyboard.py", "--target", "headless"]), \
                patch.object(size_keyboard, "load_request", return_value={"cases": [unknown, case()]}), \
                patch.object(size_keyboard, "headless", return_value=({"name": "synthetic", "kind": "candidate"}, [actual])), \
                patch.object(size_keyboard, "write_response") as write:
            size_keyboard.main()
        self.assertEqual([row["id"] for row in write.call_args.args[1]], ["unknown", "accept"])
        self.assertEqual([row["status"] for row in write.call_args.args[1]], ["unsupported", "ok"])

    def test_exact_bounded_inputs(self):
        for route in ("random", "custom"):
            for key in ("Enter", "Escape"):
                size_keyboard.validate_input({"route": route, "key": key})
        for value in ({}, {"route": "other", "key": "Enter"},
                      {"route": "random", "key": "Tab"},
                      {"route": "random", "key": "Enter", "expected": "CITIZEN"}, None):
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                size_keyboard.validate_input(value)

    def test_visible_final_menu_uses_observed_text_and_highlight(self):
        result = size_keyboard.parse_candidate(menu() + "All tests passed.\n", [case()])
        self.assertEqual(result[0]["output"], {"after": {"kind": "sliding-menu",
                         "caption": "DIFFICULTY", "entries": ["CITIZEN"], "selected": ["CITIZEN"]}})

    def test_still_open_popup_is_a_comparable_observation(self):
        for prefix in ("", "    [./size_probe.gls.js:1:2] "):
            with self.subTest(prefix=prefix):
                result = size_keyboard.parse_candidate(prefix + "SIZE_POPUP|accept\nAll tests passed.\n", [case()])
                self.assertEqual(result[0]["output"], {"after": {"kind": "popup"}})

    def test_missing_duplicate_unknown_and_reordered_cases_fail(self):
        for output, cases in (
            ("All tests passed.\n", [case()]),
            ("SIZE_POPUP|accept\nSIZE_POPUP|accept\nAll tests passed.\n", [case()]),
            ("SIZE_POPUP|unknown\nAll tests passed.\n", [case()]),
            ("SIZE_POPUP|second\n" + menu() + "All tests passed.\n", [case(), case("second")]),
            ("SIZE_POPUP|accept\n", [case()]),
        ):
            with self.subTest(output=output), self.assertRaises(ProtocolError):
                size_keyboard.parse_candidate(output, cases)

    def test_gse_error_remains_an_error(self):
        result = size_keyboard.parse_candidate("HUI_CASE|accept\nHUI_ERROR|TypeError|broken\nAll tests passed.\n", [case()])
        self.assertEqual(result[0]["status"], "error")
        self.assertEqual(result[0]["reason"], "TypeError|broken")


if __name__ == "__main__":
    unittest.main()
