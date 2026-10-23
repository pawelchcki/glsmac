"""Strict native candidate transport tests; marker fixtures are not observations."""
from contextlib import redirect_stdout
from copy import deepcopy
import hashlib
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from protocol import ProtocolError, canonical
from ui import colony_near_headless as candidate
from ui.colony_near_inputs import declarations, suite


def native_log(cases, *, dialog='false', message=None):
    lines = []
    for case in cases:
        lines.append('NEAR_CASE|' + case['id'])
        for checkpoint in range(len(case['input']['actions']) + 1):
            lines.append(f'NEAR_STATE|{checkpoint}|0|scout|1')
            lines.extend('NEAR_UNIT|' + role + '|0|0' for role in candidate.ROLES)
            lines.append('NEAR_MENU|false|none|' + dialog)
            lines.append('NEAR_NO_MESSAGE' if message is None else 'NEAR_MESSAGE|' + message)
            lines.append('NEAR_STATE_DONE')
        lines.append('NEAR_CASE_DONE')
    return '\n'.join(lines) + '\nAll tests passed.\n'


class ColonyNearCandidateTests(unittest.TestCase):
    def setUp(self):
        self.cases = suite()['cases']

    def test_observer_accepts_actual_dialog_and_message_without_supplying_rejection(self):
        for dialog, message in [('false', None), ('true', None), ('false', '  native\tmessage  ')]:
            with self.subTest(dialog=dialog, message=message):
                rows = candidate.parse_candidate(native_log(self.cases, dialog=dialog, message=message), self.cases)
                self.assertEqual([r['id'] for r in rows], [c['id'] for c in self.cases])
                state = rows[0]['output']['trace'][0]
                self.assertEqual(state['dialog_open'], dialog == 'true')
                self.assertEqual(state['message'], None if message is None else 'NATIVE MESSAGE')
                self.assertEqual(len(rows[0]['output']['trace']), 6)

    def test_missing_duplicate_reordered_or_incomplete_native_cases_fail_closed(self):
        text = native_log(self.cases)
        for defect in [native_log(self.cases[:1]), native_log(self.cases + self.cases[:1]), native_log(self.cases[::-1]),
                       text.replace('NEAR_STATE|1|', 'NEAR_STATE|2|', 1), text.replace('NEAR_CASE_DONE\n', '', 1),
                       text.replace('NEAR_STATE_DONE\n', '', 1), text.removesuffix('All tests passed.\n')]:
            with self.subTest(defect=defect[:70]), self.assertRaises(ProtocolError):
                candidate.parse_candidate(defect, self.cases)

    def test_duplicate_missing_or_malformed_native_state_is_rejected(self):
        text = native_log(self.cases)
        for defect in [text.replace('NEAR_NO_MESSAGE', 'NEAR_NO_MESSAGE\nNEAR_MESSAGE|duplicate', 1),
                       text.replace('NEAR_NO_MESSAGE\n', '', 1), text.replace('NEAR_NO_MESSAGE', 'NEAR_MESSAGE|', 1),
                       text.replace('NEAR_UNIT|former|0|0', 'NEAR_UNIT|scout|0|0', 1),
                       text.replace('NEAR_UNIT|colony|0|0\n', '', 1), text.replace('NEAR_UNIT|colony|0|0', 'NEAR_UNIT|colony|-1|0', 1),
                       text.replace('NEAR_STATE|0|0|scout|1', 'NEAR_STATE|0|1|scout|1', 1),
                       text.replace('NEAR_STATE|0|0|scout|1', 'NEAR_STATE|0|0|scout|2', 1),
                       text.replace('NEAR_MENU|false|none|false', 'NEAR_MENU|false|5|false', 1),
                       text.replace('NEAR_NO_MESSAGE', 'NEAR_UNKNOWN', 1)]:
            with self.subTest(defect=defect[:70]), self.assertRaises(ProtocolError):
                candidate.parse_candidate(defect, self.cases)

    def test_native_guard_failure_discards_partial_trace_and_keeps_later_case_honest(self):
        identifier = self.cases[0]['id']
        text = f'NEAR_CASE|{identifier}\nNEAR_STATE|0|0|scout|1\nNEAR_ERROR|native identity changed\n' + native_log(self.cases[1:])
        rows = candidate.parse_candidate(text, self.cases)
        self.assertEqual(rows[0], dict(id=identifier, status='error', reason='native identity changed'))
        self.assertEqual(rows[1]['status'], 'ok')

    def test_preparation_uses_live_public_declarations_without_mutating_inputs(self):
        for case in self.cases:
            before = deepcopy(case); data = candidate.prepare(case)
            self.assertEqual(case, before)
            self.assertEqual(data['actions'], before['input']['actions'])
            self.assertEqual(data['sources'], [dict(name=n, source=s) for n, s in declarations(case['input']['text_profile']).items()])
            self.assertEqual(set(data), set(before['input']) | {'id', 'sources'})

    def run_candidate(self, cases=None, *, mutate=None, exit_code=0):
        cases = deepcopy(self.cases if cases is None else cases); self.commands = []; self.output = io.StringIO()
        with tempfile.TemporaryDirectory(prefix='near-menu-transport-') as temporary:
            root = Path(temporary); runtime = root / 'GLSMAC.js'; runtime.write_text('engine')
            wasm = runtime.with_suffix('.wasm'); wasm.write_bytes(b'wasm')
            self.sources = {'GLSMAC_data/default/module.gls.js': '// shared source snapshot'}
            def run(command, **kwargs):
                request = json.loads(kwargs['input']); self.commands.append((command, kwargs, request))
                self.snapshot = json.loads(Path(request['snapshot']).read_text())
                if mutate:
                    (runtime if mutate == 'js' else wasm).write_text('modified runtime')
                return SimpleNamespace(returncode=exit_code, stdout=native_log([c for c in cases if c['algorithm'] == candidate.contract.ALGORITHM]), stderr='')
            with patch('sys.argv', ['candidate', '--runtime', str(runtime), '--log', str(root / 'native.log')]), \
                 patch.object(candidate, 'load_request', return_value=dict(cases=cases)), \
                 patch.object(candidate, 'create_snapshot', return_value=deepcopy(self.sources)), \
                 patch.object(candidate.subprocess, 'run', side_effect=run), redirect_stdout(self.output):
                candidate.main()
        return json.loads(self.output.getvalue())

    def test_full_snapshot_input_fingerprint_and_unknown_request_order_are_preserved(self):
        cases = deepcopy(self.cases); cases.insert(1, dict(id='unknown', algorithm='unknown', input={}))
        response = self.run_candidate(cases)
        self.assertEqual([r['id'] for r in response['results']], [c['id'] for c in cases])
        self.assertEqual(response['results'][1]['status'], 'unsupported')
        inputs = [candidate.prepare(case) for case in self.cases]
        template = (candidate.DIRECTORY / '_colony_near_headless.gls.js').read_text()
        digest = hashlib.sha256((canonical(self.sources) + template + canonical(inputs)).encode()).hexdigest()
        self.assertEqual(response['implementation']['scripts_sha256'], digest)
        self.assertEqual(response['implementation']['runtime_sha256'], hashlib.sha256(b'wasm').hexdigest())
        self.assertFalse(response['implementation']['rendering'])
        self.assertEqual(self.commands[0][1]['timeout'], 180)

    def test_mutated_runtime_or_failed_worker_cannot_emit_success(self):
        for kind in ('js', 'wasm'):
            with self.subTest(kind=kind), self.assertRaisesRegex(ProtocolError, 'runtime changed'):
                self.run_candidate(mutate=kind)
            self.assertEqual(self.output.getvalue(), '')
        with self.assertRaisesRegex(ProtocolError, 'worker failed'):
            self.run_candidate(exit_code=1)
        self.assertEqual(self.output.getvalue(), '')

    def test_unknown_only_never_starts_an_application(self):
        response = self.run_candidate([dict(id='unknown', algorithm='unknown', input={})])
        self.assertEqual(self.commands, [])
        self.assertFalse(response['implementation']['candidate_executed'])
        self.assertEqual(response['results'][0]['status'], 'unsupported')

    def test_request_bound_rejects_excess_before_starting_worker(self):
        cases = deepcopy(self.cases); cases.append(dict(cases[0], id='extra'))
        with self.assertRaises(ProtocolError):
            self.run_candidate(cases)
        self.assertEqual(self.commands, [])


if __name__ == '__main__':
    unittest.main()
