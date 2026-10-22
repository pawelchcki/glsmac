"""Native context adapter batching and strict transport, without app workers."""
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
from ui import unit_menu_context_headless as candidate
from ui.unit_menu_context_inputs import suite, declarations


def native_log(inputs):
    """Structurally valid observations, deliberately without menu action effects."""
    lines = []
    for item in inputs:
        lines.append('IMENU_CASE|' + item['id'])
        for index in range(len(item['actions']) + 1):
            lines.extend([f'IMENU_STATE|{index}|map|0|scout', "IMENU_NAME|Gaia's Landing",
                          'IMENU_BASE|1|0|1|0|1', 'IMENU_UNIT|scout|0|0',
                          'IMENU_UNIT|former|0|0', 'IMENU_UNIT|colony|0|0', 'IMENU_STATE_DONE'])
        lines.append('IMENU_CASE_DONE')
    return '\n'.join(lines) + '\nAll tests passed.\n'


class UnitMenuContextCandidateTests(unittest.TestCase):
    def setUp(self):
        self.cases = suite()['cases']
        self.batches = []; self.workers = []; self.snapshots = []; self.output = io.StringIO()
        self.sources = {'GLSMAC_data/default/synthetic_module.gls.js': '// frozen shared source\n'}
        self.template = '// synthetic probe template\n'

    def run_candidate(self, cases=None, *, bad_batch=0, defect=None):
        cases = deepcopy(self.cases if cases is None else cases)
        with tempfile.TemporaryDirectory(prefix='context-candidate-transport-') as temporary:
            directory = Path(temporary); runtime = directory / 'GLSMAC.js'; runtime.write_text('fake runtime')
            wasm = runtime.with_suffix('.wasm'); wasm.write_bytes(b'fake wasm')
            template = directory / 'template.gls.js'; template.write_text(self.template)
            log = directory / 'native.log'; literal = candidate.gse_literal
            self.runtime_hash = hashlib.sha256(wasm.read_bytes()).hexdigest()

            def record_literal(inputs):
                self.batches.append(deepcopy(inputs)); return literal(inputs)

            def run(command, **kwargs):
                request = json.loads(kwargs['input']); self.workers.append((command, deepcopy(kwargs), request))
                snapshot = json.loads(Path(request['snapshot']).read_text()); self.snapshots.append(snapshot)
                current = deepcopy(self.batches[-1]); text = native_log(current); code = 0
                if len(self.workers) == bad_batch:
                    if defect == 'missing': text = native_log(current[:-1])
                    elif defect == 'missing-batch': text = native_log([])
                    elif defect == 'duplicate-batch': text = native_log(self.batches[-2])
                    elif defect == 'duplicate': text = native_log(current + current[:1])
                    elif defect == 'reordered': text = native_log([current[1], current[0], *current[2:]])
                    elif defect == 'previous-batch': text = native_log(self.batches[-2][:1] + current[1:])
                    elif defect == 'checkpoint':
                        text = text.replace('IMENU_STATE|1|map|0|scout\n', 'IMENU_STATE|2|map|0|scout\n', 1)
                    elif defect == 'native-error':
                        first = native_log(current[:1]).removesuffix('All tests passed.\n')
                        text = text.replace(first, 'IMENU_CASE|' + current[0]['id'] + '\nIMENU_ERROR|native guard failed\n', 1)
                    elif defect == 'javascript': runtime.write_text('mutated engine')
                    elif defect == 'wasm': wasm.write_bytes(b'mutated engine')
                    elif defect == 'exit': code = 1
                    elif defect == 'engine-success': text = text.replace('All tests passed.', '')
                    else: raise AssertionError('Unknown test defect')
                return SimpleNamespace(returncode=code, stdout=text, stderr=f'worker {len(self.workers)}\n')

            with patch('sys.argv', ['candidate', '--runtime', str(runtime), '--template', str(template), '--log', str(log)]), \
                 patch.object(candidate, 'load_request', return_value=dict(cases=cases)), \
                 patch.object(candidate, 'create_snapshot', return_value=deepcopy(self.sources)), \
                 patch.object(candidate, 'gse_literal', side_effect=record_literal), \
                 patch.object(candidate.subprocess, 'run', side_effect=run), redirect_stdout(self.output):
                candidate.main()
            self.log = log.read_text() if log.exists() else ''
        return json.loads(self.output.getvalue())

    def test_complete_twelve_cases_use_three_isolated_four_case_workers(self):
        response = self.run_candidate()
        self.assertEqual([len(batch) for batch in self.batches], [4, 4, 4])
        self.assertEqual([item['id'] for batch in self.batches for item in batch], [c['id'] for c in self.cases])
        self.assertEqual([r['id'] for r in response['results']], [c['id'] for c in self.cases])
        self.assertTrue(all(r['status'] == 'ok' for r in response['results']))
        self.assertEqual(len({r[2]['prefix'] for r in self.workers}), 3)
        self.assertTrue(all(r[1]['timeout'] == 240 for r in self.workers), 'Keep the existing per-worker deadline')
        self.assertEqual(self.log.count('All tests passed.'), 3)

    def test_partial_last_batch_preserves_every_requested_native_action_and_source(self):
        self.run_candidate(self.cases[:5])
        self.assertEqual([len(batch) for batch in self.batches], [4, 1])
        for item, case in zip([i for b in self.batches for i in b], self.cases[:5], strict=True):
            expected = dict(case['input'], id=case['id'], sources=[dict(name=n, source=s)
                            for n, s in declarations(case['input']['text_profile']).items()])
            self.assertEqual(item, expected)
        for snapshot, batch in zip(self.snapshots, self.batches, strict=True):
            self.assertEqual(snapshot['GLSMAC_data/default/synthetic_module.gls.js'], self.sources['GLSMAC_data/default/synthetic_module.gls.js'])
            self.assertEqual(snapshot['GLSMAC_data/tests/unit_menu_context_headless_probe.gls.js'],
                             'const unit_menu_context_inputs = ' + candidate.gse_literal(batch) + ';\n' + self.template)

    def test_metadata_fingerprints_entire_shared_snapshot_and_all_inputs(self):
        response = self.run_candidate(); prepared = [i for b in self.batches for i in b]
        expected = hashlib.sha256((canonical(self.sources) + self.template + canonical(prepared)).encode()).hexdigest()
        self.assertEqual(response['implementation']['scripts_sha256'], expected)
        self.assertNotEqual(expected, hashlib.sha256((canonical(self.sources) + self.template + canonical(prepared[:4])).encode()).hexdigest())
        self.assertEqual(response['implementation']['runtime_sha256'], self.runtime_hash)
        self.assertFalse(response['implementation']['rendering']); self.assertFalse(response['implementation']['assets_required'])

    def test_mixed_unknown_algorithms_stay_unsupported_in_original_request_order(self):
        cases = deepcopy(self.cases)
        for index, name in [(12, 'last'), (5, 'middle'), (0, 'first')]:
            cases.insert(index, dict(id='unknown-' + name, algorithm='unknown', input={}))
        response = self.run_candidate(cases)
        self.assertEqual([r['id'] for r in response['results']], [c['id'] for c in cases])
        self.assertEqual([len(b) for b in self.batches], [4, 4, 4])
        for case, result in zip(cases, response['results'], strict=True):
            self.assertEqual(result['status'], 'unsupported' if case['algorithm'] == 'unknown' else 'ok')
            if result['status'] == 'unsupported': self.assertNotIn('output', result)

    def test_unknown_only_never_reads_runtime_or_launches_native_worker(self):
        output = io.StringIO()
        with patch('sys.argv', ['candidate', '--runtime', '/nonexistent/context-runtime.js']), \
             patch.object(candidate, 'load_request', return_value=dict(cases=[dict(id='unknown', algorithm='unknown', input={})])), \
             patch.object(candidate, 'create_snapshot', side_effect=AssertionError('No source read')), \
             patch.object(candidate.subprocess, 'run', side_effect=AssertionError('No native worker')), redirect_stdout(output):
            candidate.main()
        response = json.loads(output.getvalue())
        self.assertFalse(response['implementation']['candidate_executed'])
        self.assertEqual(response['results'][0]['status'], 'unsupported')

    def test_missing_duplicate_reordered_or_cross_batch_cases_fail_before_later_worker(self):
        for defect in ['missing', 'missing-batch', 'duplicate', 'duplicate-batch', 'reordered', 'previous-batch', 'checkpoint', 'engine-success']:
            with self.subTest(defect=defect):
                self.setUp()
                with self.assertRaises(ProtocolError): self.run_candidate(bad_batch=2, defect=defect)
                self.assertEqual(len(self.workers), 2)
                self.assertEqual(self.output.getvalue(), '', 'No partial success response')

    def test_native_case_guard_error_is_reported_without_supplying_output_or_skipping_later_cases(self):
        response = self.run_candidate(bad_batch=2, defect='native-error')
        self.assertEqual([len(b) for b in self.batches], [4, 4, 4])
        self.assertEqual([r['status'] for r in response['results']], ['ok'] * 4 + ['error'] + ['ok'] * 7)
        self.assertNotIn('output', response['results'][4])
        self.assertEqual(response['results'][4]['reason'], 'native guard failed')

    def test_runtime_mutation_in_each_batch_fails_closed_before_another_worker(self):
        for batch, defect in [(1, 'javascript'), (2, 'wasm'), (3, 'javascript')]:
            with self.subTest(batch=batch, defect=defect):
                self.setUp()
                with self.assertRaisesRegex(ProtocolError, 'runtime changed'): self.run_candidate(bad_batch=batch, defect=defect)
                self.assertEqual(len(self.workers), batch)
                self.assertEqual(self.output.getvalue(), '')

    def test_nonzero_exit_in_later_batch_cannot_be_hidden_by_prior_success(self):
        with self.assertRaisesRegex(ProtocolError, 'worker failed'): self.run_candidate(bad_batch=2, defect='exit')
        self.assertEqual(len(self.workers), 2); self.assertEqual(self.output.getvalue(), '')

    def test_request_bound_remains_twelve_supported_cases(self):
        cases = deepcopy(self.cases); cases.append(dict(cases[-1], id='extra'))
        with self.assertRaises(ProtocolError): self.run_candidate(cases)
        self.assertEqual(self.workers, [])


if __name__ == '__main__': unittest.main()
