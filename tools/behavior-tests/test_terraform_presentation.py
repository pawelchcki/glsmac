"""Public navigation/source controls and immutable presentation evidence."""
from copy import deepcopy
import json
from pathlib import Path
import unittest
from types import SimpleNamespace

import compare
from protocol import ProtocolError
from ui import terraform_presentation_contract as contract
from ui import terraform_presentation_inputs as inputs
from ui import run

DIRECTORY = Path(__file__).resolve().parent / 'ui'


class TerraformPresentationTests(unittest.TestCase):
    def test_candidate_dispatch_requires_no_original_assets_or_browser(self):
        args = SimpleNamespace(browser=False, record=False)
        command = run.terraform_presentation_command(args)
        self.assertIn('terraform_presentation_headless.py', command)
        self.assertNotIn('--assets', command)
        args.browser = True
        with self.assertRaises(ProtocolError):
            run.terraform_presentation_command(args)

    def test_public_suite_contains_only_inputs(self):
        suite = json.loads((DIRECTORY / 'cases/terraform-menu-presentation.json').read_text())
        self.assertEqual(suite, inputs.suite())
        self.assertEqual(len(suite['cases']), 3)
        for case in suite['cases']:
            self.assertEqual(set(case), {'id', 'algorithm', 'input'})
            contract.validate_input(case['input'])

    def test_rate_controls_change_only_the_declared_work_rate_column(self):
        stock = inputs.declarations('synthetic')
        edited = inputs.declarations('rates-edited')
        self.assertEqual(stock['menu.txt'], edited['menu.txt'])
        left, right = [source['alphax.txt'].splitlines() for source in (stock, edited)]
        self.assertEqual(len(left), len(right))
        self.assertEqual(left[0], right[0])
        self.assertEqual(left[-1], right[-1])
        rates = []
        for index, (before, after) in enumerate(zip(left[1:-1], right[1:-1], strict=True)):
            a, b = before.split(','), after.split(',')
            self.assertEqual(a[:4] + a[5:], b[:4] + b[5:])
            self.assertEqual(int(b[4]), 1 + index % 4)
            rates.append(int(b[4]))
        self.assertEqual(set(rates), set(range(1, 5)))

    def test_malformed_inputs_reject_before_application_execution(self):
        data = inputs.suite()['cases'][0]['input']
        for value in (dict(data, profile='stacked'), dict(data, text_profile='unknown'),
                      dict(data, actions=data['actions'][:-1]), dict(data, expected={}),
                      dict(data, actions=['menu', {'header': True}])):
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                contract.validate_input(value)
        altered = deepcopy(data)
        altered['initial_base']['doctors'] = True
        with self.assertRaises(ProtocolError):
            contract.validate_input(altered)

    def test_original_evidence_is_repeated_complete_and_bound_to_inputs(self):
        suite = inputs.suite()
        record = compare.read_json(DIRECTORY / 'observations/smacx-gog-2.0-terraform-menu-presentation.json')
        outputs = compare.validate_observations(record, suite)
        self.assertGreaterEqual(record['repeat'], 2)
        for case in suite['cases']:
            contract.validate_output(outputs[case['id']], case['input']['actions'])
        altered = deepcopy(suite)
        altered['cases'][0]['input']['text_profile'] = 'rates-edited'
        with self.assertRaises(ProtocolError):
            compare.validate_observations(record, altered)

    def test_output_rejects_partial_trace_invalid_rows_and_native_year_changes(self):
        suite = inputs.suite()
        record = compare.read_json(DIRECTORY / 'observations/smacx-gog-2.0-terraform-menu-presentation.json')
        output = compare.validate_observations(record, suite)[suite['cases'][0]['id']]
        changed = []
        partial = deepcopy(output); partial['trace'].pop(); changed.append(partial)
        year = deepcopy(output); year['trace'][0]['year_delta'] = True; changed.append(year)
        other = deepcopy(output); other['trace'][0]['selected'] = 'guessed'; changed.append(other)
        menu_index = next(index for index, state in enumerate(output['trace']) if state['menu'] and state['menu']['child'])
        tone = deepcopy(output)
        row = next(row for row in tone['trace'][menu_index]['menu']['child']['rows'] if 'label' in row)
        row['tone'] = 'guessed'; changed.append(tone)
        duplicate = deepcopy(output)
        for header in duplicate['trace'][menu_index]['menu']['headers']:
            header['active'] = True
        changed.append(duplicate)
        for value in changed:
            with self.assertRaises(ProtocolError):
                contract.validate_output(value, suite['cases'][0]['input']['actions'])


if __name__ == '__main__':
    unittest.main()
