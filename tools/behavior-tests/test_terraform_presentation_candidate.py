"""Strict native presentation parser and source transport; no reference effects."""
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
from ui import terraform_presentation_headless as candidate
from ui.terraform_presentation_inputs import suite, declarations


class TerraformPresentationCandidateTests(unittest.TestCase):
    def setUp(self):
        self.cases = suite()['cases'][:1]
        self.count = len(self.cases[0]['input']['actions']) + 1
        self.closed = 'TPRESENT_STATE|{index}|0|former|false\nTPRESENT_STATE_DONE\n'
        self.headers = ''.join(f'TPRESENT_HEADER|{i}|false|Header {i}\n' for i in range(9))
        self.open = ('TPRESENT_STATE|2|0|former|true\n' + self.headers + 'TPRESENT_CHILD|5\n'
                     'TPRESENT_ROW|rgb(176, 212, 235)|Actual   Farm\nTPRESENT_SEPARATOR\n'
                     'TPRESENT_ROW|black|Other Row\nTPRESENT_STATE_DONE\n')
        self.text = ('TPRESENT_CASE|' + self.cases[0]['id'] + '\n'
                     + ''.join(self.closed.format(index=i) if i != 2 else self.open for i in range(self.count))
                     + 'TPRESENT_DONE\nAll tests passed.\n')

    def test_projects_reported_rows_palette_and_groups_without_deriving_context_results(self):
        result, = candidate.parse_candidate(self.text, self.cases)
        trace = result['output']['trace']
        self.assertIsNone(trace[-1]['menu'])
        self.assertEqual(trace[2]['menu']['child']['rows'], [dict(label='ACTUAL FARM', tone='light'),
                         dict(separator=True), dict(label='OTHER ROW', tone='dark')])
        changed, = candidate.parse_candidate(self.text.replace('Actual   Farm', 'Changed Label').replace('|former|', '|colony|'), self.cases)
        self.assertEqual(changed['output']['trace'][2]['selected'], 'colony')
        self.assertEqual(changed['output']['trace'][2]['menu']['child']['rows'][0]['label'], 'CHANGED LABEL')

    def test_rejects_partial_duplicate_reordered_or_orphan_mounted_controls(self):
        for value in (self.text.replace('TPRESENT_STATE|0', 'TPRESENT_STATE|1'),
                      self.text.replace('TPRESENT_DONE\n', ''),
                      self.text.replace('TPRESENT_HEADER|0|false|Header 0\n', ''),
                      self.text.replace('TPRESENT_HEADER|0', 'TPRESENT_HEADER|1'),
                      self.text.replace('TPRESENT_CHILD|5', 'TPRESENT_CHILD|5\nTPRESENT_CHILD|5'),
                      self.text.replace('TPRESENT_CHILD|5\n', ''),
                      self.text.replace('TPRESENT_CHILD|5', 'TPRESENT_CHILD|4'),
                      self.text.replace('TPRESENT_SEPARATOR', 'TPRESENT_SEPARATOR|supplied'),
                      self.text.replace('rgb(176, 212, 235)', 'red'),
                      self.text.replace('TPRESENT_DONE', 'TPRESENT_UNKNOWN'),
                      self.text.replace('TPRESENT_HEADER|1|false', 'TPRESENT_HEADER|1|1')):
            with self.subTest(value=value), self.assertRaises(ProtocolError): candidate.parse_candidate(value, self.cases)

    def test_requires_full_requested_trace_engine_success_and_paused_native_year(self):
        for value in (self.text.replace('All tests passed.', ''), self.text + 'TEST FAILED\n',
                      self.text.replace(self.closed.format(index=self.count - 1), ''),
                      self.text.replace('|0|former|false', '|1|former|false'),
                      self.text.replace('|former|', '|unknown|')):
            with self.assertRaises(ProtocolError): candidate.parse_candidate(value, self.cases)

    def test_native_guard_failure_has_no_manufactured_output(self):
        text = 'TPRESENT_CASE|' + self.cases[0]['id'] + '\nTPRESENT_ERROR|native identity changed\nAll tests passed.\n'
        result, = candidate.parse_candidate(text, self.cases)
        self.assertEqual(result['status'], 'error'); self.assertNotIn('output', result)
        with self.assertRaises(ProtocolError): candidate.parse_candidate(text.replace('native identity changed', ''), self.cases)

    def test_unknown_contract_does_not_read_runtime_or_start_application(self):
        output = io.StringIO()
        with patch.object(candidate, 'load_request', return_value=dict(cases=[dict(id='unknown', algorithm='unknown', input={})])), \
             patch('sys.argv', ['candidate']), patch.object(candidate, 'create_snapshot', side_effect=AssertionError()), \
             patch.object(candidate.subprocess, 'run', side_effect=AssertionError()), redirect_stdout(output): candidate.main()
        response = json.loads(output.getvalue())
        self.assertFalse(response['implementation']['candidate_executed'])
        self.assertEqual(response['results'][0]['status'], 'unsupported')

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

    def test_exact_public_sources_and_snapshot_are_fingerprinted_without_rendering(self):
        response, snapshot = self.mock_worker()
        self.assertEqual(response['results'][0]['status'], 'ok')
        self.assertEqual(len(response['implementation']['scripts_sha256']), 64)
        self.assertFalse(response['implementation']['rendering'])
        script, = snapshot.values()
        self.assertIn('const terraform_presentation_inputs = ', script)
        for name in declarations('synthetic'): self.assertIn(name, script)

    def test_runtime_mutation_and_worker_failure_fail_closed(self):
        for args in (dict(mutate=True), dict(exit_code=1)):
            with self.assertRaises(ProtocolError): self.mock_worker(**args)


if __name__ == '__main__': unittest.main()
