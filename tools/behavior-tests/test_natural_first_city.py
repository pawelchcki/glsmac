"""Strict city-state transfer schema, replay boundaries and immutable evidence."""
from copy import deepcopy
from contextlib import redirect_stdout
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import compare
from protocol import ProtocolError
from ui import natural_first_city_contract as contract
from ui import natural_first_city_headless as candidate
from ui import run as ui_run

DIRECTORY = Path(__file__).resolve().parent / 'ui'


def suite():
    return json.loads((DIRECTORY / 'cases/natural-first-city.json').read_text())


def case():
    return suite()['cases'][0]


def markers(values='1|1|0|1|0|0|1|0', case_id=None):
    case_id = case_id or case()['id']
    return f'NATURAL_CASE|{case_id}\nNATURAL_CITY|{values}\nNATURAL_END\nAll tests passed.\n'


class NaturalFirstCityTests(unittest.TestCase):
    def test_profile_pending_dispatch_preserves_unsupported_results_and_immutable_inputs(self):
        requests = []

        def probe(command, request, timeout):
            self.assertIn('natural_first_city_profiles_headless.py', command)
            requests.append(request)
            return {'version': 1, 'implementation': {'name': 'dispatch-test', 'kind': 'candidate'},
                    'results': [{'id': row['id'], 'status': 'unsupported', 'reason': 'dispatch test only'}
                                for row in request['cases']]}

        with tempfile.TemporaryDirectory() as temporary, redirect_stdout(io.StringIO()), \
                patch.object(compare, 'run_probe', side_effect=probe):
            report = Path(temporary) / 'pending.json'
            self.assertEqual(ui_run.main(['--pending', '--lane', 'hot',
                                         '--suite', 'natural-first-city-factions-v6',
                                         '--suite', 'natural-first-city-source-controls-v7',
                                         '--report', str(report)]), 1)
            result = json.loads(report.read_text())
        self.assertTrue(result['pending_transfer'])
        self.assertEqual(result['summary'], {'reference_cases': 13, 'candidate_executed': True,
                                            'matched': 0, 'mismatched': 0, 'unsupported': 13, 'errors': 0})
        for request, name in zip(requests, ('natural-first-city-factions-v6', 'natural-first-city-source-controls-v7')):
            self.assertEqual(request['cases'], json.loads((DIRECTORY / 'cases' / (name + '.json')).read_text())['cases'])

    def test_preserved_research_evidence_never_enters_passing_catalog(self):
        references = [row['id'] for name in ('catalog.json',)
                      for row in json.loads((DIRECTORY / name).read_text())['references']]
        for name, count, gold_hash, source_hash in [
                ('natural-first-city-factions-v6', 7,
                 'df68df635ae7a2270ea34e03ed845604fd2140507def9642d7bd23e5f1a29970',
                 '362b6156c811a79a7bbda59ea460759f637b0a4b5a230c591acd4587491b7b09'),
                ('natural-first-city-source-controls-v7', 6,
                 'a821f99cde710e56e480f8c3cfcaa541f43950db6397c9251f5b3eab4591f687',
                 '08f1cf7befc807e82ced754a02b187c24d5d0609e75843133da77442188e3095')]:
            with self.subTest(archive=name):
                archive = DIRECTORY / 'reference-archives' / name
                recorded = json.loads((archive / 'observations.json').read_text())
                inputs = json.loads((archive / 'cases.json').read_text())
                self.assertEqual(hashlib.sha256((archive / 'observations.json').read_bytes()).hexdigest(), gold_hash)
                self.assertEqual(hashlib.sha256((archive / 'original.py').read_bytes()).hexdigest(), source_hash)
                compare.validate_observations(recorded, inputs)
                self.assertEqual(len(recorded['observations']), count)
                self.assertEqual(recorded['reference']['kind'], 'original-executable')
                self.assertNotIn(name, references)
                self.assertEqual((DIRECTORY / 'cases' / (name + '.json')).read_bytes(),
                                 (archive / 'cases.json').read_bytes())
                self.assertEqual((DIRECTORY / 'observations' / ('smacx-gog-2.0-' + name + '.json')).read_bytes(),
                                 (archive / 'observations.json').read_bytes())
                pending = json.loads((DIRECTORY / 'pending-catalog.json').read_text())['references']
                self.assertIn(name, {row['id'] for row in pending})

    def test_exact_input_excludes_observed_city_overrides_and_unaccepted_terrain(self):
        value = case()['input']
        for declared in suite()['cases']:
            contract.validate_input(declared['input'])
        invalid = [None, {}, dict(value, population=1), dict(value, raw_minerals=9),
                   dict(value, world_width=40.0), dict(value, terrain='flat-moist'),
                   dict(value, terrain='flat-rainy'), dict(value, text_profile='edited'), dict(value, difficulty='UNKNOWN'), dict(value, difficulty='citizen')]
        for key in ('pause_at_end', 'tutorials'):
            changed = deepcopy(value)
            changed['preferences'][key] = int(changed['preferences'][key])
            invalid.append(changed)
        for item in invalid:
            with self.subTest(item=item), self.assertRaises(ProtocolError):
                contract.validate_input(item)

    def test_actual_observed_values_are_preserved_including_signed_raw_stores_and_year(self):
        row = contract.parse_candidate(markers('2|1|1|1|-3|17|2|4'), case())
        self.assertEqual(row['output'], {'base': {'population': 2, 'workers': 1, 'specialists': 1,
                         'worked_tiles': 1, 'raw_nutrients': -3, 'raw_minerals': 17},
                         'human_base_count': 2, 'year_delta': 4})
        self.assertEqual(contract.parse_candidate(markers(), case())['output']['base']['workers'], 1)

    def test_parser_rejects_failed_partial_duplicate_and_reordered_observation(self):
        text = markers()
        invalid = [text.replace('All tests passed.', ''), text.replace('NATURAL_END\n', ''),
                   text + 'NATURAL_END\n', text.replace('NATURAL_CITY', 'NATURAL_UNKNOWN'),
                   text.replace('NATURAL_CITY|1', 'NATURAL_CITY|01'),
                   text.replace(case()['id'], 'wrong-case'), text + 'TEST FAILED',
                   text + 'Event rejected: test', text + 'Event result listener failed: test',
                   text + 'Unhandled exception', markers('1|1|0|1|0|0|1|false'),
                   markers('1|1|0|1|0|0|1'),
                   text.replace('NATURAL_END', 'NATURAL_CITY|1|1|0|1|0|0|1|0\nNATURAL_END')]
        for item in invalid:
            with self.subTest(item=item), self.assertRaises(ProtocolError):
                contract.parse_candidate(item, case())

    def test_output_requires_integer_values_and_actual_population_membership(self):
        value = contract.parse_candidate(markers(), case())['output']
        invalid = [dict(value, extra=0), dict(value, human_base_count=True), dict(value, year_delta=0.0)]
        for field, item in [('population', 2), ('worked_tiles', 2), ('raw_nutrients', False),
                            ('raw_minerals', 2**31), ('specialists', -1)]:
            changed = deepcopy(value)
            changed['base'][field] = item
            invalid.append(changed)
        for item in invalid:
            with self.subTest(item=item), self.assertRaises(ProtocolError):
                contract.validate_output(item)

    def test_adapter_sends_only_inputs_and_rejects_runtime_mutation(self):
        with tempfile.TemporaryDirectory() as temporary:
            runtime = Path(temporary) / 'GLSMAC.js'
            runtime.write_text('candidate loader')
            runtime.with_suffix('.wasm').write_text('candidate WASM')

            def execute(argv, **kwargs):
                request = json.loads(kwargs['input'])
                source = json.loads(Path(request['snapshot']).read_text())[request['script']]
                self.assertIn('const city_input = ', source)
                self.assertIn('pause_at_end:true', source)
                self.assertNotIn('raw_minerals:9', source)
                self.assertEqual(argv[0], '/pinned/node')
                return SimpleNamespace(returncode=0, stdout=markers(), stderr='')

            with patch.object(candidate, 'create_snapshot', return_value={}), patch.object(candidate.subprocess, 'run', side_effect=execute):
                metadata, rows = candidate.headless([case()], runtime, '/pinned/node')
            self.assertEqual(rows[0]['output']['base']['raw_minerals'], 0)
            self.assertEqual(metadata['runtime_sha256'], hashlib.sha256(runtime.with_suffix('.wasm').read_bytes()).hexdigest())
            self.assertIn('pre-world lifecycle', ' '.join(metadata['mocked']))

            def mutate(argv, **kwargs):
                runtime.write_text('mutated loader')
                return execute(argv, **kwargs)

            with patch.object(candidate, 'create_snapshot', return_value={}), patch.object(candidate.subprocess, 'run', side_effect=mutate):
                with self.assertRaisesRegex(ProtocolError, 'runtime changed'):
                    candidate.headless([case()], runtime, '/pinned/node')

    def test_cli_uses_standard_headless_runtime_environment(self):
        with tempfile.TemporaryDirectory() as temporary:
            selected = Path(temporary) / 'headless'
            unrelated = Path(temporary) / 'other'
            with patch.dict(os.environ, {'WASM_HEADLESS_APP_DIR': str(selected), 'WASM_APP_DIR': str(unrelated)}), \
                    patch('sys.argv', ['natural_first_city_headless.py']), \
                    patch.object(candidate, 'load_request', return_value={'cases': [case()]}), \
                    patch.object(candidate, 'headless', return_value=({'name': 'test', 'kind': 'candidate'},
                                      [contract.parse_candidate(markers(), case())])) as execute, \
                    patch.object(candidate, 'write_response'):
                candidate.main()
            self.assertEqual(execute.call_args.args[1], (selected / 'GLSMAC.js').resolve())

    def test_unknown_algorithm_never_opens_or_executes_runtime(self):
        with patch('sys.argv', ['natural_first_city_headless.py']), \
                patch.object(candidate, 'load_request', return_value={'cases': [dict(case(), algorithm='unknown.v1')]}), \
                patch.object(candidate, 'headless') as execute, patch.object(candidate, 'write_response') as write:
            candidate.main()
        execute.assert_not_called()
        self.assertEqual(write.call_args.args[1][0]['status'], 'unsupported')

    def test_exact_repeated_gold_is_pending_and_honest_worker_baseline_stays_red(self):
        path = DIRECTORY / 'observations/smacx-gog-2.0-natural-first-city.json'
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),
                         'bacee299f955022230ce4fc7636e69e7234b75976ed3f357e79c5fc0232c01dd')
        evidence = json.loads(path.read_text())
        compare.validate_observations(evidence, suite())
        pending = json.loads((DIRECTORY / 'pending-catalog.json').read_text())['references']
        passing = json.loads((DIRECTORY / 'catalog.json').read_text())['references']
        self.assertIn('natural-first-city', {row['id'] for row in pending})
        self.assertNotIn('natural-first-city', {row['id'] for row in passing})
        result = {'version': 1, 'implementation': {'name': 'schema-test', 'kind': 'candidate'},
                  'results': [contract.parse_candidate(markers(case_id=row['id']), row) for row in suite()['cases']]}
        report = compare.compare(suite(), evidence, result)
        self.assertEqual(report['summary'], {'matched': 0, 'mismatched': 6, 'unsupported': 0, 'errors': 0})
        self.assertEqual({row['input']['difficulty'] for row in suite()['cases']}, set(contract.DIFFICULTIES))
        self.assertEqual(evidence['observations'][0]['case_sha256'], '6c5bdcb762f6506d39beeec16eb51482a2ba7ec5dd26d75c9f0059d463bd13b4')
        self.assertTrue(all(len(row['differences']) == 4 for row in report['results']))
        result['results'] = [contract.parse_candidate(markers('1|0|1|0|0|0|1|0', row['id']), row) for row in suite()['cases']]
        remaining = compare.compare(suite(), evidence, result)
        self.assertEqual(remaining['summary']['mismatched'], 6)
        self.assertTrue(all(len(row['differences']) == 1 and row['differences'][0]['path'] == '$["base"]["raw_minerals"]'
                            for row in remaining['results']))


if __name__ == '__main__':
    unittest.main()
