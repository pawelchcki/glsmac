"""Activation evidence/transport integrity; production behavior uses native replay."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from compare import validate_observations
from protocol import ProtocolError
from ui import unit_activation_contract as contract
from ui.generate_unit_activation import suite
from ui.unit_activation_headless import parse_candidate
from ui.unit_activation_original import fingerprint

DIRECTORY = Path(__file__).parent / 'ui'


class UnitActivationTests(unittest.TestCase):
    def test_generator_supplies_only_inputs_and_matches_frozen_suite(self):
        generated = suite()
        self.assertEqual(generated, json.loads((DIRECTORY / 'cases/unit-activation.json').read_text()))
        self.assertEqual(len(generated['cases']), 7)
        self.assertEqual(len({c['id'] for c in generated['cases']}), 7)
        for case in generated['cases']:
            self.assertEqual(set(case), {'id', 'algorithm', 'input'})
            self.assertEqual(case['algorithm'], contract.ALGORITHM)
            contract.validate_input(case['input'])

    def test_all_seven_observations_bind_inputs_and_two_whole_captures(self):
        inputs = suite()
        evidence = json.loads((DIRECTORY / 'observations/smacx-gog-2.0-unit-activation.json').read_text())
        validate_observations(evidence, inputs)
        self.assertGreaterEqual(evidence['repeat'], 2)
        self.assertEqual(evidence['reference']['adapter_sha256'],
                         fingerprint())
        for case, row in zip(inputs['cases'], evidence['observations'], strict=True):
            contract.validate_output(row['output'], case['input']['actions'])
        altered = deepcopy(inputs); altered['cases'][0]['input']['actions'][-1] = 'enter'
        with self.assertRaises(ProtocolError): validate_observations(evidence, altered)

    def test_inputs_reject_answers_unknown_actions_and_unbounded_sequences(self):
        for data in (None, [], {}, {'profile': [], 'actions': []}, {'profile': 'other', 'actions': ['open']},
                     {'profile': 'default', 'actions': 'open'}, {'profile': 'default', 'actions': [None]},
                     {'profile': 'default', 'actions': []}, {'profile': 'default', 'actions': ['down']},
                     {'profile': 'default', 'actions': ['open', 'open']},
                     {'profile': 'default', 'actions': ['open', 'enter', 'down']},
                     {'profile': 'default', 'actions': ['open', 'teleport']},
                     {'profile': 'default', 'actions': ['open'] + ['down'] * 10},
                     {'profile': 'default', 'actions': ['open'], 'selected': 'colony'}):
            with self.subTest(data=data), self.assertRaises(ProtocolError): contract.validate_input(data)

    @staticmethod
    def witness():
        return {'year_delta': 0, 'selected': None, 'picker': None,
                'units': [{'role': role, 'order': 'hold', 'movement_spent': 0} for role in contract.ROLES]}

    def test_output_requires_every_typed_checkpoint_and_initial_fixture(self):
        state = self.witness(); contract.validate_output({'trace': [state, deepcopy(state)]}, ['open'])
        for output in (None, {}, {'trace': []}, {'trace': [state]}, {'trace': [None, None]}):
            with self.subTest(output=output), self.assertRaises(ProtocolError): contract.validate_output(output, ['open'])
        for key in state:
            changed = deepcopy(state); del changed[key]
            with self.subTest(key=key), self.assertRaises(ProtocolError): contract.validate_state(changed)
        for key, values in (('year_delta', [True, 0.0, -1, 1]), ('selected', [False, 0, 'enemy'])):
            for value in values:
                changed = deepcopy(state); changed[key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ProtocolError): contract.validate_state(changed)
        for key, values in (('movement_spent', [True, -1, 4]), ('order', [None, 'sentry']), ('role', ['former'])):
            for value in values:
                changed = deepcopy(state); changed['units'][0][key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ProtocolError): contract.validate_state(changed)
        for mutate in (lambda s: s.update(selected='scout'), lambda s: s['units'][0].update(order='none'),
                       lambda s: s['units'][0].update(movement_spent=1)):
            changed = deepcopy(state); mutate(changed)
            with self.assertRaises(ProtocolError): contract.validate_output({'trace': [changed]}, [])

    def test_picker_requires_all_distinct_choices_and_valid_highlight(self):
        picker = {'caption': 'CAPTION', 'choices': ['colony', 'scout', 'former'], 'selected': 'scout'}
        state = self.witness(); state['picker'] = picker; contract.validate_state(state)
        for key in picker:
            changed = deepcopy(state); del changed['picker'][key]
            with self.subTest(key=key), self.assertRaises(ProtocolError): contract.validate_state(changed)
        for key, values in (('caption', ['', None]), ('choices', [[], ['colony'] * 3, ['enemy', 'scout', 'former'], None]),
                            ('selected', [None, 0, 'enemy'])):
            for value in values:
                changed = deepcopy(state); changed['picker'][key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ProtocolError): contract.validate_state(changed)

    @staticmethod
    def transport():
        cases = [{'id': 'shape', 'algorithm': contract.ALGORITHM, 'input': {'profile': 'default', 'actions': ['open']}}]
        units = ''.join(f'ACT_UNIT|{role}|hold|0\n' for role in contract.ROLES)
        text = ('ACT_CASE|shape\nACT_STATE|0|0|none\nACT_CLOSED\n' + units + 'ACT_STATE_DONE\n'
                'ACT_STATE|1|0|none\nACT_PICKER| select   unit \n'
                'ACT_CHOICE|colony|Colony Pod|Colony Pod\nACT_CHOICE|scout|Scout Patrol|Scout Patrol\n'
                'ACT_CHOICE|former|Formers|Formers\nACT_HIGHLIGHT|colony\n' + units +
                'ACT_STATE_DONE\nACT_CASE_DONE\nAll tests passed.\n')
        return cases, text

    def test_parser_reads_native_state_and_displayed_labels(self):
        cases, text = self.transport(); rows = parse_candidate(text, cases)
        contract.validate_output(rows[0]['output'], cases[0]['input']['actions'])
        self.assertEqual(rows[0]['output']['trace'][0], self.witness())
        self.assertEqual(rows[0]['output']['trace'][1]['picker'],
                         {'caption': 'SELECT UNIT', 'choices': ['colony', 'scout', 'former'], 'selected': 'colony'})

    def test_parser_rejects_partial_duplicate_reordered_and_mislabeled_records(self):
        cases, text = self.transport()
        changes = [('ACT_CASE_DONE\n', ''), ('ACT_STATE_DONE\n', ''), ('ACT_STATE|1', 'ACT_STATE|2'),
                   ('|0|none', '|0.0|none'), ('ACT_CASE|shape', 'ACT_CASE|unknown'), ('All tests passed.', ''),
                   ('ACT_CLOSED', 'ACT_UNKNOWN'), ('ACT_CASE_DONE', 'ACT_CASE_DONE\nACT_CASE_DONE'),
                   ('ACT_CLOSED', 'ACT_CLOSED\nACT_CLOSED'), ('ACT_UNIT|scout', 'ACT_UNIT|former'),
                   ('|hold|0', '|hold|-0'), ('ACT_HIGHLIGHT|colony', 'ACT_HIGHLIGHT|enemy'),
                   ('ACT_CHOICE|former|Formers|Formers', 'ACT_CHOICE|former|Formers|Scout Patrol'),
                   ('ACT_CHOICE|scout|Scout Patrol|Scout Patrol', 'ACT_CHOICE|colony|Scout Patrol|Scout Patrol')]
        for before, after in changes:
            with self.subTest(after=after), self.assertRaises(ProtocolError): parse_candidate(text.replace(before, after), cases)

    def test_parser_keeps_native_case_errors_independent(self):
        cases, _ = self.transport(); cases.append(dict(deepcopy(cases[0]), id='second'))
        rows = parse_candidate('ACT_CASE|shape\nACT_ERROR|locked\nACT_CASE|second\nACT_ERROR|stale unit\nAll tests passed.\n', cases)
        self.assertEqual([(row['status'], row['reason']) for row in rows], [('error', 'locked'), ('error', 'stale unit')])


if __name__ == '__main__': unittest.main()
