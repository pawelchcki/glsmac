"""Selection transport/evidence integrity; gameplay is checked by native replay."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from compare import validate_observations
from protocol import ProtocolError
from ui import unit_selection_contract as selection, unit_wait_contract as waiting
from ui.generate_unit_selection import suites
from ui.generate_unit_wait import suite
from ui.unit_selection_headless import parse_candidate
from ui.unit_selection_sources import three_units

DIRECTORY = Path(__file__).parent / 'ui'


class UnitSelectionTests(unittest.TestCase):
    def test_generators_supply_only_bounded_inputs(self):
        groups = dict(suites(), **{'unit-wait-flags': suite()})
        ids = []
        for name, generated in groups.items():
            self.assertEqual(generated, json.loads((DIRECTORY / f'cases/{name}.json').read_text()))
            for case in generated['cases']:
                self.assertEqual(set(case), {'id', 'algorithm', 'input'})
                selection.validate_input(case['input']); ids.append(case['id'])
        self.assertEqual(len(ids), 8)
        self.assertEqual(len(set(ids)), 8)

    def test_eight_frozen_cases_require_two_identical_whole_runs(self):
        for name in (*suites(), 'unit-wait-flags'):
            inputs = json.loads((DIRECTORY / f'cases/{name}.json').read_text())
            evidence = json.loads((DIRECTORY / f'observations/smacx-gog-2.0-{name}.json').read_text())
            validate_observations(evidence, inputs)
            self.assertGreaterEqual(evidence['repeat'], 2)
            contract = waiting if name == 'unit-wait-flags' else selection
            for case, row in zip(inputs['cases'], evidence['observations'], strict=True):
                contract.validate_output(row['output'], case['input']['actions'])

    def test_inputs_reject_answers_unknown_actions_and_excess_turns(self):
        for data in (None, [], {}, {'profile': [], 'actions': []}, {'profile': 'unknown', 'actions': []},
                     {'profile': 'stacked', 'actions': 'wait'}, {'profile': 'stacked', 'actions': [None]},
                     {'profile': 'stacked', 'actions': ['teleport']}, {'profile': 'stacked', 'actions': ['wait'] * 13},
                     {'profile': 'stacked', 'actions': ['advance', 'advance']},
                     {'profile': 'stacked', 'actions': [], 'selected': 'scout'}):
            with self.subTest(data=data), self.assertRaises(ProtocolError): selection.validate_input(data)

    @staticmethod
    def witness(wait=False):
        state = {'year_delta': 0, 'selected': 'scout'}
        if wait:
            state['deferred'] = dict.fromkeys(selection.ROLES, False)
        else:
            state['units'] = [{'role': role, 'x_delta': 0, 'y_delta': 0, 'order': 'none', 'movement_spent': 0}
                              for role in selection.ROLES]
        return {'trace': [state]}

    def test_output_requires_complete_typed_states(self):
        for contract, wait in ((selection, False), (waiting, True)):
            contract.validate_output(self.witness(wait), [])
            for output in (None, {}, {'trace': []}, {'trace': [None]}):
                with self.subTest(output=output), self.assertRaises(ProtocolError): contract.validate_output(output, [])
            for key in self.witness(wait)['trace'][0]:
                output = self.witness(wait); del output['trace'][0][key]
                with self.subTest(key=key), self.assertRaises(ProtocolError): contract.validate_output(output, [])
            for key, values in (('year_delta', [True, -1, 2, 0.0]), ('selected', [False, 0, 'enemy'])):
                for value in values:
                    output = self.witness(wait); output['trace'][0][key] = value
                    with self.subTest(key=key, value=value), self.assertRaises(ProtocolError): contract.validate_output(output, [])
        for value in (0, 'false', None):
            output = self.witness(True); output['trace'][0]['deferred']['former'] = value
            with self.assertRaises(ProtocolError): waiting.validate_output(output, [])
        for key, values in (('x_delta', [True, -2, 2]), ('y_delta', [False, -1, 2]),
                            ('movement_spent', [True, -1, 4]), ('order', ['sentry', None]), ('role', ['former'])):
            for value in values:
                output = self.witness(); output['trace'][0]['units'][0][key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ProtocolError): selection.validate_output(output, [])

    @staticmethod
    def transport(wait=False):
        case = {'id': 'shape', 'algorithm': waiting.ALGORITHM if wait else selection.ALGORITHM,
                'input': {'profile': 'stacked', 'actions': []}}
        body = ('SELECT_DEFER|false|false|false\n' if wait else
                ''.join('SELECT_UNIT|' + role + '|0|0|none|0\n' for role in selection.ROLES))
        return [case], 'SELECT_CASE|shape\nSELECT_STATE|0|0|scout\n' + body + 'SELECT_STATE_DONE\nSELECT_CASE_DONE\nAll tests passed.\n'

    def test_parser_preserves_both_native_state_shapes(self):
        for wait in (False, True):
            cases, text = self.transport(wait)
            self.assertEqual(parse_candidate(text, cases)[0]['output'], self.witness(wait))

    def test_parser_rejects_partial_reordered_and_coerced_answers(self):
        for wait in (False, True):
            cases, text = self.transport(wait)
            changes = [('SELECT_CASE_DONE\n', ''), ('SELECT_STATE_DONE\n', ''),
                       ('SELECT_STATE|0', 'SELECT_STATE|1'), ('|0|scout', '|0.0|scout'),
                       ('SELECT_CASE|shape', 'SELECT_CASE|unknown'), ('All tests passed.', ''),
                       ('SELECT_STATE_DONE', 'SELECT_UNKNOWN'),
                       ('SELECT_CASE_DONE', 'SELECT_CASE_DONE\nSELECT_CASE_DONE')]
            changes += [('SELECT_DEFER|false', 'SELECT_DEFER|0')] if wait else [('SELECT_UNIT|scout', 'SELECT_UNIT|former'), ('|0|none|0', '|-0|none|0')]
            for before, after in changes:
                with self.subTest(wait=wait, after=after), self.assertRaises(ProtocolError): parse_candidate(text.replace(before, after), cases)

    def test_parser_keeps_case_errors_independent(self):
        cases, _ = self.transport(); cases.append(dict(deepcopy(cases[0]), id='second'))
        rows = parse_candidate('SELECT_CASE|shape\nSELECT_CASE_ERROR|locked\nSELECT_CASE|second\n'
                               'SELECT_CASE_ERROR|stale unit\nAll tests passed.\n', cases)
        self.assertEqual([(r['status'], r['reason']) for r in rows], [('error', 'locked'), ('error', 'stale unit')])

    def test_three_unit_source_preserves_eight_bonus_limit(self):
        raw = b'#GAIANS\nName, Noun\nTECH, Ecology, SOCIAL, +GROWTH\n#END\n'
        result = three_units(raw)
        self.assertIn(b'UNIT, 1', result); self.assertIn(b'UNIT, 0', result)
        full = b'#GAIANS\nName, Noun\n' + b', '.join([b'TECH, Ecology'] * 8) + b'\n#END\n'
        with self.assertRaises(ProtocolError): three_units(full)


if __name__ == '__main__': unittest.main()
