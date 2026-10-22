"""Public disband input, schema and immutable-original evidence boundaries."""
from copy import deepcopy
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
import compare
from protocol import ProtocolError, validate_cases
from ui import unit_disband_contract as contract
from ui import unit_disband_inputs as inputs
from ui import run
DIRECTORY = Path(__file__).parent / 'ui'


class UnitDisbandContractTests(unittest.TestCase):
    def test_public_inputs_and_profile_source_identity_are_exact(self):
        suite = inputs.suite()
        self.assertEqual(json.loads((DIRECTORY / 'cases/unit-disband.json').read_text()), suite)
        self.assertEqual(len(validate_cases(suite)), 2)
        for case in suite['cases']:
            contract.validate_input(case['input'])
            self.assertNotIn('output', case)
        self.assertIn('cancel', suite['cases'][0]['input']['actions'])
        self.assertEqual(suite['cases'][0]['input']['actions'][-1], 'confirm')
        self.assertEqual(suite['cases'][1]['input']['actions'][-1], 'button-ok')
        for profile in contract.PROFILES:
            files = inputs.declarations(profile)
            original = inputs.previous.declarations('synthetic')
            menu = files['menu.txt'].splitlines(); baseline = original['menu.txt'].splitlines()
            index = baseline.index('#ACTION') + 2 + 9
            self.assertEqual(menu[:index], baseline[:index])
            self.assertEqual(menu[index + 1:], baseline[index + 1:])
            self.assertEqual(menu[index].split('|', 1)[1], baseline[index].split('|', 1)[1])
            self.assertEqual(menu[index].split('|', 1)[0], inputs.source_label(profile))
            self.assertEqual(files['alphax.txt'], original['alphax.txt'])
            for name, definition in [('script.txt', inputs.SOURCE_TEXT[profile]), ('xscript.txt', inputs.EXPANSION)]:
                self.assertEqual(files[name].count('#DISBAND2\n'), 1)
                self.assertIn('\n' + definition['body'] + '\n', files[name])
                self.assertIn('\n' + '\n'.join(definition['choices']) + '\n', files[name])
            self.assertNotEqual(files['script.txt'], files['xscript.txt'])
        with self.assertRaises(ProtocolError): inputs.declarations('unknown')

    def test_undeclared_layout_actions_slots_and_extra_fields_reject(self):
        good = inputs.suite()['cases'][0]['input']; defects = []
        for key, value in [('profile', 'stacked'), ('text_profile', 'stock'), ('answer', 'removed')]:
            bad = deepcopy(good); bad[key] = value; defects.append(bad)
        for action in [{'row_source': True}, {'row_source': 0}, {'header': False}, 'overload']:
            bad = deepcopy(good); bad['actions'][3] = action; defects.append(bad)
        bad = deepcopy(good); bad['initial_base']['workers'] = False; defects.append(bad)
        bad = deepcopy(good); bad['actions'].pop(); defects.append(bad)
        for bad in defects:
            with self.subTest(data=bad), self.assertRaises(ProtocolError): contract.validate_input(bad)

    def test_output_schema_accepts_observations_without_action_derived_effects(self):
        state = dict(year_delta=0, selected='former', owned_count=1,
                     units=[dict(role=role, order_code=0, movement_spent=0) for role in contract.ROLES],
                     root_open=False, child_header=None, dialog=None)
        for removed in (False, True):
            state['units'] = [dict(role=role, order_code=0, movement_spent=0)
                              for role in (('scout', 'colony') if removed else contract.ROLES)]
            for selected in range(3):
                state['dialog'] = dict(caption='OBSERVED TITLE', body='INDEPENDENT QUESTION?',
                                      choices=['FIRST', 'SECOND', 'THIRD'], selected=selected, buttons=['ACCEPT'])
                contract.validate_output(dict(trace=[deepcopy(state)]), [])
        good = dict(trace=[deepcopy(state) for _ in range(len(contract.SEQUENCES['synthetic']) + 1)])
        contract.validate_output(good, contract.SEQUENCES['synthetic']); defects = []
        bad = deepcopy(good); bad['trace'].pop(); defects.append(bad)
        for key, value in [('year_delta', True), ('year_delta', 1), ('owned_count', True),
                           ('selected', 'foreign'), ('root_open', 1), ('child_header', False), ('answer', 1)]:
            bad = deepcopy(good); bad['trace'][0][key] = value; defects.append(bad)
        for key, value in [('choices', ['ONE']), ('selected', True), ('selected', 3),
                           ('buttons', []), ('body', ''), ('extra', 'answer')]:
            bad = deepcopy(good); bad['trace'][0]['dialog'][key] = value; defects.append(bad)
        bad = deepcopy(good); bad['trace'][0]['units'].reverse(); defects.append(bad)
        bad = deepcopy(good); bad['trace'][0]['units'][0]['movement_spent'] = True; defects.append(bad)
        for bad in defects:
            with self.subTest(data=bad), self.assertRaises(ProtocolError): contract.validate_output(bad, contract.SEQUENCES['synthetic'])

    def test_reference_is_complete_repeatable_and_bound_to_declared_inputs(self):
        suite = inputs.suite()
        record = compare.read_json(DIRECTORY / 'observations/smacx-gog-2.0-unit-disband.json')
        outputs = compare.validate_observations(record, suite)
        self.assertGreaterEqual(record['repeat'], 2)
        for case in suite['cases']: contract.validate_output(outputs[case['id']], case['input']['actions'])
        changed = deepcopy(suite); changed['cases'][0]['input']['actions'].pop()
        incomplete = deepcopy(record); incomplete['observations'].pop()
        with self.assertRaises(ProtocolError): compare.validate_observations(record, changed)
        with self.assertRaises(ProtocolError): compare.validate_observations(incomplete, suite)

    def test_candidate_dispatch_needs_no_original_assets_or_renderer(self):
        args = SimpleNamespace(browser=False, record=False)
        command = run.unit_disband_command(args)
        self.assertIn('unit_disband_headless.py', command)
        self.assertNotIn('--assets', command)
        args.browser = True
        with self.assertRaises(ProtocolError): run.unit_disband_command(args)


if __name__ == '__main__': unittest.main()
