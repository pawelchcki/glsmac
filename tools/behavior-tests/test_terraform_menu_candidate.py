"""Strict candidate transport/parser checks; no original adapter or app worker."""
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
from ui import terraform_menu_contract as contract
from ui import terraform_menu_headless as candidate
from ui.terraform_menu_inputs import declarations


class TerraformMenuCandidateTests(unittest.TestCase):
    def setUp(self):
        self.cases = [dict(id='synthetic-shape', algorithm=contract.ALGORITHM,
                           input=dict(profile='spread', initial_base=deepcopy(contract.INITIAL), text_profile='synthetic', actions=[]))]
        self.text = ('TMENU_CASE|synthetic-shape\n'
                     'TMENU_STATE|0|0|former|none|0|0|false|false|false|false|false|none\n'
                     'TMENU_DONE\nAll tests passed.\n')

    def test_reads_native_fields_without_deriving_command_results(self):
        row, = candidate.parse_candidate(self.text, self.cases)
        state, = row['output']['trace']
        self.assertEqual(state, dict(year_delta=0, selected='former', order='none', movement_spent=0, work_units=0,
                                    terrain=dict(road=False, farm=False, mine=False, forest=False), root_open=False, child_header=None))
        changed = self.text.replace('former|none|0|0', 'colony|farm|3|2').replace('false|none\n', 'true|5\n')
        actual, = candidate.parse_candidate(changed, self.cases)
        self.assertEqual(actual['output']['trace'][0]['order'], 'farm')
        self.assertEqual(actual['output']['trace'][0]['selected'], 'colony')
        self.assertEqual(actual['output']['trace'][0]['child_header'], 5)

    def test_rejects_missing_duplicate_reordered_and_orphan_markers(self):
        for value in (self.text.replace('TMENU_DONE\n', ''),
                      self.text.replace('TMENU_STATE|0', 'TMENU_STATE|1'),
                      self.text.replace('TMENU_STATE|0', 'TMENU_STATE|00'),
                      self.text.replace('TMENU_DONE', 'TMENU_DONE\nTMENU_DONE'),
                      self.text.replace('TMENU_STATE|0', 'TMENU_STATE|0|unexpected'),
                      self.text.replace('TMENU_DONE', 'TMENU_UNKNOWN'),
                      self.text.replace('synthetic-shape', 'another-case')):
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                candidate.parse_candidate(value, self.cases)

    def test_rejects_native_bounds_types_and_inconsistent_menu_visibility(self):
        for before, after in (('none|0|0', 'none|4|0'), ('none|0|0', 'none|0|129'),
                              ('former|none', 'other|none'), ('former|none', 'former|guessed'),
                              ('false|none\n', 'false|5\n'), ('false|none\n', 'true|9\n'),
                              ('false|none\n', 'true|05\n'), ('false', '0'), ('|0|former', '|1|former')):
            with self.subTest(after=after), self.assertRaises(ProtocolError):
                candidate.parse_candidate(self.text.replace(before, after), self.cases)

    def test_requires_engine_success_and_every_requested_checkpoint(self):
        for value in (self.text.replace('All tests passed.', ''), self.text + 'TEST FAILED\n',
                      self.text.replace('All tests passed.', 'Unhandled exception')):
            with self.assertRaises(ProtocolError):
                candidate.parse_candidate(value, self.cases)
        cases = deepcopy(self.cases); cases[0]['input']['actions'] = ['menu']
        with self.assertRaises(ProtocolError):
            candidate.parse_candidate(self.text, cases)

    def test_reports_independent_native_errors_without_manufacturing_state(self):
        cases = self.cases + [dict(self.cases[0], id='second')]
        text = ('TMENU_CASE|synthetic-shape\nTMENU_ERROR|native guard|failed\n'
                'TMENU_CASE|second\nTMENU_ERROR|missing mounted control\nAll tests passed.\n')
        rows = candidate.parse_candidate(text, cases)
        self.assertEqual([row['status'] for row in rows], ['error', 'error'])
        self.assertEqual(rows[0]['reason'], 'native guard|failed')
        self.assertNotIn('output', rows[0])
        with self.assertRaises(ProtocolError):
            candidate.parse_candidate(text.replace('TMENU_ERROR|native guard|failed', 'TMENU_ERROR|'), cases)

    def test_unknown_algorithm_does_not_start_a_worker_or_read_runtime(self):
        request = dict(cases=[dict(id='unknown', algorithm='unrecognized', input={})])
        output = io.StringIO()
        with patch.object(candidate, 'load_request', return_value=request), patch('sys.argv', ['candidate']), \
             patch.object(candidate, 'create_snapshot', side_effect=AssertionError('no snapshot')), \
             patch.object(candidate.subprocess, 'run', side_effect=AssertionError('no worker')), redirect_stdout(output):
            candidate.main()
        response = json.loads(output.getvalue())
        self.assertEqual(response['results'][0]['status'], 'unsupported')
        self.assertFalse(response['implementation']['candidate_executed'])

    def run_mock_worker(self, *, mutate_runtime=False, exit_code=0):
        with tempfile.TemporaryDirectory(prefix='terraform-candidate-protocol-') as temporary:
            directory = Path(temporary); runtime = directory / 'GLSMAC.js'; runtime.write_text('fake runtime')
            runtime.with_suffix('.wasm').write_bytes(b'fake wasm')
            template = directory / 'template.gls.js'; template.write_text('// fake template\n')
            captured = {}
            cases = deepcopy(self.cases); cases[0]['input']['actions'] = ['menu']
            worker_text = self.text.replace('TMENU_DONE',
                'TMENU_STATE|1|0|former|none|0|0|false|false|false|false|true|none\nTMENU_DONE')

            def run(command, **kwargs):
                request = json.loads(kwargs['input'])
                captured.update(json.loads(Path(request['snapshot']).read_text()))
                if mutate_runtime:
                    runtime.write_text('changed runtime')
                return SimpleNamespace(returncode=exit_code, stdout=worker_text, stderr='')

            output = io.StringIO()
            with patch('sys.argv', ['candidate', '--runtime', str(runtime), '--template', str(template), '--log', str(directory / 'log')]), \
                 patch.object(candidate, 'load_request', return_value=dict(cases=cases)), \
                 patch.object(candidate, 'create_snapshot', return_value={}), \
                 patch.object(candidate.subprocess, 'run', side_effect=run), redirect_stdout(output):
                candidate.main()
            return json.loads(output.getvalue()), captured

    def test_transfers_declared_sources_and_reports_bound_runtime_and_script_snapshot(self):
        response, snapshot = self.run_mock_worker()
        self.assertEqual(response['results'][0]['status'], 'ok')
        runner = response['implementation']
        self.assertFalse(runner['rendering']); self.assertFalse(runner['assets_required'])
        self.assertEqual(len(runner['runtime_sha256']), 64); self.assertEqual(len(runner['scripts_sha256']), 64)
        script, = snapshot.values()
        self.assertIn('const terraform_menu_inputs = ', script)
        for name in declarations('synthetic'):
            self.assertIn(name, script)

    def test_changed_runtime_and_nonzero_worker_exit_fail_closed(self):
        for options in (dict(mutate_runtime=True), dict(exit_code=1)):
            with self.subTest(options=options), self.assertRaises(ProtocolError):
                self.run_mock_worker(**options)


if __name__ == '__main__':
    unittest.main()
