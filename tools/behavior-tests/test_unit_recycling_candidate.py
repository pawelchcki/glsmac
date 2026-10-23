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
from ui import unit_recycling_headless as candidate
from ui.unit_recycling_inputs import declarations, suite


def native_log(cases, *, dialog=None, survivors=None, minerals=0, choices=3):
    lines = []
    survivors = candidate.ROLES if survivors is None else survivors
    for case in cases:
        lines.append('RECYCLING_CASE|' + case['id'])
        for checkpoint in range(len(case['input']['actions']) + 1):
            lines.append(f'RECYCLING_STATE|{checkpoint}|0|scout|1|{minerals}')
            lines.extend('RECYCLING_UNIT|' + role + '|0|0' for role in survivors)
            lines.append('RECYCLING_MENU|false|none')
            if dialog is None:
                lines.append('RECYCLING_NO_DIALOG')
            else:
                lines.extend(['RECYCLING_CAPTION| actual caption ', 'RECYCLING_BODY| actual body ',
                              *['RECYCLING_CHOICE| observed ' + name + ' ' for name in 'ABC'[:choices]],
                              'RECYCLING_SELECTED|' + str(dialog), 'RECYCLING_BUTTON|actual button'])
            lines.append('RECYCLING_STATE_DONE')
        lines.append('RECYCLING_CASE_DONE')
    return '\n'.join(lines) + '\nAll tests passed.\n'


class UnitRecyclingCandidateTests(unittest.TestCase):
    def setUp(self):
        self.cases = suite()['cases']

    def test_observer_projects_actual_dialog_selection_and_survivors_without_effects(self):
        for dialog in (None, 0, 1, 2):
            for survivors in (candidate.ROLES, ('former', 'colony')):
                with self.subTest(dialog=dialog, survivors=survivors):
                    rows = candidate.parse_candidate(native_log(self.cases, dialog=dialog, survivors=survivors), self.cases)
                    self.assertEqual([r['id'] for r in rows], [c['id'] for c in self.cases])
                    state = rows[0]['output']['trace'][0]
                    self.assertEqual([u['role'] for u in state['units']], list(survivors))
                    self.assertEqual(len(rows[0]['output']['trace']), len(self.cases[0]['input']['actions']) + 1)
                    if dialog is None:
                        self.assertIsNone(state['dialog'])
                    else:
                        self.assertEqual(state['dialog'], dict(caption='ACTUAL CAPTION', body='ACTUAL BODY',
                            choices=['OBSERVED A', 'OBSERVED B', 'OBSERVED C'], selected=dialog, buttons=['ACTUAL BUTTON']))

    def test_two_choice_dialog_and_signed_native_mineral_delta_are_not_derived(self):
        for selected in (0, 1):
            for delta in (-100000, -1, 0, 137, 100000):
                with self.subTest(selected=selected, delta=delta):
                    rows = candidate.parse_candidate(native_log(self.cases, dialog=selected, choices=2,
                        survivors=('former', 'colony'), minerals=delta), self.cases)
                    for row in rows:
                        for state in row['output']['trace']:
                            self.assertEqual(state['mineral_delta'], delta)
                            self.assertEqual(state['dialog']['selected'], selected)
                            self.assertEqual(state['dialog']['choices'], ['OBSERVED A', 'OBSERVED B'])

    def test_missing_or_malformed_mineral_delta_fails_closed(self):
        text = native_log(self.cases)
        for value in ('', '+1', '-0', '1.5', '100001', '-100001', '0|1'):
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                candidate.parse_candidate(text.replace('RECYCLING_STATE|0|0|scout|1|0',
                    'RECYCLING_STATE|0|0|scout|1|' + value, 1), self.cases)

    def test_missing_duplicate_reordered_or_incomplete_native_cases_fail_closed(self):
        text = native_log(self.cases)
        for defect in [native_log(self.cases[:1]), native_log(self.cases + self.cases[:1]), native_log(self.cases[::-1]),
                       text.replace('RECYCLING_STATE|1|', 'RECYCLING_STATE|2|', 1), text.replace('RECYCLING_CASE_DONE\n', '', 1),
                       text.replace('RECYCLING_STATE_DONE\n', '', 1), text.removesuffix('All tests passed.\n')]:
            with self.subTest(defect=defect[:70]), self.assertRaises(ProtocolError):
                candidate.parse_candidate(defect, self.cases)

    def test_duplicate_missing_or_malformed_native_state_is_rejected(self):
        text = native_log(self.cases)
        for defect in [text.replace('RECYCLING_NO_DIALOG', 'RECYCLING_NO_DIALOG\nRECYCLING_NO_DIALOG', 1),
                       text.replace('RECYCLING_NO_DIALOG\n', '', 1),
                       text.replace('RECYCLING_UNIT|former|0|0', 'RECYCLING_UNIT|scout|0|0', 1),
                       text.replace('RECYCLING_UNIT|colony|0|0\n', '', 1), text.replace('RECYCLING_UNIT|colony|0|0', 'RECYCLING_UNIT|colony|-1|0', 1),
                       text.replace('RECYCLING_STATE|0|0|scout|1|0', 'RECYCLING_STATE|0|1|scout|1|0', 1),
                       text.replace('RECYCLING_STATE|0|0|scout|1|0', 'RECYCLING_STATE|0|0|scout|2|0', 1),
                       text.replace('RECYCLING_MENU|false|none', 'RECYCLING_MENU|false|5', 1),
                       text.replace('RECYCLING_NO_DIALOG', 'RECYCLING_UNKNOWN', 1)]:
            with self.subTest(defect=defect[:70]), self.assertRaises(ProtocolError):
                candidate.parse_candidate(defect, self.cases)

    def test_incomplete_duplicate_or_invalid_dialog_fields_are_rejected(self):
        text = native_log(self.cases, dialog=1)
        for defect in [text.replace('RECYCLING_BODY| actual body \n','',1),
                       text.replace('RECYCLING_BODY| actual body ', 'RECYCLING_BODY|',1),
                       text.replace('RECYCLING_BODY| actual body ', 'RECYCLING_BODY| actual body \nRECYCLING_BODY|duplicate',1),
                       text.replace('RECYCLING_SELECTED|1', 'RECYCLING_SELECTED|3',1),
                       text.replace('RECYCLING_SELECTED|1', 'RECYCLING_SELECTED|1\nRECYCLING_SELECTED|0',1),
                       text.replace('RECYCLING_CHOICE| observed C \n','',1).replace('RECYCLING_CHOICE| observed B \n','',1),
                       text.replace('RECYCLING_BUTTON|actual button', 'RECYCLING_BUTTON|actual button\nRECYCLING_BUTTON|extra',1),
                       text.replace('RECYCLING_CAPTION| actual caption ', 'RECYCLING_NO_DIALOG',1)]:
            with self.subTest(defect=defect[:70]), self.assertRaises(ProtocolError):
                candidate.parse_candidate(defect,self.cases)

    def test_native_guard_failure_discards_partial_trace_and_keeps_later_case_honest(self):
        identifier = self.cases[0]['id']
        text = f'RECYCLING_CASE|{identifier}\nRECYCLING_STATE|0|0|scout|1|0\nRECYCLING_ERROR|native identity changed\n' + native_log(self.cases[1:])
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
        with tempfile.TemporaryDirectory(prefix='recycling-transport-') as temporary:
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
        template = (candidate.DIRECTORY / '_unit_recycling_headless.gls.js').read_text()
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
