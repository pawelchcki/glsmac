"""Strict candidate transport tests; synthetic marker streams are not gold."""
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
from ui import colony_found_menu_headless as candidate
from ui.colony_found_menu_inputs import declarations, suite


def native_log(cases, *, dialog=False, city=False):
    lines = []
    for case in cases:
        lines.append('FOUND_CASE|' + case['id'])
        for checkpoint in range(len(case['input']['actions']) + 1):
            lines.append(f'FOUND_STATE|{checkpoint}|0|colony|{2 if city else 1}')
            lines.append('FOUND_BASE|Observed City|1|1|0|1' if city else 'FOUND_NO_BASE')
            lines.extend(['FOUND_UNIT|scout|2|3', 'FOUND_UNIT|former|2|3'])
            if not city:
                lines.append('FOUND_UNIT|colony|0|0')
            lines.append('FOUND_MENU|false|none')
            lines.extend(['FOUND_CAPTION|Observed caption', 'FOUND_LABEL|Observed label', 'FOUND_VALUE|',
                          'FOUND_BUTTON|Accept', 'FOUND_BUTTON|Dismiss'] if dialog else ['FOUND_NO_DIALOG'])
            lines.append('FOUND_STATE_DONE')
        lines.append('FOUND_CASE_DONE')
    return '\n'.join(lines) + '\nAll tests passed.\n'


