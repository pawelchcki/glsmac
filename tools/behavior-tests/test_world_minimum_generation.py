"""Frozen minimum-axis replay integrity, execution failures and exact comparison."""
from copy import deepcopy
import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import MagicMock, patch

import compare
from protocol import ProtocolError
from state_trace import world_minimum as minimum


class MinimumGenerationTests(unittest.TestCase):
    def test_four_cases_keep_separate_original_capture_provenance(self):
        pairs = minimum.references()
        self.assertEqual([len(suite['cases']) for suite, _ in pairs], [1, 3])
        self.assertNotEqual(pairs[0][1]['reference']['adapter_sha256'], pairs[1][1]['reference']['adapter_sha256'])
        self.assertTrue(all(record['repeat'] == 2 for _, record in pairs))
        self.assertEqual({case['algorithm'] for suite, _ in pairs for case in suite['cases']}, {minimum.ALGORITHM})

    def test_changed_any_observed_dimension_is_strict_mismatch(self):
        suite, record = minimum.references()[0]
        output = deepcopy(record['observations'][0]['output'])
        for field in output:
            changed = dict(output); changed[field] += 1
            actual = dict(version=1, implementation=dict(name='test', kind='candidate'),
                          results=[dict(id=suite['cases'][0]['id'], status='ok', output=changed)])
            with self.subTest(field=field):
                self.assertEqual(compare.compare(suite, record, actual)['summary']['mismatched'], 1)

    def test_manifest_binds_unselected_roster_evidence_too(self):
        with tempfile.TemporaryDirectory() as temporary:
            evidence = Path(temporary) / 'evidence'; shutil.copytree(minimum.EVIDENCE, evidence)
            (evidence / 'observations/setup-roster-decisions-v3-named.json').write_text('{}')
            with patch.object(minimum, 'EVIDENCE', evidence), self.assertRaisesRegex(ProtocolError, 'artifact changed'):
                minimum.references()

    def test_spawn_failure_is_not_native_execution(self):
        cases = minimum.references()[0][0]['cases']
        with tempfile.TemporaryDirectory() as temporary:
            runtime = Path(temporary) / 'GLSMAC.js'; runtime.write_text('test'); runtime.with_suffix('.wasm').write_bytes(b'test')
            execution = dict(candidate_executed=False)
            with (
                patch.object(minimum, 'create_snapshot', return_value=minimum.create_snapshot(minimum.ROOT)),
                patch.object(minimum.subprocess, 'Popen', side_effect=OSError('spawn failed')),
            ):
                with self.assertRaises(OSError): minimum.replay(cases, runtime, execution)
            self.assertFalse(execution['candidate_executed'])

    def test_timeout_records_native_execution_and_kills_worker(self):
        cases = minimum.references()[0][0]['cases']
        with tempfile.TemporaryDirectory() as temporary:
            runtime = Path(temporary) / 'GLSMAC.js'; runtime.write_text('test'); runtime.with_suffix('.wasm').write_bytes(b'test')
            execution = dict(candidate_executed=False); worker = MagicMock()
            worker.communicate.side_effect = [subprocess.TimeoutExpired('node', 180), ('', '')]
            worker.__enter__.return_value = worker
            with (
                patch.object(minimum, 'create_snapshot', return_value=minimum.create_snapshot(minimum.ROOT)),
                patch.object(minimum.subprocess, 'Popen', return_value=worker),
                self.assertRaises(subprocess.TimeoutExpired),
            ):
                minimum.replay(cases, runtime, execution)
            self.assertTrue(execution['candidate_executed']); worker.kill.assert_called_once()
            self.assertEqual(worker.communicate.call_count, 2)

    def test_failed_run_replaces_stale_passing_report(self):
        with tempfile.TemporaryDirectory() as temporary:
            report = Path(temporary) / 'result.json'; report.write_text('{"summary":{"matched":4}}')
            with patch.object(minimum, 'replay', side_effect=ProtocolError('incomplete candidate')), redirect_stdout(io.StringIO()):
                self.assertEqual(minimum.main(['--report', str(report)]), 2)
            actual = json.loads(report.read_text())
            self.assertEqual(actual['error'], 'incomplete candidate')
            self.assertEqual(actual['complete_setup_package_passing_cases'], 0)
            self.assertNotIn('summary', actual)

    def test_report_cannot_overwrite_original_evidence(self):
        with redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
            minimum.main(['--report', str(minimum.EVIDENCE / 'manifest-v1.json')])


if __name__ == '__main__':
    unittest.main()
