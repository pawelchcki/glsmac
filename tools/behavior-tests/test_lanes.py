"""Explicit lane inventory, strict dispatch, and no-execution boundaries."""
from copy import deepcopy
from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import audit
from economy import run as economy_run
import fast
import lanes
from protocol import ProtocolError
from ui import run as ui_run


class LaneTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = lanes.load_manifest()
        cls.known = lanes.inventory(cls.manifest)

    def test_every_current_id_has_exactly_one_explicit_lane(self):
        for kind, rows in self.known.items():
            with self.subTest(kind=kind):
                hot = lanes.select(kind, rows, 'hot', self.manifest)
                stable = lanes.select(kind, rows, 'stable', self.manifest)
                self.assertFalse({row['id'] for row in hot} & {row['id'] for row in stable})
                self.assertEqual({row['id'] for row in rows}, {row['id'] for row in hot + stable})
                self.assertEqual(lanes.select(kind, rows, manifest=self.manifest), rows)

    def test_hot_scope_is_bounded_and_pending_is_separate(self):
        self.assertEqual(set(self.manifest['kinds']['regression']['hot']), {
            'unit-disband-shortcut-controls', 'unit-recycling-native', 'unit-recycling-controls',
            'unit-disband-native', 'unit-disband-authority', 'unit-disband-controls',
            'unit-menu-orders', 'unit-menu-rows', 'unit-menu-order-lifecycle',
            'unit-menu-context-orders', 'ingame-menu', 'ui-interactions', 'game-modal-input',
            'world-single-player-setup', 'natural-first-city-lifecycle',
            'opening-native', 'opening-dialog', 'automatic-end-turn', 'pod-landing-controls',
            'base-growth-worker-links', 'base-growth-regression', 'land-resource-sources'})
        self.assertEqual(set(self.manifest['kinds']['ui']['hot']), {
            'ingame-menus', 'unit-menu-orders', 'unit-menu-context', 'unit-disband',
            'unit-disband-name', 'unit-recycling', 'unit-recycling-former-city',
            'unit-recycling-scout-free', 'unit-disband-shortcut'})
        for kind, count in [('ui', 39), ('pending-ui', 22), ('gaps', 0)]:
            rows = lanes.select(kind, self.known[kind], 'hot', self.manifest)
            self.assertEqual(lanes.describe(kind, rows)['cases'], count)
        self.assertNotIn('pending-ui', lanes.RELEASE_KINDS)
        self.assertNotIn('gaps', lanes.RELEASE_KINDS)
        self.assertNotIn('archived', lanes.KINDS)

    def test_completed_colony_and_former_controls_stay_in_the_stable_complement(self):
        completed = {
            'regression': {'colony-join', 'colony-menu-controls', 'colony-found-menu-controls',
                           'colony-found-menu-authority', 'colony-found-native', 'colony-near-controls',
                           'colony-near-native', 'former-controls', 'terraform-menu-controls',
                           'terraform-menu-presentation'},
            'ui': {'terraform-menu-work', 'colony-menu-join', 'terraform-menu-presentation',
                   'colony-found-menu', 'colony-adjacent-warning'},
        }
        for kind, identifiers in completed.items():
            with self.subTest(kind=kind):
                self.assertTrue(identifiers <= set(self.manifest['kinds'][kind]['stable']))
                self.assertFalse(identifiers & set(self.manifest['kinds'][kind]['hot']))
        self.assertEqual((len(self.manifest['kinds']['regression']['hot']),
                          len(self.manifest['kinds']['regression']['stable']),
                          len(self.known['regression'])), (22, 111, 133))
        for lane, expected in [('hot', (9, 39)), ('stable', (49, 711)), ('all', (58, 750))]:
            inventory = lanes.describe('ui', lanes.select('ui', self.known['ui'], lane, self.manifest))
            self.assertEqual((inventory['suites'], inventory['cases']), expected)
        pending = lanes.describe('pending-ui', self.known['pending-ui'])
        self.assertEqual((pending['suites'], pending['cases']), (5, 22))

    def test_manifest_rejects_duplicate_overlap_missing_unknown_and_new_ids(self):
        changes = []
        changed = deepcopy(self.manifest)
        changed['kinds']['regression']['hot'].append('unit-menu-orders')
        changes.append((changed, self.known))
        changed = deepcopy(self.manifest)
        changed['kinds']['regression']['stable'].append('unit-menu-orders')
        changes.append((changed, self.known))
        changed = deepcopy(self.manifest)
        changed['kinds']['regression']['hot'].pop()
        changes.append((changed, self.known))
        changed = deepcopy(self.manifest)
        changed['kinds']['ui']['hot'].append('unknown-new-suite')
        changes.append((changed, self.known))
        known = deepcopy(self.known)
        known['ui'].append({'id': 'new-catalog-id'})
        changes.append((self.manifest, known))
        changed = deepcopy(self.manifest)
        del changed['kinds']['helper']
        changes.append((changed, self.known))
        changed = deepcopy(self.manifest)
        changed['version'] = True
        changes.append((changed, self.known))
        for manifest, known in changes:
            with self.subTest(manifest=manifest['version']), self.assertRaises(ProtocolError):
                lanes.validate_manifest(manifest, known)

    def test_duplicate_json_fields_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'manifest.json'
            path.write_text('{"version":1,"version":1}')
            with self.assertRaises(ProtocolError):
                lanes.load_manifest(path)

    def test_gap_cannot_reuse_ready_case_file(self):
        data = deepcopy(self.manifest)
        data['gaps'] = [dict(id='synthetic-gap', cases='ui/' + self.known['ui'][0]['cases'], reason='test duplicate readiness')]
        with self.assertRaisesRegex(ProtocolError, 'multiple readiness'):
            lanes.inventory(data)

    def test_archived_evidence_directory_is_explicit_and_bounded(self):
        entry = {'catalog': 'test-catalog.json'}
        for directory in ('', 'ui'):
            with patch.object(lanes, 'read', return_value={'version': 1, 'references': [], 'directory': directory}):
                self.assertEqual(lanes.archived_directory(entry), lanes.DIRECTORY / directory)
        for directory in ('../ui', '/tmp', 'ui/..', 'economy', None, 1):
            with self.subTest(directory=directory), patch.object(lanes, 'read', return_value={
                    'version': 1, 'references': [], 'directory': directory}), self.assertRaises(ProtocolError):
                lanes.archived_directory(entry)

    def test_selection_rejects_unknown_ids_and_preserves_order(self):
        rows = list(reversed(self.known['ui']))
        selected = lanes.select('ui', rows, 'hot', self.manifest)
        self.assertEqual(selected, [row for row in rows if row['id'] in self.manifest['kinds']['ui']['hot']])
        with self.assertRaises(ProtocolError):
            lanes.select('ui', [{'id': 'unclassified'}], 'all', self.manifest)

    def test_list_is_metadata_only_including_pending_gaps_and_archive(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(lanes.subprocess, 'run') as execute, redirect_stdout(io.StringIO()) as output:
            path = Path(directory) / 'list.json'
            self.assertEqual(lanes.main(['--lane', 'hot', '--list', '--report', str(path)]), 0)
            report = lanes.read(path)
            execute.assert_not_called()
            self.assertFalse(report['candidate_executed'])
            self.assertEqual(report['lane'], 'hot')
            self.assertIn('base-open-recalc', output.getvalue())
            self.assertIn('unit-menu-context', output.getvalue())
            self.assertEqual([row['readiness'] for row in report['deferred']], ['pending-transfer', 'not-ready'])
            self.assertEqual(len(report['archived'][0]['ids']), 4)
            self.assertFalse(report['archived'][0]['candidate_executed'])
            self.assertEqual(len(report['archived'][1]['ids']), 3)
            self.assertFalse(report['archived'][1]['candidate_executed'])

    def test_release_dispatch_is_sequential_and_never_runs_pending_or_gaps(self):
        calls = []
        def execute(argv, **kwargs):
            calls.append(argv)
            self.assertEqual(argv[argv.index('--jobs') + 1], '2')
            self.assertNotIn('--pending', argv)
            path = Path(argv[argv.index('--report') + 1])
            path.write_text(json.dumps({'summary': {'candidate_executed': True}, 'results': [{'id': 'observed'}]}))
            return subprocess.CompletedProcess(argv, 0)
        with tempfile.TemporaryDirectory() as directory, patch.object(lanes.subprocess, 'run', side_effect=execute), redirect_stdout(io.StringIO()):
            path = Path(directory) / 'run.json'
            self.assertEqual(lanes.main(['--lane', 'hot', '--jobs', '2', '--report', str(path)]), 0)
            report = lanes.read(path)
        self.assertEqual([Path(argv[1]).name for argv in calls], ['fast.py', 'run.py'])
        self.assertEqual([group['kind'] for group in report['groups']], list(lanes.RELEASE_KINDS))
        self.assertTrue(report['candidate_executed'])
        self.assertFalse(report['failed'])

    def test_failed_child_and_missing_report_never_reuse_stale_success(self):
        for returncode in (0, 1, 2):
            with self.subTest(returncode=returncode), tempfile.TemporaryDirectory() as directory, redirect_stdout(io.StringIO()):
                path = Path(directory) / 'run.json'
                child = Path(directory) / 'run-regression.json'
                child.write_text('{"summary":{"passed":4},"results":[{}]}')
                with patch.object(lanes.subprocess, 'run', return_value=subprocess.CompletedProcess([], returncode)):
                    self.assertNotEqual(lanes.main(['--lane', 'hot', '--kind', 'regression', '--report', str(path)]), 0)
                report = lanes.read(path)
                self.assertFalse(child.exists())
                self.assertTrue(report['failed'])
                self.assertFalse(report['candidate_executed'])
                self.assertNotIn('summary', report['groups'][0])

    def test_pending_requires_explicit_selection_and_preserves_failure(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(lanes.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1)) as execute, redirect_stdout(io.StringIO()):
            path = Path(directory) / 'pending.json'
            self.assertEqual(lanes.main(['--lane', 'hot', '--pending', '--report', str(path)]), 1)
            self.assertIn('--pending', execute.call_args.args[0])
            report = lanes.read(path)
            self.assertEqual(report['groups'][0]['readiness'], 'pending-transfer')
            self.assertTrue(report['failed'])

    def test_gap_execution_and_more_than_two_workers_are_rejected(self):
        with patch.object(lanes.subprocess, 'run') as execute, redirect_stderr(io.StringIO()):
            self.assertEqual(lanes.main(['--kind', 'gaps']), 2)
            with self.assertRaises(SystemExit):
                lanes.main(['--jobs', '3'])
            execute.assert_not_called()

    def test_validation_never_claims_candidate_execution(self):
        def execute(argv, **kwargs):
            self.assertNotIn('--jobs', argv)
            path = Path(argv[argv.index('--report') + 1])
            path.write_text(json.dumps({'summary': {'candidate_executed': False}, 'results': [{}]}))
            return subprocess.CompletedProcess(argv, 0)
        with tempfile.TemporaryDirectory() as directory, patch.object(lanes.subprocess, 'run', side_effect=execute), patch.object(audit, 'check_reference', return_value={}) as archive, redirect_stdout(io.StringIO()):
            path = Path(directory) / 'validation.json'
            self.assertEqual(lanes.main(['--lane', 'hot', '--validate-only', '--report', str(path)]), 0)
            report = lanes.read(path)
            self.assertFalse(report['candidate_executed'])
            self.assertTrue(all(not group['candidate_executed'] for group in report['groups']))
            self.assertEqual(archive.call_count, 7)
            self.assertTrue(report['archived'][0]['observations_validated'])
            self.assertTrue(report['archived'][1]['observations_validated'])
            self.assertEqual([call.kwargs['directory'] for call in archive.call_args_list[-3:]], [lanes.DIRECTORY / 'ui'] * 3)

    def test_validation_rejects_a_child_execution_claim(self):
        def execute(argv, **kwargs):
            path = Path(argv[argv.index('--report') + 1])
            path.write_text(json.dumps({'summary': {'candidate_executed': True}, 'results': [{}]}))
            return subprocess.CompletedProcess(argv, 0)
        with tempfile.TemporaryDirectory() as directory, patch.object(lanes.subprocess, 'run', side_effect=execute), patch.object(audit, 'check_reference', return_value={}), redirect_stdout(io.StringIO()):
            path = Path(directory) / 'validation.json'
            self.assertNotEqual(lanes.main(['--lane', 'hot', '--kind', 'ui', '--validate-only', '--report', str(path)]), 0)
            report = lanes.read(path)
            self.assertTrue(report['failed'])
            self.assertFalse(report['candidate_executed'])

    def test_each_runner_lists_only_selected_ids_without_starting_candidate(self):
        for runner, kind, arguments in [(fast, 'regression', []), (ui_run, 'ui', []),
                                        (ui_run, 'pending-ui', ['--pending']), (economy_run, 'economy', []),
                                        (audit, 'helper', [])]:
            with self.subTest(kind=kind), redirect_stdout(io.StringIO()) as output, patch('subprocess.run', side_effect=AssertionError('no app')):
                self.assertEqual(runner.main(['--lane', 'hot', '--list', *arguments]), 0)
                listed = {line.split(':')[0] for line in output.getvalue().splitlines()}
                self.assertEqual(listed, set(self.manifest['kinds'][kind]['hot']))

    def test_empty_hot_helper_and_economy_do_not_claim_matches(self):
        for runner in (audit, economy_run):
            with self.subTest(runner=runner.__name__), tempfile.TemporaryDirectory() as directory, redirect_stdout(io.StringIO()), patch('subprocess.run', side_effect=AssertionError('no app')):
                path = Path(directory) / 'empty.json'
                self.assertEqual(runner.main(['--lane', 'hot', '--report', str(path)]), 0)
                report = lanes.read(path)
                self.assertEqual(report['lane'], 'hot')
                self.assertEqual(report['results'], [])
                self.assertFalse(report['summary']['candidate_executed'])
                self.assertNotIn('matched', report['summary'])

    def test_all_remains_legacy_default_for_runner_lists(self):
        for runner, kind in [(fast, 'regression'), (ui_run, 'ui'), (economy_run, 'economy'), (audit, 'helper')]:
            with self.subTest(kind=kind), redirect_stdout(io.StringIO()) as output:
                self.assertEqual(runner.main(['--list']), 0)
                self.assertEqual(len(output.getvalue().splitlines()), len(self.known[kind]))


if __name__ == '__main__':
    unittest.main()
