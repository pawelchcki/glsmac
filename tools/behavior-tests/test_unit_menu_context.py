"""Full public context evidence and immutable archived pilots; no app workers."""
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
    message = False
    checkpoints = 6
    case_digest = '76231d1db28cdde78ca4e7421c288625d33b9ec8b1b606799a877ece5fa19bf3'
    observation_digest = 'df8a04a7e1fb0f4ddb9e8a19aa2eb5c8ac188180a13de469661bf050237f11c0'
    observer_digest = 'de49b9d1f431bfdf294277e52fa4130b01cee82d90ed31451d3e3c7da80da754'

    def setUp(self):
        self.reference = next(row for row in audit.load_references(DIRECTORY.parent / 'unit-menu-context-pilots-catalog.json')
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

    def test_archived_pilot_cannot_replace_complete_full_gold(self):
        full = compare.read_json(DIRECTORY / 'cases/unit-menu-context.json')
        self.assertEqual(full, inputs.suite())
        self.assertEqual(len(full['cases']), 12)
        self.assertIn(self.suite['cases'][0], full['cases'])
        with self.assertRaisesRegex(ProtocolError, 'different inputs'):
            compare.validate_observations(self.evidence, full)
        manifest = lanes.load_manifest()
        self.assertNotIn(self.identifier, manifest['kinds']['ui']['hot'])
        self.assertEqual(manifest['gaps'], [])

    def test_changed_inputs_and_incomplete_checkpoints_are_rejected(self):
        changed = deepcopy(self.suite)
        changed['cases'][0]['input']['text_profile'] = 'action-edited'
        with self.assertRaises(ProtocolError):
            compare.validate_observations(self.evidence, changed)
        output = deepcopy(self.evidence['observations'][0]['output'])
        output['trace'].pop()
        with self.assertRaises(ProtocolError):
            contract.validate_output(output, self.suite['cases'][0]['input']['actions'])

    def test_schema_does_not_supply_the_observed_order_effect(self):
        expected = self.evidence['observations'][0]['output']
        alternate = deepcopy(expected)
        for state in alternate['trace']:
            for unit in state['units']:
                unit['order_code'] = 0
        contract.validate_output(alternate, self.suite['cases'][0]['input']['actions'])
        self.assertTrue(compare.differences(expected, alternate))

    def test_commands_name_separate_original_and_current_candidate_adapters(self):
        args = SimpleNamespace(browser=False, record=False, assets=Path('/tmp'), wine='wine')
        self.assertEqual(Path(shlex.split(ui_run.unit_menu_context_command(args, paced=self.paced, message=self.message))[1]).name,
                         'unit_menu_context_headless.py')
        args.record = True
        recorded = shlex.split(ui_run.unit_menu_context_command(args, paced=self.paced, message=self.message))
        self.assertEqual(Path(recorded[1]).name, self.original)
        self.assertIn('--artifacts', recorded)
        args.browser = True
        with self.assertRaises(ProtocolError):
            ui_run.unit_menu_context_command(args, paced=self.paced, message=self.message)

    def test_archived_pilot_validation_never_executes_or_claims_current_agreement(self):
        with patch('subprocess.run', side_effect=AssertionError('no app worker')):
            data = audit.check_reference(self.reference, directory=DIRECTORY)
            with self.assertRaisesRegex(ProtocolError, 'unknown UI suites'):
                ui_run.main(['--suite', self.identifier, '--validate-only'])
        self.assertEqual(data['cases'], 1)
        self.assertFalse(data['candidate_executed'])



class ColonyMenuContextTests(UnitMenuContextTests):
    identifier = 'unit-menu-context-colony-sentry'
    case_id = 'unit-menu-colony-slot-26-synthetic'
    original = 'unit_menu_context_paced_original.py'
    paced = True
    checkpoints = 7
    case_digest = 'e6ca4079d4479588670a0b03b7da652ed3e17a25a58cb639261d05f7c6a098bb'
    observation_digest = '1a1a05db19cfc574dcb1ef571a4b5c71e5e480f8ffb096af98ff80595647503b'
    observer_digest = '931415ad2ddef76cb711a862041c7eb3675ffca636181470f5cc8fa599a24f26'


class FormerHoldMenuContextTests(UnitMenuContextTests):
    identifier = 'unit-menu-context-former-hold'
    case_id = 'unit-menu-former-slot-29-synthetic'
    original = 'unit_menu_context_message_original.py'
    message = True
    checkpoints = 6
    case_digest = '3fef87c39a27ca2b32a22d6b4b4ece6993a493377778ac26f7b9d010f8a89b48'
    observation_digest = '16927bfb6f3b867e4f1efed5cf3de6f2b5185d54d1153ac67a276da2ca3b5636'
    observer_digest = 'af534c25a295248907e482d9988832fb13343d14f0ab11476b21ad4ce4d8fbff'


class ContextInventoryTests(unittest.TestCase):
    def setUp(self):
        self.reference = next(row for row in audit.load_references(DIRECTORY / 'catalog.json')
                              if row['id'] == 'unit-menu-context')
        self.suite = compare.read_json(DIRECTORY / self.reference['cases'])
        self.evidence = compare.read_json(DIRECTORY / self.reference['observations'])

    def test_full_record_is_immutable_complete_and_exactly_generated_inputs(self):
        digests = {'cases': '5efa01b2e3387ad0e359de4d02c4c2b476e6857f3bcdb082863582ef863612b5',
                   'observations': '17694e476ec6c294294cb563fcbc63f7195f972dbb6b6fac4b0f54c6af05ac78'}
        for field, digest in digests.items():
            self.assertEqual(hashlib.sha256((DIRECTORY / self.reference[field]).read_bytes()).hexdigest(), digest)
        self.assertEqual(self.suite, inputs.suite())
        outputs = compare.validate_observations(self.evidence, self.suite)
        self.assertEqual(len(outputs), 12)
        self.assertEqual(self.evidence['repeat'], 2)
        self.assertEqual(sum(len(row['trace']) for row in outputs.values()), 78)
        self.assertEqual([p['cases'] for p in self.evidence['reference']['recording_partitions']], [6, 6])
        self.assertTrue(all(p['repeat'] == 2 for p in self.evidence['reference']['recording_partitions']))
        for case in self.suite['cases']:
            contract.validate_input(case['input'])
            contract.validate_output(outputs[case['id']], case['input']['actions'])

    def test_full_suite_supersedes_pilots_without_counting_inputs_twice(self):
        references = audit.load_references(DIRECTORY / 'catalog.json')
        self.assertEqual(len(references), 59)
        old = audit.load_references(DIRECTORY.parent / 'unit-menu-context-pilots-catalog.json')
        self.assertEqual(len(old), 3)
        self.assertFalse({r['id'] for r in old} & {r['id'] for r in references})
        outputs = compare.validate_observations(self.evidence, self.suite)
        for reference in old:
            suite = compare.read_json(DIRECTORY / reference['cases'])
            record = compare.read_json(DIRECTORY / reference['observations'])
            for case in suite['cases']:
                self.assertIn(case, self.suite['cases'])
                self.assertEqual(outputs[case['id']], compare.validate_observations(record, suite)[case['id']])
        manifest = lanes.load_manifest(); known = lanes.inventory(manifest)
        hot = lanes.describe('ui', lanes.select('ui', known['ui'], 'hot', manifest))
        self.assertEqual((hot['suites'], hot['cases']), (10, 43))
        self.assertEqual(lanes.describe('ui', known['ui'])['cases'], 754)
        self.assertEqual(manifest['gaps'], [])
        self.assertEqual(manifest['kinds']['pending-ui']['hot'], [
            'base-open-recalc', 'world-base-ownership', 'natural-first-city',
            'natural-first-city-factions-v6', 'natural-first-city-source-controls-v7'])

    def test_full_validation_is_metadata_only(self):
        with tempfile.TemporaryDirectory() as temporary, redirect_stdout(io.StringIO()), \
                patch('subprocess.run', side_effect=AssertionError('no app worker')):
            report = Path(temporary) / 'validation.json'
            self.assertEqual(ui_run.main(['--suite', 'unit-menu-context', '--lane', 'hot', '--validate-only',
                                          '--report', str(report)]), 0)
            data = json.loads(report.read_text())
        self.assertEqual(data['summary'], {'reference_cases': 12, 'candidate_executed': False})

    def test_full_candidate_routing_preserves_strict_failure(self):
        synthetic = {'id': 'unit-menu-context', 'cases': 12, 'comparison': {'summary': {
            'matched': 11, 'mismatched': 1, 'unsupported': 0, 'errors': 0}}}
        with tempfile.TemporaryDirectory() as temporary, redirect_stdout(io.StringIO()), \
                patch.object(audit, 'check_reference', return_value=synthetic) as check, \
                patch('subprocess.run', side_effect=AssertionError('no app worker')):
            report = Path(temporary) / 'routing.json'
            self.assertEqual(ui_run.main(['--suite', 'unit-menu-context', '--jobs', '1', '--report', str(report)]), 1)
        self.assertEqual(check.call_args.args[0]['id'], 'unit-menu-context')
        self.assertEqual(Path(shlex.split(check.call_args.args[1])[1]).name, 'unit_menu_context_headless.py')

    def test_full_record_routing_names_archived_saved_loader_without_reading_it(self):
        args = SimpleNamespace(browser=False, record=True, assets=Path('/tmp'), wine='wine')
        command = shlex.split(ui_run.unit_menu_context_command(args, saved=True))
        self.assertEqual(Path(command[1]).relative_to(DIRECTORY.resolve()).as_posix(),
                         'unit_menu_context_saved_original.py')
        self.assertIn('--child', command)
        with self.assertRaises(ProtocolError):
            ui_run.unit_menu_context_command(args, saved=True, message=True)


if __name__ == '__main__':
    unittest.main()
