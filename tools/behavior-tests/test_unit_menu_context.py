"""Bounded public pilot metadata and dispatch; no application workers."""
from contextlib import redirect_stdout
from copy import deepcopy
import hashlib
import io
import json
from pathlib import Path
import shlex
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import audit
import compare
import lanes
from protocol import ProtocolError
from ui import run as ui_run
from ui import unit_menu_context_contract as contract
from ui import unit_menu_context_inputs as inputs


DIRECTORY = Path(__file__).parent / 'ui'
class UnitMenuContextTests(unittest.TestCase):
    identifier = 'unit-menu-context-former-sentry'
    case_id = 'unit-menu-former-slot-26-synthetic'
    original = 'unit_menu_context_original.py'
    paced = False
    checkpoints = 6
    case_digest = '76231d1db28cdde78ca4e7421c288625d33b9ec8b1b606799a877ece5fa19bf3'
    observation_digest = 'df8a04a7e1fb0f4ddb9e8a19aa2eb5c8ac188180a13de469661bf050237f11c0'
    observer_digest = 'de49b9d1f431bfdf294277e52fa4130b01cee82d90ed31451d3e3c7da80da754'

    def setUp(self):
        self.reference = next(row for row in audit.load_references(DIRECTORY / 'catalog.json')
                              if row['id'] == self.identifier)
        self.suite = compare.read_json(DIRECTORY / self.reference['cases'])
        self.evidence = compare.read_json(DIRECTORY / self.reference['observations'])

    def test_accepted_pilot_bytes_inputs_and_complete_evidence_stay_immutable(self):
        for field, digest in [('cases', self.case_digest), ('observations', self.observation_digest)]:
            self.assertEqual(hashlib.sha256((DIRECTORY / self.reference[field]).read_bytes()).hexdigest(), digest)
        compare.validate_observations(self.evidence, self.suite)
        self.assertEqual(len(self.suite['cases']), 1)
        self.assertEqual(self.evidence['repeat'], 2)
        self.assertEqual(self.evidence['reference']['contract'], contract.ALGORITHM)
        self.assertEqual(self.evidence['reference']['adapter_sha256'],
                         self.observer_digest)
        case = self.suite['cases'][0]
        self.assertEqual(case['id'], self.case_id)
        contract.validate_input(case['input'])
        output = self.evidence['observations'][0]['output']
        contract.validate_output(output, case['input']['actions'])
        self.assertEqual(len(output['trace']), self.checkpoints)

    def test_full_twelve_input_gap_is_preserved_and_cannot_use_pilot_as_gold(self):
        full = compare.read_json(DIRECTORY / 'cases/unit-menu-context.json')
        self.assertEqual(full, inputs.suite())
        self.assertEqual(len(full['cases']), 12)
        self.assertIn(self.suite['cases'][0], full['cases'])
        with self.assertRaisesRegex(ProtocolError, 'different inputs'):
            compare.validate_observations(self.evidence, full)
        manifest = lanes.load_manifest()
        self.assertIn(self.identifier, manifest['kinds']['ui']['hot'])
        self.assertEqual(manifest['kinds']['gaps']['hot'], ['unit-menu-context'])
        self.assertEqual(lanes.describe('gaps', lanes.inventory(manifest)['gaps'])['cases'], 12)

    def test_changed_inputs_and_incomplete_checkpoints_are_rejected(self):
        changed = deepcopy(self.suite)
        changed['cases'][0]['input']['text_profile'] = 'action-edited'
        with self.assertRaises(ProtocolError):
            compare.validate_observations(self.evidence, changed)
        output = deepcopy(self.evidence['observations'][0]['output'])
        output['trace'].pop()
        with self.assertRaises(ProtocolError):
            contract.validate_output(output, self.suite['cases'][0]['input']['actions'])

    def test_schema_does_not_supply_the_observed_sentry_effect(self):
        expected = self.evidence['observations'][0]['output']
        alternate = deepcopy(expected)
        for state in alternate['trace']:
            for unit in state['units']:
                unit['order_code'] = 0
        contract.validate_output(alternate, self.suite['cases'][0]['input']['actions'])
        self.assertTrue(compare.differences(expected, alternate))

    def test_commands_name_separate_original_and_current_candidate_adapters(self):
        args = SimpleNamespace(browser=False, record=False, assets=Path('/tmp'), wine='wine')
        self.assertEqual(Path(shlex.split(ui_run.unit_menu_context_command(args, paced=self.paced))[1]).name,
                         'unit_menu_context_headless.py')
        args.record = True
        recorded = shlex.split(ui_run.unit_menu_context_command(args, paced=self.paced))
        self.assertEqual(Path(recorded[1]).name, self.original)
        self.assertIn('--artifacts', recorded)
        args.browser = True
        with self.assertRaises(ProtocolError):
            ui_run.unit_menu_context_command(args, paced=self.paced)

    def test_selected_pilot_validation_never_executes_or_claims_candidate_agreement(self):
        with tempfile.TemporaryDirectory() as temporary, redirect_stdout(io.StringIO()), \
                patch('subprocess.run', side_effect=AssertionError('no app worker')):
            report = Path(temporary) / 'validation.json'
            self.assertEqual(ui_run.main(['--suite', self.identifier, '--lane', 'hot', '--validate-only',
                                          '--report', str(report)]), 0)
            data = json.loads(report.read_text())
        self.assertEqual(data['summary'], {'reference_cases': 1, 'candidate_executed': False})

    def test_candidate_dispatch_uses_context_adapter_without_launching_it(self):
        # A synthetic harness result tests routing only, never gameplay agreement.
        synthetic = {'id': self.identifier, 'cases': 1, 'comparison': {'summary': {
            'matched': 0, 'mismatched': 1, 'unsupported': 0, 'errors': 0}}}
        with tempfile.TemporaryDirectory() as temporary, redirect_stdout(io.StringIO()), \
                patch.object(audit, 'check_reference', return_value=synthetic) as check, \
                patch('subprocess.run', side_effect=AssertionError('no app worker')):
            report = Path(temporary) / 'routing.json'
            self.assertEqual(ui_run.main(['--suite', self.identifier, '--jobs', '1', '--report', str(report)]), 1)
        self.assertEqual(check.call_args.args[0]['id'], self.identifier)
        self.assertEqual(Path(shlex.split(check.call_args.args[1])[1]).name,
                         'unit_menu_context_headless.py')


