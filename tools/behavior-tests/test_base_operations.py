"""Strict clean report projection and source/observer boundaries, without assets."""
from contextlib import redirect_stdout
from copy import deepcopy
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from protocol import ProtocolError
from state_trace import base_operations as report


def wire():
    _, reference = report.reference_projection()
    observed = reference['observations'][0]['output']['observed']
    lines = ['BEHAVIOR_SUMMARY 1 9', 'All tests passed.']
    for key in report.NATIVE_IDS:
        lines.append('BASEOPS_NATIVE|' + key + '|1|7|7|7')
    for point in observed['checkpoints']:
        lines.append('BASEOPS_CHECK|' + point['id'] + '|' + point['screen'])
        if 'title' in point: lines.append('BASEOPS_TITLE|' + point['title'])
        if 'project' in point: lines.append('BASEOPS_PROJECT|' + point['project'])
        if point['screen'] == 'city-panel':
            lines += ["BASEOPS_TITLE|Gaia's Landing", 'BASEOPS_PROJECT|Formers']
        if 'tabs' in point:
            lines.append('BASEOPS_TABS|' + '|'.join(point['tabs']))
            lines.append('BASEOPS_SELECTEDTAB|' + point['selected_tab'])
            lines.append('BASEOPS_BUTTONS|' + '|'.join(observed['visible_buttons']))
        if 'row' in point:
            row = point['row']
            lines.append('BASEOPS_ROW|' + row['city'] + '|' + row['project'] + '|' + str(row['selected']).lower())
        lines.append('BASEOPS_ENDCHECK')
    return '\n'.join(lines + ['BASEOPS_COMPLETE']) + '\n'


class OriginalEvidenceTests(unittest.TestCase):
    def test_immutable_original_and_semantic_bindings_are_exact(self):
        suite, reference = report.reference_projection()
        self.assertEqual(suite['cases'][0]['algorithm'], report.ALGORITHM)
        self.assertEqual(suite['cases'][0]['input'], report.INPUT)
        self.assertEqual(reference['repeat'], 2)
        self.assertEqual(reference['reference']['source_record_sha256'], report.EXPECTED_FILES['unit-motion-base-report-observations.json'])
        observed = reference['observations'][0]['output']['observed']
        self.assertEqual(len(observed['checkpoints']), 5)
        self.assertEqual(len(observed['native_checkpoint_ids']), 8)

    def test_missing_duplicate_or_malformed_native_owner_rejected(self):
        raw = json.loads((report.EVIDENCE / 'unit-motion-base-report-observations.json').read_text())['observations'][0]['output']['base_report']['controls'][0]['native']['all_players']
        for change in ('missing', 'duplicate', 'bool', 'unknown-owner', 'duplicate-unit'):
            value = deepcopy(raw)
            if change == 'missing': value['players'].pop()
            elif change == 'duplicate': value['players'][-1]['id'] = 1
            elif change == 'bool': value['players'][0]['id'] = True
            elif change == 'unknown-owner': value['units'][0]['owner'] = 8
            else: value['units'][-1]['runtime_id'] = value['units'][0]['runtime_id']
            with self.subTest(change=change), self.assertRaises(ProtocolError): report.validate_native(value)

    def test_missing_or_malformed_semantics_cannot_become_empty_pass(self):
        _, reference = report.reference_projection()
        original = reference['observations'][0]['output']['observed']
        for change in ('missing', 'duplicate', 'missing-city', 'wrong-boolean', 'missing-native'):
            value = deepcopy(original)
            if change == 'missing': value['checkpoints'].pop()
            elif change == 'duplicate': value['checkpoints'][1]['id'] = value['checkpoints'][0]['id']
            elif change == 'missing-city': del value['checkpoints'][0]['row']['city']
            elif change == 'wrong-boolean': value['all_seven_native_arrays_unchanged'] = 1
            else: value['native_checkpoint_ids'].pop()
            with self.subTest(change=change), self.assertRaises(ProtocolError): report.validate_observed(value)


