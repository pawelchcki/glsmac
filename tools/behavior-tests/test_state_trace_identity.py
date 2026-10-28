"""Strict native identity projection, producer parsing and execution accounting."""
from contextlib import redirect_stdout
from copy import deepcopy
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import compare
from fast import create_snapshot
from protocol import ProtocolError, canonical, probe_request
from state_trace import all_player_identity as identity


def original_output():
    return compare.read_json(identity.EVIDENCE / 'observations-v1.json')['observations'][0]['output']


def candidate_log():
    lines = ['BEHAVIOR_SUMMARY 1 9', 'All tests passed.', 'ALLIDENTITY_BEGIN']
    for owner in range(1, 8):
        lines.append(f'ALLIDENTITY_PLAYER|{owner}|SOURCE{owner}|' + ('true' if owner == 1 else 'false'))
        for field in range(6):
            lines.append(f'ALLIDENTITY_FIELD|{field}|value {owner}-{field}')
        lines.append('ALLIDENTITY_ENDPLAYER')
    return '\n'.join(lines + ['ALLIDENTITY_COMPLETE']) + '\n'


class ProjectionTests(unittest.TestCase):
    def test_original_binding_and_all_native_fields_preserved_without_full_package_claim(self):
        suite, record = identity.reference_projection()
        outputs = compare.validate_observations(record, suite)
        self.assertEqual(len(outputs), 2)
        for output in outputs.values():
            self.assertEqual([row['owner'] for row in output['players']], list(range(1, 8)))
            self.assertTrue(all(set(row['identity']) == set(identity.FIELDS) for row in output['players']))
            self.assertEqual([row['owner'] for row in output['players'] if row['is_human']], [1])
        self.assertEqual(record['reference']['source_manifest_sha256'], identity.MANIFEST_SHA256)
        self.assertEqual({row['algorithm'] for row in suite['cases']}, {identity.ALGORITHM})
        self.assertEqual(record['repeat'], 2)

    def test_source_projection_is_detached_and_has_no_candidate_argument(self):
        original = original_output(); before = deepcopy(original)
        native = identity.project_output(original)
        native['players'][1]['identity']['noun'] = 'Edited detached output'
        self.assertEqual(original, before)

    def test_reference_missing_duplicate_owner_missing_field_or_unknown_native_field_rejected(self):
        for mutation in ('missing-owner', 'duplicate-owner', 'missing-text', 'extra-native-field', 'wrong-owner-type', 'unsupported-field'):
            original = original_output(); rows = original['after_launch']['players']
            if mutation == 'missing-owner': rows.pop()
            elif mutation == 'duplicate-owner': rows[-1]['owner'] = 1
            elif mutation == 'missing-text': del rows[1]['identity']['noun']
            elif mutation == 'extra-native-field': rows[1]['hidden_name'] = 'unclassified'
            elif mutation == 'wrong-owner-type': rows[0]['owner'] = True
            elif mutation == 'unsupported-field': rows[1]['gender'] = 'unverified'
            with self.subTest(mutation=mutation), self.assertRaises(ProtocolError):
                identity.project_output(original)

    def test_false_native_coverage_never_projected_as_pass(self):
        for channel in ('all_seven_faction_files', 'all_seven_human_flags', 'all_seven_six_identity_strings'):
            original = original_output(); original['coverage'][channel] = False
            with self.subTest(channel=channel), self.assertRaises(ProtocolError): identity.project_output(original)
        original = original_output(); original['coverage']['all_seven_gender'] = True
        with self.assertRaises(ProtocolError): identity.project_output(original)

    def test_frozen_manifest_and_every_original_artifact_checked(self):
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory) / 'evidence'; shutil.copytree(identity.EVIDENCE, copied)
            (copied / 'observations-v1.json').write_text('{}')
            with patch.object(identity, 'EVIDENCE', copied), self.assertRaisesRegex(ProtocolError, 'artifact changed'):
                identity.reference_projection()

    def test_changed_source_labels_names_or_human_flags_are_strict_mismatches(self):
        suite, record = identity.reference_projection()
        original = {row['id']: row['output'] for row in record['observations']}
        for field in ('faction_file', 'is_human', *identity.FIELDS):
            output = deepcopy(next(iter(original.values())))
            target = output['players'][6]
            if field == 'faction_file': target[field] = 'SOURCE_CHANGED'
            elif field == 'is_human': target[field] = True
            else: target['identity'][field] = 'Source input marker'
            identity.validate_native(output)
            actual = {'version': 1, 'implementation': {'name': 'synthetic', 'kind': 'candidate'}, 'results': [
                dict(id=case['id'], status='ok', output=output if index == 0 else original[case['id']])
                for index, case in enumerate(suite['cases'])]}
            with self.subTest(field=field):
                report = compare.compare(suite, record, actual)
                self.assertEqual(report['summary']['mismatched'], 1)
                self.assertTrue(any(field in row['path'] for row in report['results'][0]['differences']))

    def test_fixture_controls_are_exact_typed_and_unknown_inputs_rejected(self):
        suite, _ = identity.reference_projection()
        original = suite['cases'][0]['input']
        for key, changed in [('leader_name', 'Another input'), ('selected_row', False),
                             ('reference_rng_seed', True), ('roster_edits', [{'slot': 2, 'option': 0}]),
                             ('map', 'different-grid')]:
            value = deepcopy(original); value[key] = changed
            with self.subTest(key=key), self.assertRaises(ProtocolError): identity.validate_input(value)


