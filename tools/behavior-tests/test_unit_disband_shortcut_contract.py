"""Input validation only; reference answers must come from repeated original runs."""
from copy import deepcopy
import unittest
from protocol import ProtocolError
from ui import unit_disband_shortcut_contract as contract
from ui import unit_disband_shortcut_inputs as inputs


class ShortcutInputs(unittest.TestCase):
    def test_declared_scenarios_use_real_keyboard_and_no_menu_clicks(self):
        suite = inputs.suite()
        self.assertEqual(len(suite['cases']), 2)
        for case in suite['cases']:
            contract.validate_input(case['input'])
            self.assertEqual(case['algorithm'], contract.ALGORITHM)
            self.assertEqual(case['input']['actions'].count('disband-shortcut'), 2)
            self.assertNotIn('menu', case['input']['actions'])
            self.assertTrue(all(isinstance(action, str) for action in case['input']['actions']))
            self.assertNotIn('output', case)

    def test_pointer_substitution_and_other_initial_contexts_are_rejected(self):
        data = inputs.suite()['cases'][0]['input']
        for field, value in [('actions', ['tab', 'menu', {'header': 4}, {'row_source': 9}]),
                             ('profile', 'stacked'), ('text_profile', 'disband-name')]:
            changed = deepcopy(data)
            changed[field] = value
            with self.assertRaises(ProtocolError):
                contract.validate_input(changed)

    def test_initial_integer_fields_reject_boolean_aliases(self):
        data = inputs.suite()['cases'][0]['input']
        data['initial_base']['workers'] = False
        with self.assertRaises(ProtocolError):
            contract.validate_input(data)
