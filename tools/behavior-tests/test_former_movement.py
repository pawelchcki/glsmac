"""Road/work transport and fixture guards, separate from game-rule evidence."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from protocol import ProtocolError
from compare import validate_observations
from ui.former_movement_contract import ALGORITHM, validate_input, validate_output
from ui.former_movement_headless import parse_candidate
from ui.generate_former_movement import suite


class FormerMovementContractTests(unittest.TestCase):
    def test_frozen_original_evidence_is_bound_to_two_complete_repeated_runs(self):
        directory = Path(__file__).parent / 'ui'
        inputs = json.loads((directory / 'cases/former-movement.json').read_text())
        evidence = json.loads((directory / 'observations/smacx-gog-2.0-former-movement.json').read_text())
        validate_observations(evidence, inputs)
        self.assertGreaterEqual(evidence['repeat'], 2)
        self.assertEqual(len(evidence['observations']), 3)
        for case, row in zip(inputs['cases'], evidence['observations'], strict=True):
            validate_output(row['output'], case['input']['actions'])

    def test_declared_inputs_are_reproducible_and_bounded(self):
        declared = suite()
        self.assertEqual(declared, json.loads((Path(__file__).parent / 'ui/cases/former-movement.json').read_text()))
        self.assertEqual(len(declared['cases']), len({case['id'] for case in declared['cases']}))
        for case in declared['cases']:
            self.assertEqual(case['algorithm'], ALGORITHM)
            validate_input(case['input'])

    def test_invalid_inputs_cannot_supply_terrain_or_answers(self):
        for value in (None, [], {}, {'actions': 'west'}, {'actions': [{}]}, {'actions': ['teleport']},
                      {'actions': ['west'] * 13}, {'actions': ['advance'] * 7},
                      {'actions': [], 'position': 0}, {'actions': [], 'road_rate': 3}):
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                validate_input(value)

    @staticmethod
    def output():
        # A protocol witness, never a claimed original action result.
        return {'trace': [{'position': -1, 'year_delta': 0, 'order': 'none', 'movement_spent': 0,
                           'work_units': 0, 'terrain': dict.fromkeys(('road', 'farm', 'mine', 'forest'), False)}]}

    def test_position_and_complete_work_state_are_required(self):
        validate_output(self.output(), [])
        for value in (None, {}, {'trace': []}, {'trace': [None]}, {'trace': 'invalid'}):
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                validate_output(value, [])
        for key in self.output()['trace'][0]:
            value = self.output(); del value['trace'][0][key]
            with self.subTest(key=key), self.assertRaises(ProtocolError):
                validate_output(value, [])
        for position in (-7, 7, True, 1.0, '0', None):
            value = self.output(); value['trace'][0]['position'] = position
            with self.subTest(position=position), self.assertRaises(ProtocolError):
                validate_output(value, [])


class FormerMovementCandidateTests(unittest.TestCase):
    def setUp(self):
        self.cases = [{'id': 'shape', 'algorithm': ALGORITHM, 'input': {'actions': []}}]
        self.text = 'MOVE_CASE|shape\nMOVE_STATE|0|0|none|0|0|false|false|false|false|-1\nMOVE_DONE\nAll tests passed.\n'

    def test_complete_position_and_work_checkpoint_is_observed(self):
        row, = parse_candidate(self.text, self.cases)
        self.assertEqual(row['output'], FormerMovementContractTests.output())

    def test_position_cannot_be_omitted_coerced_or_out_of_bounds(self):
        for position in ('', '00', '-0', '1.0', 'true', '-7', '7'):
            with self.subTest(position=position), self.assertRaises(ProtocolError):
                parse_candidate(self.text.replace('|-1\n', '|' + position + '\n'), self.cases)
        with self.assertRaises(ProtocolError):
            parse_candidate(self.text.replace('|-1\n', '\n'), self.cases)

    def test_partial_missing_reordered_and_extra_output_fails(self):
        for before, after in (('MOVE_DONE\n', ''), ('MOVE_STATE|0', 'MOVE_STATE|1'),
                              ('MOVE_DONE', 'MOVE_DONE\nMOVE_DONE'), ('MOVE_DONE', 'MOVE_UNKNOWN'),
                              ('All tests passed.', ''), ('MOVE_CASE|shape', 'MOVE_CASE|other')):
            with self.subTest(after=after), self.assertRaises(ProtocolError):
                parse_candidate(self.text.replace(before, after), self.cases)

    def test_every_native_rejection_stays_an_independent_error(self):
        cases = self.cases + [dict(deepcopy(self.cases[0]), id='second')]
        rows = parse_candidate('MOVE_CASE|shape\nMOVE_ERROR|first rejection\n'
                               'MOVE_CASE|second\nMOVE_ERROR|second rejection\nAll tests passed.\n', cases)
        self.assertEqual([row['status'] for row in rows], ['error', 'error'])
        self.assertEqual([row['reason'] for row in rows], ['first rejection', 'second rejection'])


if __name__ == '__main__':
    unittest.main()