class ColonyMenuContextTests(UnitMenuContextTests):
    identifier = 'unit-menu-context-colony-sentry'
    case_id = 'unit-menu-colony-slot-26-synthetic'
    original = 'unit_menu_context_paced_original.py'
    paced = True
    checkpoints = 7
    case_digest = 'e6ca4079d4479588670a0b03b7da652ed3e17a25a58cb639261d05f7c6a098bb'
    observation_digest = '1a1a05db19cfc574dcb1ef571a4b5c71e5e480f8ffb096af98ff80595647503b'
    observer_digest = '931415ad2ddef76cb711a862041c7eb3675ffca636181470f5cc8fa599a24f26'


class ContextInventoryTests(unittest.TestCase):
    def test_two_pilots_prove_distinct_inputs_once_while_full_suite_stays_not_ready(self):
        references = audit.load_references(DIRECTORY / 'catalog.json')
        selected = [row for row in references if row['id'] in {
            UnitMenuContextTests.identifier, ColonyMenuContextTests.identifier}]
        cases = [case for row in selected for case in compare.read_json(DIRECTORY / row['cases'])['cases']]
        self.assertEqual(len(selected), 2)
        self.assertEqual(len(cases), len({case['id'] for case in cases}))
        self.assertEqual(len(cases), 2)
        manifest = lanes.load_manifest()
        known = lanes.inventory(manifest)
        self.assertEqual(lanes.describe('ui', lanes.select('ui', known['ui'], 'hot', manifest))['cases'], 20)
        self.assertEqual(lanes.describe('gaps', known['gaps'])['cases'], 12)


if __name__ == '__main__':
    unittest.main()
