"""Sentry activation evidence and transport integrity; replay runs separately."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import unittest
from compare import validate_observations
from protocol import ProtocolError
from ui import unit_sentry_activation_contract as contract
from ui.unit_sentry_activation_headless import parse_candidate
from ui.unit_selection_original import fingerprint as fixture_fingerprint

DIRECTORY = Path(__file__).parent / 'ui'


class SentryActivationTests(unittest.TestCase):
    def test_four_original_cases_bind_two_captures_and_exact_observer_dependencies(self):
        inputs = json.loads((DIRECTORY / 'cases/unit-sentry-activation.json').read_text())
        evidence = json.loads((DIRECTORY / 'observations/smacx-gog-2.0-unit-sentry-activation.json').read_text())
        validate_observations(evidence, inputs)
        self.assertEqual(len(inputs['cases']), 4); self.assertGreaterEqual(evidence['repeat'], 2)
        # Never import either observer that extends the original fixture globally.
        sentry = hashlib.sha256(fixture_fingerprint().encode() + (DIRECTORY / 'unit_sentry_original.py').read_bytes()).hexdigest()
        activation = hashlib.sha256(fixture_fingerprint().encode() + (DIRECTORY / 'unit_activation_original.py').read_bytes()).hexdigest()
        fingerprint = hashlib.sha256(sentry.encode() + activation.encode() + (DIRECTORY / 'unit_sentry_activation_original.py').read_bytes()).hexdigest()
        self.assertEqual(fingerprint, evidence['reference']['adapter_sha256'])
        for case, row in zip(inputs['cases'], evidence['observations'], strict=True):
            self.assertEqual(case['algorithm'], contract.ALGORITHM)
            self.assertEqual(set(case), {'id', 'algorithm', 'input'})
            contract.validate_input(case['input']); contract.validate_output(row['output'], case['input']['actions'])
        changed = deepcopy(inputs); changed['cases'][0]['input']['setup'][0] = 'skip'
        with self.assertRaises(ProtocolError): validate_observations(evidence, changed)

    def test_input_rejects_answers_invalid_setup_and_post_close_popup_actions(self):
        valid = {'profile': 'stacked', 'setup': ['sleep', 'skip', 'hold'], 'actions': ['open', 'down', 'enter', 'wait', 'tab']}
        contract.validate_input(valid)
        for field, values in [('profile', ['spread', None]), ('setup', [None, 'sleep', [], ['sleep'] * 2, ['sleep'] * 4, ['sleep', True, 'hold']]),
                              ('actions', [None, [], ['open', 'wait'], ['enter'], ['open', 'open'], ['open', 'escape', 'down'],
                                           ['open', 'enter', 'escape'], ['open', False], ['open'] + ['down'] * 10])]:
            for value in values:
                data = deepcopy(valid); data[field] = value
                with self.subTest(field=field, value=value), self.assertRaises(ProtocolError): contract.validate_input(data)
        with self.assertRaises(ProtocolError): contract.validate_input(dict(valid, selected='scout'))

    @staticmethod
    def state():
        return {'year_delta': 0, 'picker': None, 'selected': None,
                'units': [{'role': role, 'order_code': 1, 'movement_spent': 0} for role in contract.ROLES]}

    def test_schema_requires_typed_complete_native_units_and_initial_closed_fixture(self):
        contract.validate_output({'trace': [self.state()]}, [])
        for key in self.state():
            state = self.state(); del state[key]
            with self.subTest(key=key), self.assertRaises(ProtocolError): contract.validate_state(state)
        for key, values in [('year_delta', [True, 0.0, 1]), ('selected', [True, 1, 'enemy'])]:
            for value in values:
                state = self.state(); state[key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ProtocolError): contract.validate_state(state)
        for key, values in [('order_code', [True, 1.0, -1, 3]), ('movement_spent', [False, -1, 4]), ('role', ['colony'])]:
            for value in values:
                state = self.state(); state['units'][0][key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ProtocolError): contract.validate_state(state)
        state = self.state(); state['selected'] = 'scout'
        with self.assertRaises(ProtocolError): contract.validate_output({'trace': [state]}, [])
        with self.assertRaises(ProtocolError): contract.validate_output({'trace': []}, [])
        with self.assertRaises(ProtocolError): contract.validate_output({'trace': [self.state()]}, ['open'])

    def test_picker_requires_three_distinct_displayed_roles_and_an_actual_highlight(self):
        good = {'caption': 'PICK AN OWNED UNIT', 'choices': ['colony', 'scout', 'former'], 'selected': 'scout'}
        state = self.state(); state['picker'] = good; contract.validate_state(state)
        for picker in ({}, dict(good, caption=''), dict(good, choices=['scout'] * 3), dict(good, selected=None),
                       dict(good, choices=['colony', 'scout', None]), dict(good, selected='enemy'), dict(good, selected=0)):
            state = self.state(); state['picker'] = picker
            with self.subTest(picker=picker), self.assertRaises(ProtocolError): contract.validate_state(state)
        with self.assertRaises(ProtocolError): contract.validate_output({'trace': [state]}, [])

    @staticmethod
    def transport():
        cases = [{'id': 'wire', 'algorithm': contract.ALGORITHM, 'input': {'profile': 'stacked', 'setup': ['sleep'] * 3, 'actions': ['open']}}]
        units = ''.join(f'SA_UNIT|{role}|1|0\n' for role in contract.ROLES)
        text = ('SA_CASE|wire\nSA_STATE|0|0|none\nSA_CLOSED\n' + units + 'SA_STATE_DONE\n'
                'SA_STATE|1|0|none\nSA_PICKER|Select a unit\n'
                'SA_CHOICE|colony|Colony Pod|2 Colony Pod\nSA_CHOICE|scout|Scout Patrol|1 Scout Patrol\n'
                'SA_CHOICE|former|Formers|1 Formers\nSA_HIGHLIGHT|scout\n' + units +
                'SA_STATE_DONE\nSA_CASE_DONE\nAll tests passed.\n')
        return cases, text

    def test_parser_preserves_actual_native_values_and_observed_popup(self):
        cases, text = self.transport(); rows = parse_candidate(text, cases)
        self.assertEqual(rows[0]['output']['trace'][0], self.state())
        state = rows[0]['output']['trace'][1]
        self.assertEqual(state['picker'], {'caption': 'SELECT A UNIT', 'choices': ['colony', 'scout', 'former'], 'selected': 'scout'})
        text = text.replace('SA_UNIT|scout|1|0', 'SA_UNIT|scout|0|3')
        self.assertEqual(parse_candidate(text, cases)[0]['output']['trace'][1]['units'][0], {'role': 'scout', 'order_code': 0, 'movement_spent': 3})

    def test_parser_rejects_partial_duplicate_reordered_coerced_and_unlabelled_records(self):
        cases, text = self.transport()
        for before, after in [('SA_CASE_DONE\n', ''), ('SA_STATE_DONE\n', ''), ('SA_STATE|1', 'SA_STATE|2'),
                              ('SA_STATE|1|0|none', 'SA_STATE|1|0.0|none'), ('SA_CASE|wire', 'SA_CASE|unknown'),
                              ('All tests passed.', ''), ('SA_HIGHLIGHT|scout', 'SA_HIGHLIGHT|enemy'),
                              ('SA_HIGHLIGHT|scout', 'SA_HIGHLIGHT|scout\nSA_HIGHLIGHT|scout'),
                              ('SA_CLOSED', 'SA_CLOSED\nSA_CLOSED'), ('SA_CASE_DONE', 'SA_CASE_DONE\nSA_CASE_DONE'),
                              ('SA_UNIT|scout', 'SA_UNIT|former'), ('SA_UNIT|scout|1|0', 'SA_UNIT|scout|1|-0'),
                              ('SA_UNIT|scout|1|0', 'SA_UNIT|scout|true|0'), ('SA_UNIT|scout|1|0', 'SA_UNIT|scout|3|0'),
                              ('SA_CHOICE|scout|Scout Patrol|1 Scout Patrol', 'SA_CHOICE|scout|Scout Patrol|1 Formers')]:
            with self.subTest(after=after), self.assertRaises(ProtocolError): parse_candidate(text.replace(before, after), cases)

    def test_parser_isolates_native_case_failures(self):
        cases, _ = self.transport(); cases.append(dict(deepcopy(cases[0]), id='second'))
        rows = parse_candidate('SA_CASE|wire\nSA_ERROR|stale unit\nSA_CASE|second\nSA_ERROR|locked tile\nAll tests passed.\n', cases)
        self.assertEqual([(row['status'], row['reason']) for row in rows], [('error', 'stale unit'), ('error', 'locked tile')])


if __name__ == '__main__': unittest.main()
