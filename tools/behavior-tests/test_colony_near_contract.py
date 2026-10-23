"""Public boundaries and immutable evidence for adjacent-city Action controls."""
from copy import deepcopy
import json
from pathlib import Path
from types import SimpleNamespace
import unittest

import compare
from protocol import ProtocolError, validate_cases
from ui import colony_near_contract as contract
from ui import colony_near_inputs as inputs
from ui import run

DIRECTORY = Path(__file__).parent / 'ui'


class ColonyNearContractTests(unittest.TestCase):
    def test_exact_public_case_generation_and_source_identity(self):
        suite = inputs.suite()
        self.assertEqual(json.loads((DIRECTORY / 'cases/colony-adjacent-warning.json').read_text()), suite)
        self.assertEqual(len(validate_cases(suite)), 2)
        for case in suite['cases']:
            contract.validate_input(case['input'])
            self.assertNotIn('output', case)
            self.assertEqual(case['input']['actions'][-1], {'row_source': 0})
        for profile in contract.PROFILES:
            files = inputs.declarations(profile)
            original = inputs.previous.declarations('synthetic')
            menu = files['menu.txt'].splitlines()
            old_menu = original['menu.txt'].splitlines()
            index = old_menu.index('#ACTION') + 2
            self.assertEqual(menu[:index], old_menu[:index])
            self.assertEqual(menu[index + 1:], old_menu[index + 1:])
            self.assertEqual(menu[index].split('|', 1)[1], old_menu[index].split('|', 1)[1])
            self.assertEqual(menu[index].split('|', 1)[0], inputs.source_label(profile))
            self.assertIn('\n' + inputs.SOURCE_TEXT[profile]['body'] + '\n', files['script.txt'])
            self.assertEqual(files['script.txt'].count('#BASETOONEAR\n'), 1)
            self.assertEqual(files['script.txt'].count('#NEWBASE\n'), 1)
            self.assertEqual(files['gaians.txt'], original['gaians.txt'])
            self.assertEqual(files['alphax.txt'], original['alphax.txt'])
            self.assertNotIn('xscript.txt', files)
        with self.assertRaises(ProtocolError):
            inputs.declarations('unknown')

    def test_unsupported_contexts_extra_fields_and_boolean_ordinals_rejected(self):
        good = inputs.suite()['cases'][0]['input']
        bad_values = []
        for key, value in [('profile', 'stacked'), ('text_profile', 'stock'), ('expected_message', 'answer')]:
            bad = deepcopy(good); bad[key] = value; bad_values.append(bad)
        for action in [{'row_source': 1}, {'row_source': False}, {'header': True}, 'found']:
            bad = deepcopy(good); bad['actions'][-1] = action; bad_values.append(bad)
        bad = deepcopy(good); bad['initial_base']['workers'] = False; bad_values.append(bad)
        bad = deepcopy(good); bad['actions'].pop(); bad_values.append(bad)
        for bad in bad_values:
            with self.subTest(data=bad), self.assertRaises(ProtocolError):
                contract.validate_input(bad)

    def test_output_reads_arbitrary_observed_message_and_dialog_presence(self):
        state = dict(year_delta=0, selected='colony', owned_count=1,
                     units=[dict(role=role, order_code=0, movement_spent=0)
                            for role in ('scout', 'former', 'colony')],
                     root_open=True, child_header=None, dialog_open=False, message='INDEPENDENT OBSERVED WORDS')
        for message in (None, 'DIFFERENT OBSERVED WORDS'):
            state['message'] = message
            for dialog in (False, True):
                state['dialog_open'] = dialog
                contract.validate_output(dict(trace=[deepcopy(state)]), [])
        good = dict(trace=[deepcopy(state) for _ in range(len(contract.ACTIONS) + 1)])
        contract.validate_output(good, contract.ACTIONS)
        bad_values = []
        bad = deepcopy(good); bad['trace'].pop(); bad_values.append(bad)
        for key, value in [('year_delta', True), ('year_delta', 1), ('owned_count', True),
                           ('root_open', 0), ('dialog_open', 1), ('message', ''),
                           ('selected', 'foreign'), ('child_header', False), ('answer', True)]:
            bad = deepcopy(good); bad['trace'][0][key] = value; bad_values.append(bad)
        bad = deepcopy(good); bad['trace'][0]['units'].reverse(); bad_values.append(bad)
        bad = deepcopy(good); bad['trace'][0]['units'][0]['movement_spent'] = True; bad_values.append(bad)
        for bad in bad_values:
            with self.subTest(data=bad), self.assertRaises(ProtocolError):
                contract.validate_output(bad, contract.ACTIONS)

    def test_accepted_evidence_is_repeatable_bound_to_inputs_and_complete(self):
        suite = inputs.suite()
        record = compare.read_json(DIRECTORY / 'observations/smacx-gog-2.0-colony-adjacent-warning-immediate.json')
        outputs = compare.validate_observations(record, suite)
        self.assertGreaterEqual(record['repeat'], 2)
        for case in suite['cases']:
            contract.validate_output(outputs[case['id']], case['input']['actions'])
        changed = deepcopy(suite)
        changed['cases'][0]['input']['text_profile'] = 'near-edited'
        incomplete = deepcopy(record); incomplete['observations'].pop()
        with self.assertRaises(ProtocolError):
            compare.validate_observations(record, changed)
        with self.assertRaises(ProtocolError):
            compare.validate_observations(incomplete, suite)

    def test_display_free_dispatch_requires_no_original_assets(self):
        args = SimpleNamespace(browser=False, record=False)
        command = run.colony_near_command(args)
        self.assertIn('colony_near_headless.py', command)
        self.assertNotIn('--assets', command)
        args.browser = True
        with self.assertRaises(ProtocolError):
            run.colony_near_command(args)


if __name__ == '__main__':
    unittest.main()
