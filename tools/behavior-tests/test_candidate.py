"""Candidate contract validation and fixture isolation; no reference algorithms."""

from copy import deepcopy
import json
from pathlib import Path
import shlex
import sys
import unittest

import compare
import glsmac
from protocol import ProtocolError


DIRECTORY = Path(__file__).resolve().parent


class CandidateInputTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.examples = {}
        for path in (DIRECTORY / "cases").glob("*.json"):
            for case in json.loads(path.read_text())["cases"]:
                cls.examples.setdefault(case["algorithm"], case["input"])

    def test_all_recorded_contracts_have_strict_candidate_support(self):
        self.assertEqual(set(self.examples), set(glsmac.ALGORITHMS))
        for algorithm, data in self.examples.items():
            with self.subTest(algorithm=algorithm):
                self.assertTrue(glsmac.encode_input(algorithm, data).endswith("\n"))
                extra = deepcopy(data)
                extra["unexpected"] = 0
                with self.assertRaises(ProtocolError):
                    glsmac.encode_input(algorithm, extra)
                missing = deepcopy(data)
                del missing[next(iter(missing))]
                with self.assertRaises(ProtocolError):
                    glsmac.encode_input(algorithm, missing)

    def test_integer_fields_reject_booleans_and_floats(self):
        for algorithm, data in self.examples.items():
            for key, value in data.items():
                if type(value) is int:
                    for replacement in (False, float(value)):
                        changed = deepcopy(data)
                        changed[key] = replacement
                        with self.subTest(algorithm=algorithm, key=key, replacement=replacement), self.assertRaises(ProtocolError):
                            glsmac.encode_input(algorithm, changed)

    def test_invalid_map_bounds_parity_shapes_and_weight_dimensions(self):
        invalid = [
            ("map.raw_vector_distance.v1", "dx", 4096),
            ("map.raw_vector_distance.v1", "dy", -4096),
            ("map.vector_distance.v1", "width", 5),
            ("map.vector_distance.v1", "height", 1),
            ("map.vector_distance.v1", "flat", 0),
            ("map.vector_distance.v1", "x1", -1),
            ("map.vector_distance.v1", "x1", 1),
            ("map.vector_distance.v1", "x2", 4096),
            ("map.vector_distance.v1", "y2", 4096),
            ("technology.category.v1", "weights", [0, 0, 0]),
            ("technology.category.v1", "weights", [0, 0, True, 0]),
            ("technology.category.v1", "weights", [0, 0, 0, 32768]),
            ("technology.has_tech.v1", "prerequisites", [-1]),
            ("technology.has_tech.v1", "prerequisites", [True, -1]),
            ("technology.has_tech.v1", "owners", 256),
            ("technology.available.v1", "expansion_enabled", 1),
            ("technology.prerequisite.v1", "max_depth", 6),
            ("economy.human_mineral_factor.v1", "faction_id", 0),
            ("economy.human_mineral_factor.v1", "faction_id", 8),
            ("economy.human_mineral_factor.v1", "map_size_level", -1),
            ("economy.human_mineral_factor.v1", "map_size_level", 5),
            ("economy.human_mineral_factor.v1", "mineral_rule_factor", 0),
            ("economy.human_mineral_factor.v1", "mineral_rule_factor", 101),
            ("economy.human_mineral_factor.v1", "industry", -9),
            ("economy.human_mineral_factor.v1", "industry", 11),
        ]
        for algorithm, key, value in invalid:
            changed = deepcopy(self.examples[algorithm])
            changed[key] = value
            with self.subTest(algorithm=algorithm, key=key, value=value), self.assertRaises(ProtocolError):
                glsmac.encode_input(algorithm, changed)

    def test_prototype_inputs_reject_invalid_flags_and_component_bounds(self):
        algorithm = "unit.prototype_base_cost.v1"
        for key, value in (("chassis_id", 9), ("weapon_id", 26), ("armor_id", 14), ("triad", 3),
                           ("chassis_cost", 0), ("weapon_cost", 33), ("armor_cost", 0),
                           ("reactor", 0), ("reactor", 5), ("offense", -2), ("offense", 128),
                           ("weapon_mode", 15), ("missile", 0), ("abilities", 0)):
            changed = deepcopy(self.examples[algorithm])
            changed[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ProtocolError):
                glsmac.encode_input(algorithm, changed)

    def test_basic_switch_inputs_reject_unobserved_state_and_invalid_bounds(self):
        algorithm = "economy.basic_production_switch_loss.v1"
        for key, value in (("base_id", -1), ("base_id", 8), ("faction_id", 0), ("faction_id", 8),
                           ("previous_item", -65), ("current_item", 512), ("minerals", -1),
                           ("minerals", 1_000_001), ("human", False), ("skunkworks", True),
                           ("penalty_percent", 25)):
            changed = deepcopy(self.examples[algorithm])
            changed[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ProtocolError):
                glsmac.encode_input(algorithm, changed)

    def test_human_nutrient_inputs_reject_unobserved_state_and_invalid_bounds(self):
        algorithm = "economy.human_nutrient_factor.v1"
        for key, value in (("faction_id", 0), ("faction_id", 8), ("map_size_level", -1),
                           ("map_size_level", 5), ("nutrient_rule_factor", 0),
                           ("nutrient_rule_factor", 101), ("growth", -9), ("growth", 11),
                           ("base_id", -1), ("human", False)):
            changed = deepcopy(self.examples[algorithm])
            changed[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ProtocolError):
                glsmac.encode_input(algorithm, changed)

    def test_sparse_rows_reject_duplicates_extras_and_invalid_nested_values(self):
        row = {"id": 0, "prerequisites": [-1, -1], "owners": 0}
        invalid = [[row, row], [row] * 90, None]
        for key, value in (("id", 89), ("id", True), ("prerequisites", [-3, -1]),
                           ("prerequisites", [-1, 88.0]), ("owners", 256), ("extra", 0)):
            changed = deepcopy(row)
            changed[key] = value
            invalid.append([changed])
        for rows in invalid:
            for algorithm in ("technology.available.v1", "technology.prerequisite.v1"):
                changed = deepcopy(self.examples[algorithm])
                changed["technologies"] = rows
                with self.subTest(algorithm=algorithm, rows=rows), self.assertRaises(ProtocolError):
                    glsmac.encode_input(algorithm, changed)

    def test_unknown_contract_remains_unsupported_without_building(self):
        request = {"version": 1, "cases": [{"id": "unknown", "algorithm": "unknown.v1", "input": {}}]}
        command = shlex.join([sys.executable, str(DIRECTORY / "glsmac.py")])
        response = compare.run_probe(command, request)
        self.assertEqual(response["results"][0]["status"], "unsupported")

    def test_native_fixture_state_is_reset_between_cases(self):
        suite = compare.read_json(DIRECTORY / "cases/technology.json")
        evidence = compare.read_json(DIRECTORY / "observations/smacx-gog-2.0-technology.json")
        cases = {case["id"]: case for case in suite["cases"]}
        expected = {row["id"]: row["output"] for row in evidence["observations"]}
        sequence = ["has-f1-p0-o1", "has-f1-p0-o0", "has-f1-p0-o1"]
        self.assertEqual(glsmac.run_cases([cases[key] for key in sequence], "native"),
                         [expected[key] for key in sequence])


if __name__ == "__main__":
    unittest.main()
