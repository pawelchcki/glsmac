"""Notice-control schema, strict transport and immutable evidence checks."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

import compare
from protocol import ProtocolError
import test_starvation_dialog as dialog_tests
from ui import starvation_notice_controls_contract as contract
from ui.starvation_notice_controls_headless import parse_candidate
from ui.starvation_notice_controls_original import fingerprint

DIRECTORY = Path(__file__).parent / 'ui'


class NoticeControlsTests(unittest.TestCase):
    def cases(self):
        return json.loads((DIRECTORY / 'cases/starvation-notice-controls.json').read_text())['cases']

    def synthetic_output(self, actions):
        # Arbitrary valid context for schema/transport only; never original answers.
        state = dict(after_action=-1, year_delta=1, screen='map', dialog=None,
                     base=dict(population=3, workers=2, doctors=1, worked_tiles=1, owned_count=1),
                     units=[dict(role=role, order_code=1, movement_spent=2) for role in ('scout', 'former')])
        return dict(trace=[dict(deepcopy(state), after_action=index - 1) for index in range(len(actions) + 1)])

    def encoded(self, case, output):
        return dialog_tests.StarvationContractTests.encoded_case(case, output)

    def test_four_exact_input_sequences(self):
        cases = self.cases()
        self.assertEqual(len(cases), 4)
        self.assertEqual([case['input']['actions'] for case in cases], list(contract.SEQUENCES))
        for case in cases:
            self.assertEqual(case['algorithm'], contract.ALGORITHM)
            contract.validate_input(case['input'])

    def test_undeclared_sequences_and_sources_rejected(self):
        for key, value in [('actions', ['confirm']), ('actions', ['ctrl-escape']), ('actions', []),
                           ('text_profile', 'common'), ('profile', 'spread'), ('extra', True)]:
            data = deepcopy(self.cases()[0]['input']); data[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ProtocolError): contract.validate_input(data)

    def test_exact_initial_integer_state_required(self):
        for key in contract.wording.INITIAL:
            for value in (True, None, '0', 999):
                data = deepcopy(self.cases()[0]['input']); data['initial_base'][key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ProtocolError): contract.validate_input(data)

    def test_schema_and_transport_preserve_arbitrary_valid_results(self):
        for case in self.cases():
            output = self.synthetic_output(case['input']['actions'])
            contract.validate_output(output, case['input']['actions'])
            self.assertEqual(parse_candidate(self.encoded(case, output), [case]),
                             [dict(id=case['id'], status='ok', output=output)])

    def test_all_native_context_fields_are_required(self):
        case = self.cases()[0]
        for key in ('population', 'workers', 'doctors', 'worked_tiles', 'owned_count'):
            output = self.synthetic_output(case['input']['actions']); del output['trace'][0]['base'][key]
            with self.subTest(key=key), self.assertRaises(ProtocolError): contract.validate_output(output, case['input']['actions'])

    def test_inconsistent_year_owner_citizens_and_tiles_rejected(self):
        case = self.cases()[0]
        for key, value in [('year_delta', 0), ('owned_count', 2), ('population', 1), ('worked_tiles', 3)]:
            output = self.synthetic_output(case['input']['actions']); row = output['trace'][0]
            (row if key == 'year_delta' else row['base'])[key] = value
            with self.subTest(key=key), self.assertRaises(ProtocolError): contract.validate_output(output, case['input']['actions'])

    def test_missing_duplicate_reordered_checkpoints_rejected(self):
        case = self.cases()[1]; output = self.synthetic_output(case['input']['actions'])
        for trace in (output['trace'][:-1], output['trace'] + [output['trace'][-1]], list(reversed(output['trace']))):
            with self.assertRaises(ProtocolError): contract.validate_output(dict(trace=trace), case['input']['actions'])

    def test_hidden_dialog_cannot_be_reported_on_map(self):
        case = self.cases()[0]; output = self.synthetic_output(case['input']['actions'])
        output['trace'][0]['dialog'] = dict(caption='arbitrary')
        with self.assertRaises(ProtocolError): contract.validate_output(output, case['input']['actions'])

    def test_actual_context_failure_stays_error(self):
        case = self.cases()[0]
        log = 'STARVE_CASE|' + case['id'] + '\nSTARVE_ERROR|native turn pending receipt missing\nAll tests passed.\n'
        self.assertEqual(parse_candidate(log, [case]), [dict(id=case['id'], status='error', reason='native turn pending receipt missing')])

    def test_engine_success_without_observations_rejected(self):
        case = self.cases()[0]
        for log in ('', 'All tests passed.\n', 'STARVE_CASE|' + case['id'] + '\nAll tests passed.\n'):
            with self.assertRaises(ProtocolError): parse_candidate(log, [case])

    def test_failed_engine_cannot_supply_match(self):
        case = self.cases()[0]; log = self.encoded(case, self.synthetic_output(case['input']['actions']))
        for bad in (log.replace('All tests passed.', ''), log + 'TEST FAILED\n', log + 'Unhandled exception\n'):
            with self.assertRaises(ProtocolError): parse_candidate(bad, [case])

    def test_orphan_unknown_duplicate_and_missing_markers_rejected(self):
        case = self.cases()[0]; log = self.encoded(case, self.synthetic_output(case['input']['actions']))
        samples = ['STARVE_STATE_DONE\n' + log, log.replace('STARVE_BASE', 'STARVE_GUESS', 1),
                   log.replace('STARVE_STATE_DONE\n', '', 1),
                   log.replace('STARVE_UNIT|former|1|2\n', '', 1),
                   log.replace('STARVE_CASE_DONE', 'STARVE_CASE_DONE\nSTARVE_CASE_DONE', 1)]
        for bad in samples:
            with self.assertRaises(ProtocolError): parse_candidate(bad, [case])

    def test_repeated_reference_is_bound_to_current_observer_and_inputs(self):
        cases = json.loads((DIRECTORY / 'cases/starvation-notice-controls.json').read_text())
        evidence = json.loads((DIRECTORY / 'observations/smacx-gog-2.0-starvation-notice-controls.json').read_text())
        compare.validate_observations(evidence, cases)
        self.assertGreaterEqual(evidence['repeat'], 2)
        self.assertEqual(evidence['reference']['adapter_sha256'], fingerprint())
        self.assertEqual(evidence['reference']['contract'], contract.ALGORITHM)
        for case, row in zip(cases['cases'], evidence['observations'], strict=True):
            contract.validate_output(row['output'], case['input']['actions'])
            self.assertEqual(parse_candidate(self.encoded(case, row['output']), [case])[0]['output'], row['output'])
        changed = deepcopy(cases); changed['cases'][0]['input']['actions'] = ['suppress']
        with self.assertRaises(ProtocolError): compare.validate_observations(evidence, changed)


if __name__ == '__main__': unittest.main()
