"""Candidate parser/transport authority; no native or reference implementation."""
from contextlib import redirect_stdout
from copy import deepcopy
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from protocol import ProtocolError
from ui import colony_menu_headless as candidate
from ui.colony_menu_inputs import suite, declarations


class ColonyMenuCandidateTests(unittest.TestCase):
    def setUp(self):
        self.cases = suite()['cases'][:1]
        self.state = ('JOIN_STATE|{index}|0|scout\nJOIN_BASE|1|0|1|0|0|9\nJOIN_OWNED|1\n'
                      'JOIN_UNIT|scout|0|0\nJOIN_UNIT|former|0|0\nJOIN_UNIT|colony|0|0\n'
                      'JOIN_MENU|false|none\nJOIN_STATE_DONE\n')
        self.text = ('JOIN_CASE|' + self.cases[0]['id'] + '\n'
                     + ''.join(self.state.format(index=i) for i in range(7))
                     + 'JOIN_CASE_DONE\nAll tests passed.\n')

    def test_preserves_reported_native_effects_instead_of_deriving_menu_results(self):
        result, = candidate.parse_candidate(self.text, self.cases)
        self.assertEqual(result['output']['trace'][5]['base']['population'], 1)
        changed = self.text.replace('JOIN_BASE|1|0|1|0|0|9', 'JOIN_BASE|2|1|1|0|0|9').replace('JOIN_UNIT|colony|0|0\n', '')
        actual, = candidate.parse_candidate(changed, self.cases)
        self.assertEqual(actual['output']['trace'][0]['base']['workers'], 1)
        self.assertEqual(len(actual['output']['trace'][0]['units']), 2)

    def test_rejects_missing_duplicate_or_reordered_checkpoints_and_fields(self):
        for value in (self.text.replace('JOIN_STATE|0', 'JOIN_STATE|1'),
                      self.text.replace('JOIN_CASE_DONE\n', ''),
                      self.text.replace('JOIN_MENU|false|none\n', ''),
                      self.text.replace('JOIN_BASE|1|0|1|0|0|9\n', ''),
                      self.text.replace('JOIN_OWNED|1', 'JOIN_OWNED|1\nJOIN_OWNED|1'),
                      self.text.replace('JOIN_UNIT|scout|0|0', 'JOIN_UNIT|scout|0|0\nJOIN_UNIT|scout|0|0'),
                      self.text.replace('JOIN_MENU|false|none', 'JOIN_MENU|false|4'),
                      self.text.replace('JOIN_MENU|false|none', 'JOIN_MENU|true|5'),
                      self.text.replace('JOIN_STATE|0|0', 'JOIN_STATE|0|1'),
                      self.text.replace('JOIN_UNIT|former|0|0', 'JOIN_UNIT|former|0|4'),
                      self.text.replace('JOIN_CASE_DONE', 'JOIN_UNKNOWN')):
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                candidate.parse_candidate(value, self.cases)

    def test_requires_engine_success_and_whole_requested_trace(self):
        for value in (self.text.replace('All tests passed.', ''), self.text + 'TEST FAILED\n',
                      self.text.replace(self.state.format(index=6), '')):
            with self.assertRaises(ProtocolError): candidate.parse_candidate(value, self.cases)

    def test_reports_native_guard_error_without_constructing_state(self):
        text = 'JOIN_CASE|' + self.cases[0]['id'] + '\nJOIN_ERROR|native guard failed\nAll tests passed.\n'
        result, = candidate.parse_candidate(text, self.cases)
        self.assertEqual(result['status'], 'error'); self.assertNotIn('output', result)
        with self.assertRaises(ProtocolError): candidate.parse_candidate(text.replace('native guard failed', ''), self.cases)

    def test_unknown_algorithm_does_not_launch_or_read_runtime(self):
        output = io.StringIO()
        with patch.object(candidate, 'load_request', return_value=dict(cases=[dict(id='unknown', algorithm='unknown', input={})])), \
             patch('sys.argv', ['candidate']), patch.object(candidate, 'create_snapshot', side_effect=AssertionError()), \
             patch.object(candidate.subprocess, 'run', side_effect=AssertionError()), redirect_stdout(output):
            candidate.main()
        result = json.loads(output.getvalue())
        self.assertFalse(result['implementation']['candidate_executed'])
        self.assertEqual(result['results'][0]['status'], 'unsupported')

    def mock_worker(self, mutate=False, exit_code=0):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); runtime = root / 'GLSMAC.js'; runtime.write_text('fake runtime')
            runtime.with_suffix('.wasm').write_bytes(b'fake wasm'); captured = {}
            def run(command, **kwargs):
                request = json.loads(kwargs['input']); captured.update(json.loads(Path(request['snapshot']).read_text()))
                if mutate: runtime.write_text('changed runtime')
                return SimpleNamespace(returncode=exit_code, stdout=self.text, stderr='')
            output = io.StringIO()
            with patch('sys.argv', ['candidate', '--runtime', str(runtime), '--log', str(root / 'log')]), \
                 patch.object(candidate, 'load_request', return_value=dict(cases=deepcopy(self.cases))), \
                 patch.object(candidate, 'create_snapshot', return_value={}), \
                 patch.object(candidate.subprocess, 'run', side_effect=run), redirect_stdout(output): candidate.main()
            return json.loads(output.getvalue()), captured

    def test_transfers_only_public_sources_and_reports_bound_snapshot(self):
        response, snapshot = self.mock_worker()
        self.assertEqual(response['results'][0]['status'], 'ok')
        self.assertEqual(len(response['implementation']['scripts_sha256']), 64)
        self.assertFalse(response['implementation']['rendering'])
        script, = snapshot.values()
        self.assertIn('const colony_menu_inputs = ', script)
        for name in declarations('synthetic'): self.assertIn(name, script)

    def test_runtime_change_or_worker_failure_fail_closed(self):
        for args in (dict(mutate=True), dict(exit_code=1)):
            with self.assertRaises(ProtocolError): self.mock_worker(**args)


if __name__ == '__main__': unittest.main()