class CandidateWireTests(unittest.TestCase):
    def test_actual_ui_fields_retained_and_native_samples_separate(self):
        output, native, raw_city = report.parse_candidate(wire())
        _, reference = report.reference_projection()
        self.assertEqual(output, reference['observations'][0]['output'])
        self.assertEqual(len(native), 8)
        self.assertEqual(native[0]['players'], 7)
        self.assertEqual(raw_city, {'title': "Gaia's Landing", 'project': 'Formers'})
        self.assertEqual(reference['reference']['unsupported_city_panel_typography'], {'title': "GAIA'S LANDING", 'project': 'FORMERS'})
        self.assertEqual(output['observed']['checkpoints'][2], {'id': 'double-click-row', 'screen': 'city-panel'})

    def test_truncated_duplicate_unknown_and_late_markers_rejected(self):
        original = wire()
        cases = [original.replace('BASEOPS_COMPLETE', ''), original + 'BASEOPS_COMPLETE\n',
            original.replace('BASEOPS_NATIVE|base-flow-menu|1|7|7|7\n', ''),
            original.replace('BASEOPS_NATIVE|base-flow-hq|1|7|7|7', 'BASEOPS_NATIVE|base-flow-menu|1|7|7|7'),
            original.replace('BASEOPS_ROW|', 'BASEOPS_UNKNOWN|', 1),
            original.replace('BASEOPS_NATIVE|base-flow-hq|1|7|7|7', 'BASEOPS_NATIVE|base-flow-hq|1|6|7|7'),
            original.replace('All tests passed.', 'TEST FAILED'), original + 'BEHAVIOR_SUMMARY 1 9\n']
        for index, value in enumerate(cases):
            with self.subTest(index=index), self.assertRaises(ProtocolError): report.parse_candidate(value)

    def test_native_turn_or_inventory_changes_cannot_be_hidden(self):
        for changed in ('2|7|7|7', '1|7|8|7', '1|7|7|8'):
            value = wire().replace('BASEOPS_NATIVE|base-flow-selected-row|1|7|7|7', 'BASEOPS_NATIVE|base-flow-selected-row|' + changed)
            with self.subTest(changed=changed), self.assertRaises(ProtocolError): report.parse_candidate(value)


class FailureAccountingTests(unittest.TestCase):
    def test_timeout_is_started_and_killed_while_spawn_failure_stays_false(self):
        with tempfile.TemporaryDirectory() as temporary:
            runtime = Path(temporary) / 'GLSMAC.js'
            runtime.write_text('synthetic-loader'); runtime.with_suffix('.wasm').write_bytes(b'synthetic-runtime')
            process = MagicMock(); process.__enter__.return_value = process
            process.communicate.side_effect = [subprocess.TimeoutExpired('node', 180), ('partial', '')]
            executions = []
            with patch.object(report.subprocess, 'Popen', return_value=process), self.assertRaises(subprocess.TimeoutExpired): report.replay(runtime, executions)
            self.assertTrue(executions[0]['candidate_executed'])
            self.assertEqual(executions[0]['status'], 'timeout')
            process.kill.assert_called_once(); self.assertEqual(process.communicate.call_count, 2)
            executions = []
            with patch.object(report.subprocess, 'Popen', side_effect=FileNotFoundError('missing node')), self.assertRaises(FileNotFoundError): report.replay(runtime, executions)
            self.assertFalse(executions[0]['candidate_executed'])

    def test_invalid_reference_replaces_stale_success_without_execution(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / 'report.json'; target.write_text('{"summary":{"matched":1}}')
            with patch.object(report, 'reference_projection', side_effect=ProtocolError('bad binding')), redirect_stdout(io.StringIO()):
                self.assertEqual(report.main(['compare', '--report', str(target)]), 2)
            value = json.loads(target.read_text())
            self.assertFalse(value['candidate_executed'])
            self.assertEqual(value['full_trace_status'], 'unsupported')
            self.assertEqual(value['full_trace_passing_cases'], 0)

    def test_adapter_start_without_native_receipt_is_explicitly_unknown(self):
        def timeout(command, request, **kwargs):
            kwargs['on_started']()
            raise subprocess.TimeoutExpired(command, 200)
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / 'report.json'
            with patch.object(report.behavior, 'run_probe', side_effect=timeout), redirect_stdout(io.StringIO()):
                self.assertEqual(report.main(['compare', '--report', str(target)]), 2)
            value = json.loads(target.read_text())
            self.assertTrue(value['adapter_executed'])
            self.assertIsNone(value['candidate_executed'])
            self.assertFalse(value['native_execution_known'])

    def test_report_cannot_overwrite_original_package(self):
        target = report.EVIDENCE / 'unit-motion-base-report-observations.json'; before = target.read_bytes()
        with redirect_stdout(io.StringIO()): self.assertEqual(report.main(['compare', '--report', str(target)]), 2)
        self.assertEqual(target.read_bytes(), before)


if __name__ == '__main__': unittest.main()
