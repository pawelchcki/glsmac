"""Public inputs, immutable original evidence and strict command dispatch."""
from copy import deepcopy
import json
from pathlib import Path
from types import SimpleNamespace
import unittest

import compare
from protocol import ProtocolError
from ui import terraform_menu_contract as contract
from ui import terraform_menu_inputs as inputs
from ui import run

DIRECTORY = Path(__file__).resolve().parent / 'ui'


class TerraformMenuTests(unittest.TestCase):
    def test_public_inputs_are_exactly_generated_without_outputs(self):
        suite = json.loads((DIRECTORY / 'cases/terraform-menu-work.json').read_text())
        self.assertEqual(suite, inputs.suite())
        self.assertEqual(len(suite['cases']), 8)
        for case in suite['cases']:
            self.assertEqual(set(case), {'id', 'algorithm', 'input'})
            contract.validate_input(case['input'])

    def test_edited_sources_preserve_command_indices_rates_and_prerequisites(self):
        stock = inputs.declarations('synthetic')
        edited = inputs.declarations('terrain-edited')
        self.assertEqual(stock['menu.txt'], edited['menu.txt'])
        left, right = [source['alphax.txt'].splitlines() for source in (stock, edited)]
        changed = []
        for index, (a, b) in enumerate(zip(left, right, strict=True)):
            if a != b:
                changed.append(index - 1)
                self.assertEqual(a.split(',')[1:], b.split(',')[1:])
        self.assertEqual(tuple(changed), contract.TERRAIN_ROWS)
        self.assertEqual(len(left[1:-1]), 20)

    def test_malformed_inputs_are_rejected_before_execution(self):
        data = inputs.suite()['cases'][0]['input']
        invalid = [dict(data, profile='stacked'), dict(data, text_profile='unknown'),
                   dict(data, actions=[{'terrain_index': True}]), dict(data, actions=[{'terrain_index': 1}]),
                   dict(data, actions=[{'header': 4}]), dict(data, actions=['menu'] * 13),
                   dict(data, actions=['inferred-success']), dict(data, expected={})]
        altered = deepcopy(data)
        altered['initial_base']['doctors'] = True
        invalid.append(altered)
        for item in invalid:
            with self.subTest(item=item), self.assertRaises(ProtocolError):
                contract.validate_input(item)

    def test_original_evidence_is_complete_and_bound_to_every_input(self):
        suite = inputs.suite()
        record = compare.read_json(DIRECTORY / 'observations/smacx-gog-2.0-terraform-menu-work.json')
        outputs = compare.validate_observations(record, suite)
        self.assertGreaterEqual(record['repeat'], 2)
        for case in suite['cases']:
            contract.validate_output(outputs[case['id']], case['input']['actions'])
        changed = deepcopy(suite)
        changed['cases'][0]['input']['actions'][-1] = 'escape'
        with self.assertRaises(ProtocolError):
            compare.validate_observations(record, changed)

    def test_dispatch_needs_no_original_assets_for_candidate_and_rejects_browser_claim(self):
        args = SimpleNamespace(browser=False, record=False)
        command = run.terraform_menu_command(args)
        self.assertIn('terraform_menu_headless.py', command)
        self.assertNotIn('--assets', command)
        args.browser = True
        with self.assertRaises(ProtocolError):
            run.terraform_menu_command(args)


if __name__ == '__main__':
    unittest.main()
