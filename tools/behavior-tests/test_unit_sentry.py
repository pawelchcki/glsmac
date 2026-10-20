"""Sentry evidence and transport integrity; candidate replay runs separately."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import unittest

from compare import validate_observations
from protocol import ProtocolError
from ui import unit_sentry_contract as contract
from ui.generate_unit_sentry import suite
from ui.unit_sentry_headless import parse_candidate
from ui.unit_selection_original import fingerprint as fixture_fingerprint

DIRECTORY = Path(__file__).parent / 'ui'


class UnitSentryTests(unittest.TestCase):
    def test_generator_supplies_exactly_eight_bounded_input_sequences(self):
        generated = suite()
        self.assertEqual(generated, json.loads((DIRECTORY / 'cases/unit-sentry.json').read_text()))
        self.assertEqual(len(generated['cases']), 8)
        self.assertEqual(len({case['id'] for case in generated['cases']}), 8)
        for case in generated['cases']:
            self.assertEqual(set(case), {'id', 'algorithm', 'input'})
            self.assertEqual(case['algorithm'], contract.ALGORITHM)
            contract.validate_input(case['input'])

    def test_eight_original_cases_bind_two_whole_captures_and_exact_observer(self):
        inputs = suite(); evidence = json.loads((DIRECTORY / 'observations/smacx-gog-2.0-unit-sentry.json').read_text())
        validate_observations(evidence, inputs)
        self.assertGreaterEqual(evidence['repeat'], 2)
        # Read frozen observer bytes without importing its fixture extension.
        fingerprint = hashlib.sha256(fixture_fingerprint().encode() + (DIRECTORY / 'unit_sentry_original.py').read_bytes()).hexdigest()
        self.assertEqual(evidence['reference']['adapter_sha256'], fingerprint)
        for case, row in zip(inputs['cases'], evidence['observations'], strict=True):
            contract.validate_output(row['output'], case['input']['actions'])
        changed = deepcopy(inputs); changed['cases'][0]['input']['actions'][0] = 'hold'
        with self.assertRaises(ProtocolError): validate_observations(evidence, changed)

    def test_inputs_reject_answers_unknown_actions_and_extra_turns(self):
        for data in (None, [], {}, {'profile': 'spread', 'actions': ['sleep']},
                     {'profile': 'stacked', 'actions': []}, {'profile': 'stacked', 'actions': 'sleep'},
                     {'profile': 'stacked', 'actions': [None]}, {'profile': 'stacked', 'actions': ['teleport']},
                     {'profile': 'stacked', 'actions': ['sleep'] * 13},
                     {'profile': 'stacked', 'actions': ['advance', 'advance']},
                     {'profile': 'stacked', 'actions': ['sleep'], 'selected': 'former'}):
            with self.subTest(data=data), self.assertRaises(ProtocolError): contract.validate_input(data)

    @staticmethod
    def witness():
        return {'trace': [{'year_delta': 0, 'selected': 'scout',
                           'units': [{'role': role, 'order_code': 0, 'movement_spent': 0} for role in contract.ROLES]}]}

    def test_protocol_requires_complete_typed_states_and_actual_initial_fixture(self):
        contract.validate_output(self.witness(), [])
        for output in (None, {}, {'trace': []}, {'trace': [None]}, {'trace': [self.witness()['trace'][0]] * 2}):
            with self.subTest(output=output), self.assertRaises(ProtocolError): contract.validate_output(output, [])
        for key in self.witness()['trace'][0]:
            output = self.witness(); del output['trace'][0][key]
            with self.subTest(key=key), self.assertRaises(ProtocolError): contract.validate_output(output, [])
        for key, values in (('year_delta', [True, 0.0, -1, 2]), ('selected', [False, 0, 'enemy', None])):
            for value in values:
                output = self.witness(); output['trace'][0][key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ProtocolError): contract.validate_output(output, [])
        for key, values in (('order_code', [True, -1, 3, 1.0]), ('movement_spent', [False, -1, 4]), ('role', ['former'])):
            for value in values:
                output = self.witness(); output['trace'][0]['units'][0][key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ProtocolError): contract.validate_output(output, [])

    @staticmethod
    def transport():
        cases = [{'id': 'wire', 'algorithm': contract.ALGORITHM, 'input': {'profile': 'stacked', 'actions': ['sleep']}}]
        units = ''.join(f'SENTRY_UNIT|{role}|0|0\n' for role in contract.ROLES)
        text = ('SENTRY_CASE|wire\nSENTRY_STATE|0|0|scout\n' + units + 'SENTRY_STATE_DONE\n'
                'SENTRY_STATE|1|0|scout\n' + units + 'SENTRY_STATE_DONE\nSENTRY_CASE_DONE\nAll tests passed.\n')
        return cases, text

    def test_parser_retains_actual_protocol_values_without_calculating_behavior(self):
        cases, text = self.transport(); output = parse_candidate(text, cases)[0]['output']
        state = self.witness()['trace'][0]
        self.assertEqual(output, {'trace': [state, deepcopy(state)]})
        # These are transport shapes, not supplied behavioral answers.
        text = text.replace('SENTRY_STATE|1|0|scout\nSENTRY_UNIT|scout|0|0',
                            'SENTRY_STATE|1|1|former\nSENTRY_UNIT|scout|1|2')
        output = parse_candidate(text, cases)[0]['output']['trace'][1]
        self.assertEqual((output['year_delta'], output['selected'], output['units'][0]['order_code'],
                          output['units'][0]['movement_spent']), (1, 'former', 1, 2))

    def test_parser_rejects_partial_duplicate_reordered_and_coerced_records(self):
        cases, text = self.transport()
        for before, after in [('SENTRY_CASE_DONE\n', ''), ('SENTRY_STATE_DONE\n', ''),
                              ('SENTRY_STATE|1', 'SENTRY_STATE|2'), ('|0|scout', '|0.0|scout'),
                              ('SENTRY_CASE|wire', 'SENTRY_CASE|unknown'), ('All tests passed.', ''),
                              ('SENTRY_STATE_DONE', 'SENTRY_UNKNOWN'),
                              ('SENTRY_CASE_DONE', 'SENTRY_CASE_DONE\nSENTRY_CASE_DONE'),
                              ('SENTRY_UNIT|scout', 'SENTRY_UNIT|former'),
                              ('SENTRY_UNIT|scout|0|0', 'SENTRY_UNIT|scout|0|-0'),
                              ('SENTRY_UNIT|scout|0|0', 'SENTRY_UNIT|scout|true|0'),
                              ('SENTRY_UNIT|scout|0|0', 'SENTRY_UNIT|scout|3|0')]:
            with self.subTest(after=after), self.assertRaises(ProtocolError): parse_candidate(text.replace(before, after), cases)

    def test_parser_isolates_native_case_errors(self):
        cases, _ = self.transport(); cases.append(dict(deepcopy(cases[0]), id='second'))
        rows = parse_candidate('SENTRY_CASE|wire\nSENTRY_ERROR|stale unit\nSENTRY_CASE|second\n'
                               'SENTRY_ERROR|locked tile\nAll tests passed.\n', cases)
        self.assertEqual([(row['status'], row['reason']) for row in rows], [('error', 'stale unit'), ('error', 'locked tile')])


if __name__ == '__main__': unittest.main()