class ProducerTests(unittest.TestCase):
    def test_literal_strings_and_all_owners_are_retained(self):
        text = candidate_log().replace('value 2-0', ' raw | native | name ')
        actual = identity.parse_candidate(text)
        self.assertEqual(len(actual['players']), 7)
        self.assertEqual(actual['players'][1]['identity']['leader_name'], ' raw | native | name ')

    def test_omissions_reorders_duplicates_and_late_markers_fail_closed(self):
        original = candidate_log()
        broken = [original.replace('ALLIDENTITY_FIELD|4|value 2-4\n', ''),
                  original.replace('ALLIDENTITY_PLAYER|7|', 'ALLIDENTITY_PLAYER|6|'),
                  original.replace('ALLIDENTITY_PLAYER|7|', 'ALLIDENTITY_PLAYER|true|'),
                  original.replace('ALLIDENTITY_FIELD|3|value 2-3', 'ALLIDENTITY_FIELD|2|value 2-3'),
                  original.replace('ALLIDENTITY_COMPLETE', ''),
                  original + 'ALLIDENTITY_BEGIN\n',
                  original + 'BEHAVIOR_SUMMARY 1 9\n',
                  original.replace('All tests passed.', 'TEST FAILED')]
        for index, text in enumerate(broken):
            with self.subTest(index=index), self.assertRaises(ProtocolError): identity.parse_candidate(text)


class ExecutionTests(unittest.TestCase):
    def test_started_timeout_and_launch_failure_record_different_execution_facts(self):
        suite, _ = identity.reference_projection(); case = suite['cases'][0]
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory) / 'GLSMAC.js'; runtime.write_text('synthetic-loader')
            runtime.with_suffix('.wasm').write_bytes(b'synthetic-runtime')
            process = MagicMock(); process.__enter__.return_value = process
            process.communicate.side_effect = [subprocess.TimeoutExpired('node', 180), ('partial', '')]
            executions = []
            with (
                patch.object(identity, 'create_snapshot', return_value=identity.create_snapshot(identity.ROOT)),
                patch.object(identity.subprocess, 'Popen', return_value=process),
                self.assertRaises(subprocess.TimeoutExpired),
            ):
                identity.replay(case, runtime, execution_log=executions)
            self.assertTrue(executions[0]['candidate_executed'])
            self.assertEqual(executions[0]['status'], 'timeout')
            process.kill.assert_called_once()
            self.assertEqual(process.communicate.call_count, 2)
            executions = []
            with (
                patch.object(identity, 'create_snapshot', return_value=identity.create_snapshot(identity.ROOT)),
                patch.object(identity.subprocess, 'Popen', side_effect=FileNotFoundError('missing node')),
                self.assertRaises(FileNotFoundError),
            ):
                identity.replay(case, runtime, execution_log=executions)
            self.assertFalse(executions[0]['candidate_executed'])

    def test_invalid_reference_replaces_stale_success_without_execution(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / 'report.json'; report.write_text('{"summary":{"matched":2}}')
            with patch.object(identity, 'reference_projection', side_effect=ProtocolError('bad manifest')), redirect_stdout(io.StringIO()):
                self.assertEqual(identity.main(['compare', '--report', str(report)]), 2)
            actual = json.loads(report.read_text())
            self.assertFalse(actual['candidate_executed'])
            self.assertEqual(actual['full_package_passing_cases'], 0)
            self.assertEqual(actual['full_package_status'], 'unsupported')

    def test_absent_runtime_returns_errors_and_does_not_leave_stale_success(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / 'report.json'; report.write_text('{"summary":{"matched":2}}')
            with redirect_stdout(io.StringIO()):
                self.assertEqual(identity.main(['compare', '--runtime', str(Path(directory) / 'absent.js'), '--report', str(report)]), 2)
            actual = json.loads(report.read_text())
            self.assertTrue(actual['candidate_executed'])  # The public candidate process did start.
            self.assertEqual(actual['summary']['errors'], 2)
            self.assertTrue(all(not row['candidate_executed'] for row in actual['candidate']['executions']))
            self.assertEqual(actual['full_package_passing_cases'], 0)

    def test_report_cannot_modify_frozen_evidence(self):
        target = identity.EVIDENCE / 'observations-v1.json'; before = target.read_bytes()
        with redirect_stdout(io.StringIO()):
            self.assertEqual(identity.main(['compare', '--report', str(target)]), 2)
        self.assertEqual(target.read_bytes(), before)


RUNTIME = Path(os.environ.get('STATE_TRACE_RUNTIME', identity.ROOT / 'build/wasm/bin/GLSMAC.js'))


@unittest.skipUnless(RUNTIME.exists() and RUNTIME.with_suffix('.wasm').exists(), 'Optional actual candidate source-mutation test requires a WASM runtime')
class NativeSourceSensitivityTests(unittest.TestCase):
    def test_native_identity_comes_from_independent_input_headers_not_gold(self):
        suite, _ = identity.reference_projection(); case = suite['cases'][0]
        snapshot = create_snapshot(identity.ROOT)
        key = 'GLSMAC_data/tests/_faction_text_fixture.gls.js'
        original = snapshot[key]
        snapshot[key] = original.replace("adjective:'Gaian'", "adjective:'Input Source Marker'")
        self.assertNotEqual(snapshot[key], original)
        with patch.object(identity, 'create_snapshot', return_value=snapshot):
            metadata, actual = identity.replay(case, RUNTIME)
        self.assertEqual([row['identity']['adjective'] for row in actual['players'][:2]],
                         ['Input Source Marker', 'Input Source Marker'])
        self.assertEqual(metadata['source_fixture_sha256']['_faction_text_fixture.gls.js'],
                         hashlib.sha256(snapshot[key].encode()).hexdigest())
        self.assertNotEqual(metadata['source_fixture_sha256']['_faction_text_fixture.gls.js'],
                            hashlib.sha256(original.encode()).hexdigest())


if __name__ == '__main__': unittest.main()
