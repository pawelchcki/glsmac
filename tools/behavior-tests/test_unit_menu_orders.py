import json
from copy import deepcopy
from pathlib import Path
import unittest

import compare
from protocol import ProtocolError
from ui import unit_menu_orders_contract as contract
from ui import unit_menu_orders_inputs as inputs


DIRECTORY = Path(__file__).parent / 'ui'


class UnitMenuOrdersTests(unittest.TestCase):
    def test_checked_in_inputs_match_generator_without_outputs(self):
        suite = json.loads((DIRECTORY / 'cases/unit-menu-orders.json').read_text())
        self.assertEqual(suite, inputs.suite())
        self.assertEqual(len(suite['cases']), 6)
        for case in suite['cases']:
            contract.validate_input(case['input'])
            self.assertEqual(set(case), {'id', 'algorithm', 'input'})
            self.assertEqual(case['algorithm'], contract.ALGORITHM)

    def test_sources_are_independent_and_change_only_declared_action_inputs(self):
        source = inputs.declarations('synthetic')
        self.assertEqual(source, inputs.base_inputs.declarations('synthetic'))
        changed = inputs.declarations('action-edited')
        self.assertEqual(source['alphax.txt'], changed['alphax.txt'])
        original_lines = source['menu.txt'].splitlines()
        edited_lines = changed['menu.txt'].splitlines()
        start = original_lines.index('#ACTION')
        differences = [index for index, pair in enumerate(zip(original_lines, edited_lines, strict=True))
                       if pair[0] != pair[1]]
        self.assertEqual(differences, [start + 1, start + 28, start + 31, start + 32])
        for slot in contract.SOURCE_SLOTS:
            self.assertNotEqual(inputs.source_label('synthetic', slot), inputs.source_label('action-edited', slot))
            index = start + 2 + slot
            self.assertEqual(original_lines[index].split('|')[1], edited_lines[index].split('|')[1])
        changed['menu.txt'] = 'mutated caller buffer'
        self.assertEqual(inputs.declarations('synthetic'), source)

    def test_boolean_indices_unknown_commands_and_unrecorded_sequences_fail(self):
        sample = inputs.suite()['cases'][0]['input']
        for action in ({'header': True}, {'row_source': True}, {'row_source': 0}, 'escape', {'key': 'L'}):
            altered = deepcopy(sample)
            altered['actions'][2] = action
            with self.subTest(action=action), self.assertRaises(ProtocolError):
                contract.validate_input(altered)
        altered = deepcopy(sample)
        altered['actions'] = list(reversed(altered['actions']))
        with self.assertRaises(ProtocolError):
            contract.validate_input(altered)
        altered = deepcopy(sample)
        altered['initial_base']['doctors'] = True
        with self.assertRaises(ProtocolError):
            contract.validate_input(altered)

    def test_source_selector_is_input_only_and_rejects_invalid_types(self):
        for slot, name in ((26, '&Watch Here'), (29, '&Stay Here'), (30, '&Pause Now')):
            self.assertEqual(inputs.source_label('action-edited', slot), name)
        for value in (True, -1, 31, 26.0, '26'):
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                inputs.source_label('synthetic', value)
        with self.assertRaises(ProtocolError):
            inputs.declarations('unknown')

    def pilot(self):
        return json.loads((DIRECTORY / 'observations/smacx-gog-2.0-unit-menu-orders-pilot.json').read_text())

    def test_output_schema_does_not_infer_command_effects(self):
        output = deepcopy(self.pilot()['observations'][0]['output'])
        # An alternate actual outcome is well formed even if it will disagree
        # with the oracle. Shape validation must never supply Sentry effects.
        for state in output['trace']:
            state['selected'] = 'scout'
            for unit in state['units']:
                unit['order_code'] = 0
                unit['movement_spent'] = 0
        contract.validate_output(output, inputs.suite()['cases'][0]['input']['actions'])

    def test_complete_checkpoints_and_native_bounds_remain_required(self):
        output = deepcopy(self.pilot()['observations'][0]['output'])
        actions = inputs.suite()['cases'][0]['input']['actions']
        output['trace'].pop()
        with self.assertRaises(ProtocolError):
            contract.validate_output(output, actions)
        output = deepcopy(self.pilot()['observations'][0]['output'])
        output['trace'][-1]['units'][0]['movement_spent'] = 4
        with self.assertRaises(ProtocolError):
            contract.validate_output(output, actions)

    def test_pilot_is_independently_captured_and_not_counted_again(self):
        suite = json.loads((DIRECTORY / 'cases/unit-menu-orders-pilot.json').read_text())
        evidence = self.pilot()
        compare.validate_observations(evidence, suite)
        self.assertEqual(len(evidence['observations']), 1)
        self.assertGreaterEqual(evidence['repeat'], 2)
        self.assertEqual(evidence['reference']['adapter_sha256'],
                         '4df0bc88dfc3d466773fd1ea3c87a54cb61dbd051fde339a236dd9d6056bae5b')
        self.assertEqual(suite['cases'][0], inputs.suite()['cases'][0])
        catalog = json.loads((DIRECTORY / 'catalog.json').read_text())
        self.assertNotIn('observations/smacx-gog-2.0-unit-menu-orders-pilot.json',
                         [row['observations'] for row in catalog['references']])

    def test_complete_original_evidence_is_bound_to_inputs_and_observer(self):
        from ui.unit_menu_orders_original import fingerprint
        suite = inputs.suite()
        evidence = json.loads((DIRECTORY / 'observations/smacx-gog-2.0-unit-menu-orders.json').read_text())
        compare.validate_observations(evidence, suite)
        self.assertEqual(len(evidence['observations']), 6)
        self.assertGreaterEqual(evidence['repeat'], 2)
        self.assertEqual(evidence['reference']['adapter_sha256'], fingerprint())
        self.assertEqual(evidence['reference']['contract'], contract.ALGORITHM)
        self.assertEqual(sum(len(row['output']['trace']) for row in evidence['observations']), 30)
        for case, row in zip(suite['cases'], evidence['observations'], strict=True):
            contract.validate_output(row['output'], case['input']['actions'])
        changed = deepcopy(suite)
        changed['cases'][0]['input']['text_profile'] = 'action-edited'
        with self.assertRaises(ProtocolError):
            compare.validate_observations(evidence, changed)


if __name__ == '__main__':
    unittest.main()