class ColonyFoundMenuCandidateTests(unittest.TestCase):
    def setUp(self):
        self.cases = suite()['cases']

    def test_observations_are_projected_without_supplying_case_specific_effects(self):
        for dialog, city in [(False, False), (True, False), (False, True)]:
            with self.subTest(dialog=dialog, city=city):
                rows = candidate.parse_candidate(native_log(self.cases, dialog=dialog, city=city), self.cases)
                self.assertEqual([r['id'] for r in rows], [c['id'] for c in self.cases])
                self.assertEqual(len(rows[0]['output']['trace']), 10)
                state = rows[0]['output']['trace'][0]
                self.assertEqual(state['new_base']['name'] if city else state['new_base'], 'Observed City' if city else None)
                self.assertEqual(state['dialog']['buttons'] if dialog else state['dialog'], ['ACCEPT', 'DISMISS'] if dialog else None)

    def test_missing_duplicate_reordered_cases_and_checkpoints_are_rejected(self):
        text = native_log(self.cases)
        defects = [native_log(self.cases[:1]), native_log(self.cases + self.cases[:1]), native_log(self.cases[::-1]),
                   text.replace('FOUND_STATE|1|', 'FOUND_STATE|2|', 1), text.replace('FOUND_CASE_DONE\n', '', 1),
                   text.replace('FOUND_STATE_DONE\n', '', 1), text.removesuffix('All tests passed.\n')]
        for defect in defects:
            with self.subTest(defect=defect[:70]), self.assertRaises(ProtocolError):
                candidate.parse_candidate(defect, self.cases)

    def test_incomplete_duplicate_or_invalid_native_fields_fail_closed(self):
        text = native_log(self.cases, dialog=True)
        defects = [text.replace('FOUND_MENU|false|none\n', '', 1), text.replace('FOUND_LABEL|Observed label\n', '', 1),
                   text.replace('FOUND_NO_BASE', 'FOUND_NO_BASE\nFOUND_NO_BASE', 1),
                   text.replace('FOUND_UNIT|former|2|3', 'FOUND_UNIT|scout|2|3', 1),
                   text.replace('FOUND_VALUE|\n', 'FOUND_VALUE|\nFOUND_VALUE|duplicate\n', 1),
                   text.replace('FOUND_BUTTON|Accept', 'FOUND_BUTTON|Accept\nFOUND_BUTTON|Extra', 1),
                   text.replace('FOUND_STATE|0|0|colony|1', 'FOUND_STATE|0|1|colony|1', 1),
                   text.replace('FOUND_MENU|false|none', 'FOUND_MENU|true|5', 1),
                   text.replace('FOUND_UNIT|colony|0|0', 'FOUND_UNIT|colony|-1|0', 1),
                   text.replace('FOUND_NO_BASE', 'FOUND_BASE|Observed|1|0|0|0', 1),
                   text.replace('FOUND_NO_BASE', 'FOUND_UNKNOWN', 1)]
        for defect in defects:
            with self.subTest(defect=defect[:70]), self.assertRaises(ProtocolError):
                candidate.parse_candidate(defect, self.cases)

    def test_native_guard_error_discards_partial_trace_without_manufacturing_output(self):
        first = self.cases[0]['id']
        text = f'FOUND_CASE|{first}\nFOUND_STATE|0|0|colony|1\nFOUND_ERROR|missing real control\n' + native_log(self.cases[1:])
        rows = candidate.parse_candidate(text, self.cases)
        self.assertEqual(rows[0], dict(id=first, status='error', reason='missing real control'))
        self.assertEqual(rows[1]['status'], 'ok')

    def test_preparation_contains_only_public_sources_and_actual_key_inputs(self):
        for case in self.cases:
            original = deepcopy(case); prepared = candidate.prepare(case)
            self.assertEqual(case, original)
            self.assertEqual(prepared['sources'], [dict(name=n, source=s) for n, s in declarations(case['input']['text_profile']).items()])
            for actual, declared in zip(prepared['actions'], case['input']['actions'], strict=True):
                self.assertEqual(actual, dict(declared, keys=list(declared['edit'])) if isinstance(declared, dict) and 'edit' in declared else declared)

    def test_native_regression_input_is_the_exact_public_synthetic_declaration(self):
        expected = '// Public synthetic declaration copied without observed answers.\nreturn ' + candidate.gse_literal(candidate.prepare(self.cases[0])) + ';\n'
        self.assertEqual((candidate.ROOT / 'GLSMAC_data/tests/_colony_found_menu_regression_input.gls.js').read_text(), expected)

    def run_candidate(self, cases=None, *, mutate=None):
        cases = deepcopy(self.cases if cases is None else cases)
        self.commands = []; self.output = io.StringIO()
        with tempfile.TemporaryDirectory(prefix='found-menu-transport-') as directory:
            root = Path(directory); runtime = root / 'GLSMAC.js'; runtime.write_text('engine')
            runtime.with_suffix('.wasm').write_bytes(b'wasm'); sources = {'GLSMAC_data/default/declared.gls.js': '// production snapshot'}
            def run(command, **kwargs):
                request = json.loads(kwargs['input']); self.commands.append((command, kwargs, request))
                self.snapshot = json.loads(Path(request['snapshot']).read_text())
                if mutate:
                    (runtime if mutate == 'js' else runtime.with_suffix('.wasm')).write_text('changed')
                return SimpleNamespace(stdout=native_log([c for c in cases if c['algorithm'] == candidate.contract.ALGORITHM]), stderr='', returncode=0)
            with patch('sys.argv', ['candidate', '--runtime', str(runtime), '--log', str(root / 'candidate.log')]), \
                 patch.object(candidate, 'load_request', return_value=dict(cases=cases)), \
                 patch.object(candidate, 'create_snapshot', return_value=deepcopy(sources)), \
                 patch.object(candidate.subprocess, 'run', side_effect=run), redirect_stdout(self.output):
                candidate.main()
            self.sources = sources
        return json.loads(self.output.getvalue())

    def test_snapshot_fingerprint_runtime_and_unknown_order_are_preserved(self):
        cases = deepcopy(self.cases); cases.insert(1, dict(id='unknown', algorithm='unknown', input={}))
        response = self.run_candidate(cases)
        self.assertEqual([r['id'] for r in response['results']], [c['id'] for c in cases])
        self.assertEqual(response['results'][1]['status'], 'unsupported')
        self.assertEqual(self.commands[0][1]['timeout'], 180)
        template = (candidate.DIRECTORY / '_colony_found_menu_headless.gls.js').read_text()
        inputs = [candidate.prepare(c) for c in self.cases]
        digest = hashlib.sha256((canonical(self.sources) + template + canonical(inputs)).encode()).hexdigest()
        self.assertEqual(response['implementation']['scripts_sha256'], digest)
        self.assertEqual(response['implementation']['runtime_sha256'], hashlib.sha256(b'wasm').hexdigest())
        self.assertFalse(response['implementation']['rendering'])

    def test_runtime_mutation_fails_without_emitting_success(self):
        for kind in ('js', 'wasm'):
            with self.subTest(kind=kind), self.assertRaisesRegex(ProtocolError, 'runtime changed'):
                self.run_candidate(mutate=kind)
            self.assertEqual(self.output.getvalue(), '')

    def test_unknown_only_does_not_read_runtime_or_start_worker(self):
        response = self.run_candidate([dict(id='unknown', algorithm='unknown', input={})])
        self.assertEqual(self.commands, [])
        self.assertFalse(response['implementation']['candidate_executed'])
        self.assertEqual(response['results'][0]['status'], 'unsupported')


if __name__ == '__main__':
    unittest.main()
