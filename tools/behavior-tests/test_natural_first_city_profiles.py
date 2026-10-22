"""Archived-profile schema and honest complete/diagnostic replay separation."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import compare
from protocol import ProtocolError, probe_request, validate_response
from ui import natural_first_city_contract as base
from ui import natural_first_city_profiles_contract as contract
from ui import natural_first_city_profiles_headless as candidate

DIRECTORY = Path(__file__).resolve().parent / 'ui/reference-archives'


def suite(name):
    return json.loads((DIRECTORY / name / 'cases.json').read_text())


def factions():
    return suite('natural-first-city-factions-v6')['cases']


def sources():
    return suite('natural-first-city-source-controls-v7')['cases']


def native_rows(cases):
    return [{'id': case['id'], 'status': 'ok', 'output': {
        'base': {'population': 1, 'workers': 0, 'specialists': 1, 'worked_tiles': 0,
                 'raw_nutrients': 0, 'raw_minerals': 0}, 'human_base_count': 1, 'year_delta': 0}}
        for case in cases]


class ArchivedFirstCityTests(unittest.TestCase):
    def test_archives_are_immutable_and_complete_without_reading_original_adapters(self):
        for name, digest in [
            ('natural-first-city-factions-v6', 'df68df635ae7a2270ea34e03ed845604fd2140507def9642d7bd23e5f1a29970'),
            ('natural-first-city-source-controls-v7', 'a821f99cde710e56e480f8c3cfcaa541f43950db6397c9251f5b3eab4591f687'),
        ]:
            path = DIRECTORY / name / 'observations.json'
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), digest)
            evidence = json.loads(path.read_text())
            compare.validate_observations(evidence, suite(name))
            for row in evidence['observations']:
                contract.validate_output(row['output'], suite(name)['cases'][0]['algorithm'])

    def test_separate_contract_accepts_only_exact_archived_inputs(self):
        for case in factions() + sources():
            contract.validate_input(case['input'], case['algorithm'])
        case = sources()[1]
        for updates in ({'population': 1}, {'raw_minerals': 13}, {'difficulty': 'TALENT'},
                        {'faction': 'UNIV'}, {'text_profile': 'univ-ecology'},
                        {'world_width': 40.0}, {'terrain': 'flat-moist'}):
            with self.subTest(updates=updates), self.assertRaises(ProtocolError):
                contract.validate_input(dict(case['input'], **updates), case['algorithm'])
        changed = deepcopy(case['input']); changed['preferences']['tutorials'] = 0
        with self.assertRaises(ProtocolError):
            contract.validate_input(changed, case['algorithm'])
        # The old six-difficulty Gaian validator is deliberately unchanged.
        with self.assertRaises(ProtocolError):
            base.validate_input(factions()[1]['input'])

    def test_stock_factions_are_complete_results_and_still_strict_red(self):
        cases = factions()
        with patch.object(candidate.runner, 'headless', return_value=({'name': 'native', 'kind': 'candidate', 'mocked': ['terrain', 'source']}, native_rows(cases))) as run:
            metadata, rows = candidate.replay(cases, Path('/unused/GLSMAC.js'), '/pinned/node')
        self.assertEqual(run.call_args.args, (cases, Path('/unused/GLSMAC.js'), '/pinned/node'))
        self.assertEqual(run.call_args.kwargs['source_prelude'], candidate.SOURCE_PRELUDE)
        self.assertEqual(metadata['source_startup_diagnostics'], [])
        record = json.loads((DIRECTORY / 'natural-first-city-factions-v6/observations.json').read_text())
        report = compare.compare(suite('natural-first-city-factions-v6'), record,
                                 {'version': 1, 'implementation': metadata, 'results': rows})
        self.assertEqual(report['summary'], {'matched': 0, 'mismatched': 7, 'unsupported': 0, 'errors': 0})
        self.assertTrue(all([delta['path'] for delta in row['differences']] == ['$["base"]["raw_minerals"]'] for row in report['results']))

    def test_sources_execute_four_native_diagnostics_but_all_strict_results_are_unsupported(self):
        cases = sources(); executable = cases[:4]
        with patch.object(candidate.runner, 'headless', return_value=({'name': 'native', 'kind': 'candidate', 'mocked': ['terrain', 'source']}, native_rows(executable))) as run:
            metadata, rows = candidate.replay(cases, Path('/unused/GLSMAC.js'))
        self.assertEqual(run.call_args.args[0], executable)
        self.assertEqual(metadata['source_startup_diagnostics'], native_rows(executable))
        self.assertFalse(metadata['diagnostics_are_complete_comparisons'])
        self.assertTrue(all(row['status'] == 'unsupported' and 'map_kind' in row['reason'] for row in rows))
        self.assertTrue(all('nonzero raw UNITS cost' in row['reason'] for row in rows[-2:]))
        response = {'version': 1, 'implementation': metadata, 'results': rows}
        validate_response(response, probe_request(suite('natural-first-city-source-controls-v7')))
        record = json.loads((DIRECTORY / 'natural-first-city-source-controls-v7/observations.json').read_text())
        self.assertEqual(compare.compare(suite('natural-first-city-source-controls-v7'), record, response)['summary'],
                         {'matched': 0, 'mismatched': 0, 'unsupported': 6, 'errors': 0})

    def test_unsupported_cost_and_unknown_contract_never_execute_runtime(self):
        cases = sources()[-2:] + [dict(factions()[0], id='unknown', algorithm='unknown.v1')]
        with patch.object(candidate.runner, 'headless') as run:
            metadata, rows = candidate.replay(cases, Path('/missing/GLSMAC.js'))
        run.assert_not_called()
        self.assertEqual(metadata['source_startup_diagnostics'], [])
        self.assertTrue(all(row['status'] == 'unsupported' for row in rows))

    def test_mixed_replay_preserves_order_and_never_substitutes_expected_outputs(self):
        cases = [sources()[1], factions()[1], sources()[-1], factions()[0]]
        executable = [cases[0], cases[1], cases[3]]
        with patch.object(candidate.runner, 'headless', return_value=({'name': 'native', 'kind': 'candidate', 'mocked': ['terrain', 'source']}, native_rows(executable))):
            metadata, rows = candidate.replay(cases, Path('/unused/GLSMAC.js'))
        self.assertEqual([row['id'] for row in rows], [case['id'] for case in cases])
        self.assertEqual([row['status'] for row in rows], ['unsupported', 'ok', 'unsupported', 'ok'])
        self.assertEqual(rows[1]['output']['base']['raw_minerals'], 0)
        self.assertNotIn('map_kind', metadata['source_startup_diagnostics'][0]['output'])

    def test_source_scalar_cannot_be_omitted_coerced_or_invented_by_output_validator(self):
        value = json.loads((DIRECTORY / 'natural-first-city-source-controls-v7/observations.json').read_text())['observations'][0]['output']
        for changed in ({key: item for key, item in value.items() if key != 'map_kind'},
                        dict(value, map_kind=True), dict(value, map_kind=2.0), dict(value, map_kind=2**31)):
            with self.assertRaises(ProtocolError):
                contract.validate_output(changed, contract.SOURCES_ALGORITHM)


if __name__ == '__main__':
    unittest.main()
