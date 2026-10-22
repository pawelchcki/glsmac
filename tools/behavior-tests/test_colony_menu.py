"""Colony menu public input identity, evidence completeness and dispatch."""
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
import unittest
import compare
from protocol import ProtocolError
from ui import colony_menu_contract as contract
from ui import colony_menu_inputs as inputs
from ui import run

DIRECTORY = Path(__file__).resolve().parent / 'ui'


class ColonyMenuTests(unittest.TestCase):
    def test_public_inputs_and_repeated_original_evidence_are_exact_and_complete(self):
        suite = compare.read_json(DIRECTORY / 'cases/colony-menu-join.json')
        self.assertEqual(suite, inputs.suite())
        record = compare.read_json(DIRECTORY / 'observations/smacx-gog-2.0-colony-menu-join.json')
        outputs = compare.validate_observations(record, suite)
        self.assertEqual(len(outputs), 2)
        self.assertGreaterEqual(record['repeat'], 2)
        for case in suite['cases']:
            contract.validate_input(case['input'])
            contract.validate_output(outputs[case['id']], case['input']['actions'])
        changed = deepcopy(suite)
        changed['cases'][0]['input']['actions'][-1] = 'menu'
        with self.assertRaises(ProtocolError):
            compare.validate_observations(record, changed)

    def test_edited_label_changes_only_declared_action_source_one(self):
        left, right = [inputs.declarations(profile) for profile in contract.PROFILES]
        self.assertEqual(left['alphax.txt'], right['alphax.txt'])
        a, b = left['menu.txt'].splitlines(), right['menu.txt'].splitlines()
        changed = [index for index, pair in enumerate(zip(a, b, strict=True)) if pair[0] != pair[1]]
        self.assertEqual(changed, [a.index('#ACTION') + 3])
        self.assertEqual(a[changed[0]].split('|')[1], b[changed[0]].split('|')[1])

    def test_invalid_inputs_and_incomplete_native_states_cannot_pass(self):
        data = inputs.suite()['cases'][0]['input']
        for item in (dict(data, actions=['tab']), dict(data, profile='spread'),
                     dict(data, actions=['tab', 'tab', 'menu', {'header': 4}, {'row_source': True}, 'tab']),
                     dict(data, text_profile='unrecognized')):
            with self.subTest(item=item), self.assertRaises(ProtocolError):
                contract.validate_input(item)
        record = compare.read_json(DIRECTORY / 'observations/smacx-gog-2.0-colony-menu-join.json')
        output = record['observations'][0]['output']
        for change in ('missing-unit', 'unknown-child', 'child-without-parent', 'bad-population'):
            altered = deepcopy(output)
            state = altered['trace'][0]
            if change == 'missing-unit':
                state['units'] = state['units'][1:]
            elif change == 'unknown-child':
                state['child_header'] = 5
            elif change == 'child-without-parent':
                state.update(root_open=False, child_header=4)
            else:
                state['base']['population'] = True
            with self.subTest(change=change), self.assertRaises(ProtocolError):
                contract.validate_output(altered, data['actions'])

    def test_candidate_dispatch_is_asset_free_and_keeps_browser_scope_explicit(self):
        args = SimpleNamespace(record=False, browser=False)
        command = run.colony_menu_command(args)
        self.assertIn('colony_menu_headless.py', command)
        self.assertNotIn('--assets', command)
        args.browser = True
        with self.assertRaises(ProtocolError):
            run.colony_menu_command(args)
