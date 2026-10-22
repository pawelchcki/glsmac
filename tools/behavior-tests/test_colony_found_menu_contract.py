"""Strict public input boundaries for real city-founding comparisons."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

import compare

from protocol import ProtocolError, validate_cases
from ui import colony_found_menu_contract as contract
from ui import colony_found_menu_inputs as inputs


class ColonyFoundMenuContractTests(unittest.TestCase):
    def test_checked_in_cases_are_exact_input_generator_and_distinct_control_paths(self):
        suite = inputs.suite()
        path = Path(__file__).parent / 'ui/cases/colony-found-menu.json'
        self.assertEqual(json.loads(path.read_text()), suite)
        self.assertEqual(len(validate_cases(suite)), 2)
        paths = [case['input']['actions'] for case in suite['cases']]
        self.assertIn('button-cancel', paths[0])
        self.assertIn('button-ok', paths[0])
        self.assertIn('cancel', paths[1])
        self.assertIn('confirm', paths[1])
        for case in suite['cases']:
            contract.validate_input(case['input'])
            self.assertNotIn('output', case)

    def test_rejects_undeclared_layout_source_slot_actions_and_boolean_ordinals(self):
        good = inputs.suite()['cases'][0]['input']
        bad_values = []
        for key, value in [('profile', 'stacked'), ('text_profile', 'stock'), ('expected_name', 'Cedar Reach')]:
            bad = deepcopy(good); bad[key] = value; bad_values.append(bad)
        for action in [{'row_source': 1}, {'row_source': False}, {'header': True}, {'edit': ''}, 'found']:
            bad = deepcopy(good); bad['actions'][2] = action; bad_values.append(bad)
        bad = deepcopy(good); bad['initial_base']['workers'] = False; bad_values.append(bad)
        bad = deepcopy(good); bad['actions'].pop(); bad_values.append(bad)
        for bad in bad_values:
            with self.subTest(data=bad), self.assertRaises(ProtocolError):
                contract.validate_input(bad)

    def test_installed_profiles_edit_source_identity_and_supply_full_bounded_name_pools(self):
        base = inputs.base_inputs.declarations('synthetic')
        for profile in contract.PROFILES:
            declarations = inputs.declarations(profile)
            source = inputs.SOURCE_TEXT[profile]
            menu = declarations['menu.txt'].splitlines()
            original = base['menu.txt'].splitlines()
            index = original.index('#ACTION') + 2
            self.assertEqual(menu[:index], original[:index])
            self.assertEqual(menu[index+1:], original[index+1:])
            self.assertEqual(menu[index].split('|', 1)[1], original[index].split('|', 1)[1])
            self.assertEqual(menu[index].split('|', 1)[0], source['row'])
            self.assertEqual(inputs.source_label(profile), source['row'])
            self.assertEqual(declarations['gaians.txt'].splitlines()[1:65], [source['draft']] * 64)
            self.assertIn('#caption ' + source['caption'], declarations['script.txt'])
            self.assertIn('\n' + source['label'] + '\n', declarations['script.txt'])
            self.assertNotIn('xscript.txt', declarations)
            self.assertEqual(declarations['alphax.txt'], base['alphax.txt'])
        with self.assertRaises(ProtocolError):
            inputs.declarations('unknown')

    def test_accepted_original_evidence_requires_repeat_and_exact_complete_inputs(self):
        suite = inputs.suite()
        path = Path(__file__).parent / 'ui/observations/smacx-gog-2.0-colony-found-menu.json'
        record = compare.read_json(path)
        outputs = compare.validate_observations(record, suite)
        self.assertGreaterEqual(record['repeat'], 2)
        for case in suite['cases']:
            contract.validate_output(outputs[case['id']], case['input']['actions'])
        changed = deepcopy(suite)
        changed['cases'][0]['input']['text_profile'] = 'found-edited'
        with self.assertRaises(ProtocolError):
            compare.validate_observations(record, changed)
        incomplete = deepcopy(record)
        incomplete['observations'].pop()
        with self.assertRaises(ProtocolError):
            compare.validate_observations(incomplete, suite)

    def test_output_validator_rejects_partial_traces_extra_fields_and_invalid_native_types(self):
        state = dict(year_delta=0, selected='colony', owned_count=1, new_base=None,
                     units=[dict(role=role, order_code=0, movement_spent=0) for role in ('scout', 'former', 'colony')],
                     root_open=False, child_header=None, dialog=None)
        actions = contract.SEQUENCES['synthetic']
        good = dict(trace=[deepcopy(state) for _ in range(len(actions)+1)])
        contract.validate_output(good, actions)
        bad_values = []
        bad = deepcopy(good); bad['trace'].pop(); bad_values.append(bad)
        for key, value in [('year_delta', True), ('year_delta', 1), ('root_open', 0), ('owned_count', True),
                           ('child_header', False), ('selected', 'foreign'), ('expected', True)]:
            bad = deepcopy(good); bad['trace'][0][key] = value; bad_values.append(bad)
        bad = deepcopy(good); bad['trace'][0]['units'][0]['movement_spent'] = True; bad_values.append(bad)
        bad = deepcopy(good); bad['trace'][0]['units'].reverse(); bad_values.append(bad)
        bad = deepcopy(good); bad['trace'][0]['dialog'] = dict(caption='Name', label='Name:', value='x'*25, buttons=['OK','Cancel']); bad_values.append(bad)
        for bad in bad_values:
            with self.subTest(data=bad), self.assertRaises(ProtocolError):
                contract.validate_output(bad, actions)


if __name__ == '__main__':
    unittest.main()
