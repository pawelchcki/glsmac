import copy
import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

import compare
from protocol import ProtocolError
from ui import starvation_mineral_contract as contract
from ui import starvation_mineral_original as original
from ui.starvation_mineral_original import fingerprint
from ui.starvation_mineral_headless import parse_candidate
from ui.vision import VisionError

DIRECTORY = Path(__file__).parent / 'ui'


class MineralContractTests(unittest.TestCase):
    def input(self, mode='starvation'):
        return dict(mode=mode, initial_base=dict(contract.INITIAL), project='incomplete-Formers')

    def output(self, mode='starvation'):
        roles = ['scout', 'former'] if mode == 'starvation' else ['scout', 'former', 'colony']
        stages = ['before-turn', 'notice', 'after-turn'] if mode == 'starvation' else ['before-turn', 'after-turn']
        # Arbitrary synthetic stores test schema, never supply original answers.
        return dict(trace=[dict(stage=stage, year_delta=0 if index == 0 else 1,
                                population=1, workers=0, doctors=1, worked_tiles=0, minerals=37 + index,
                                units=[dict(role=role, order_code=2, movement_spent=0) for role in roles])
                           for index, stage in enumerate(stages)])

    def test_declared_inputs_cover_both_fresh_contexts(self):
        cases = json.loads((DIRECTORY / 'cases/starvation-mineral.json').read_text())['cases']
        self.assertEqual({row['input']['mode'] for row in cases}, set(contract.MODES))
        self.assertEqual(len(cases), 2)
        for row in cases:
            self.assertEqual(row['algorithm'], contract.ALGORITHM)
            contract.validate_input(row['input'])

    def test_unknown_or_extra_inputs_rejected(self):
        for key, value in [('mode', 'later'), ('project', 'completed-Formers'), ('extra', 1)]:
            data = self.input(); data[key] = value
            with self.subTest(key=key), self.assertRaises(ProtocolError): contract.validate_input(data)

    def test_initial_stores_are_exact_integer_inputs(self):
        for key in contract.INITIAL:
            for value in (True, None, '0', 999):
                data = self.input(); data['initial_base'][key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ProtocolError): contract.validate_input(data)

    def test_schema_accepts_actual_integer_stores_without_inventing_an_answer(self):
        for mode in contract.MODES: contract.validate_output(self.output(mode), mode)

    def test_missing_duplicate_or_reordered_stages_rejected(self):
        original = self.output()
        for trace in (original['trace'][:-1], original['trace'] + [original['trace'][-1]], list(reversed(original['trace']))):
            with self.assertRaises(ProtocolError): contract.validate_output(dict(trace=trace), 'starvation')

    def test_no_partial_or_extra_observation_fields(self):
        for mutation in ('extra', 'missing', 'wrapper'):
            data = self.output()
            if mutation == 'extra': data['trace'][0]['nutrients'] = 0
            elif mutation == 'missing': del data['trace'][0]['minerals']
            else: data['cached'] = True
            with self.subTest(mutation=mutation), self.assertRaises(ProtocolError): contract.validate_output(data, 'starvation')

    def test_noninteger_or_negative_native_fields_rejected(self):
        for key in ('year_delta', 'population', 'workers', 'doctors', 'worked_tiles', 'minerals'):
            for value in (True, -1, '9', 1.5, None):
                data = self.output(); data['trace'][0][key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ProtocolError): contract.validate_output(data, 'starvation')

    def test_year_and_citizen_context_must_be_consistent(self):
        for key, value in [('year_delta', 1), ('population', 8), ('workers', 1)]:
            data = self.output(); data['trace'][0][key] = value
            with self.subTest(key=key), self.assertRaises(ProtocolError): contract.validate_output(data, 'starvation')

    def test_companion_schema_and_order_are_complete(self):
        for mutation in ('missing', 'reorder', 'extra', 'boolean', 'negative'):
            data = self.output(); units = data['trace'][0]['units']
            if mutation == 'missing': units.pop()
            elif mutation == 'reorder': units.reverse()
            elif mutation == 'extra': units[0]['expected'] = True
            elif mutation == 'boolean': units[0]['order_code'] = True
            else: units[0]['movement_spent'] = -1
            with self.subTest(mutation=mutation), self.assertRaises(ProtocolError): contract.validate_output(data, 'starvation')

    def test_original_evidence_is_repeated_and_bound_to_observer_and_inputs(self):
        cases = json.loads((DIRECTORY / 'cases/starvation-mineral.json').read_text())
        evidence = json.loads((DIRECTORY / 'observations/smacx-gog-2.0-starvation-mineral.json').read_text())
        compare.validate_observations(evidence, cases)
        self.assertGreaterEqual(evidence['repeat'], 2)
        self.assertEqual(evidence['reference']['adapter_sha256'], fingerprint())
        self.assertEqual(evidence['reference']['contract'], contract.ALGORITHM)
        modes = {row['id']: row['input']['mode'] for row in cases['cases']}
        for row in evidence['observations']:
            contract.validate_output(row['output'], modes[row['id']])

    def test_changed_initial_minerals_invalidate_recorded_input_binding(self):
        cases = json.loads((DIRECTORY / 'cases/starvation-mineral.json').read_text())
        evidence = json.loads((DIRECTORY / 'observations/smacx-gog-2.0-starvation-mineral.json').read_text())
        changed = copy.deepcopy(cases)
        changed['cases'][0]['input']['initial_base']['minerals'] += 1
        with self.assertRaises(ProtocolError): compare.validate_observations(evidence, changed)


class MineralTransportTests(unittest.TestCase):
    output = MineralContractTests.output
    def setUp(self):
        self.cases = json.loads((DIRECTORY / 'cases/starvation-mineral.json').read_text())['cases']

    def log(self):
        lines = []
        for case in self.cases:
            lines.append('MINERAL_CASE|' + case['id'])
            for row in self.output(case['input']['mode'])['trace']:
                keys = ('year_delta', 'population', 'workers', 'doctors', 'worked_tiles', 'minerals')
                lines.append('MINERAL_STATE|' + row['stage'] + '|' + '|'.join(str(row[key]) for key in keys))
                for unit in row['units']:
                    lines.append('MINERAL_UNIT|' + unit['role'] + '|' + str(unit['order_code']) + '|' + str(unit['movement_spent']))
                lines.append('MINERAL_STATE_DONE')
            lines.append('MINERAL_CASE_DONE')
        return '\n'.join(lines) + '\nAll tests passed.\n'

    def test_complete_native_transport_preserves_all_observations(self):
        rows = parse_candidate(self.log(), self.cases)
        self.assertEqual([row['id'] for row in rows], [case['id'] for case in self.cases])
        for row, case in zip(rows, self.cases, strict=True):
            self.assertEqual(row['output'], self.output(case['input']['mode']))

    def test_engine_success_without_actual_checkpoints_is_rejected(self):
        for log in ('', 'All tests passed.\n', 'MINERAL_CASE|' + self.cases[0]['id'] + '\nAll tests passed.\n'):
            with self.subTest(log=log), self.assertRaises(ProtocolError): parse_candidate(log, self.cases)

    def test_worker_failure_or_missing_success_cannot_be_a_match(self):
        for log in (self.log().replace('All tests passed.', ''), self.log() + 'TEST FAILED\n', self.log() + 'Unhandled exception\n'):
            with self.assertRaises(ProtocolError): parse_candidate(log, self.cases)

    def test_unknown_duplicate_or_orphan_native_markers_are_rejected(self):
        logs = [self.log().replace('MINERAL_STATE_DONE', 'MINERAL_GUESS', 1),
                'MINERAL_STATE_DONE\n' + self.log(),
                self.log().replace('MINERAL_CASE_DONE', 'MINERAL_CASE_DONE\nMINERAL_CASE_DONE', 1),
                self.log().replace(self.cases[1]['id'], self.cases[0]['id'])]
        for log in logs:
            with self.assertRaises(ProtocolError): parse_candidate(log, self.cases)

    def test_invalid_integer_or_unit_protocol_cannot_supply_partial_results(self):
        for before, after in [('MINERAL_STATE|before-turn|0', 'MINERAL_STATE|before-turn|-1'),
                              ('MINERAL_STATE|before-turn|0', 'MINERAL_STATE|before-turn|00'),
                              ('MINERAL_UNIT|scout|2|0', 'MINERAL_UNIT|scout|8|0'),
                              ('MINERAL_UNIT|scout|2|0', 'MINERAL_UNIT|scout|2|4')]:
            with self.subTest(after=after), self.assertRaises(ProtocolError): parse_candidate(self.log().replace(before, after, 1), self.cases)

    def test_real_context_failure_stays_an_error_without_manufactured_output(self):
        log = 'MINERAL_CASE|' + self.cases[0]['id'] + '\nMINERAL_ERROR|actual pending notice missing\nAll tests passed.\n'
        rows = parse_candidate(log, self.cases[:1])
        self.assertEqual(rows, [dict(id=self.cases[0]['id'], status='error', reason='actual pending notice missing')])


class OriginalSetupRecoveryTests(unittest.TestCase):
    def vision(self):
        vision = object.__new__(original.MineralVision)
        vision.Image = Mock()
        return vision

    def test_known_social_panel_requires_actual_map_before_preferences_retry(self):
        vision = self.vision(); vision.require_text = Mock(return_value=True)
        reader = Mock(side_effect=[VisionError('not preferences'), True, True])
        driver = Mock()
        with patch.object(original.base, 'raw_key') as key, patch.object(original.base, 'settled') as settled, patch.object(original.time, 'sleep'):
            self.assertTrue(vision.wait(driver, reader, Path('/synthetic/preferences.png'), 10))
        self.assertEqual([call.args[1] for call in key.call_args_list], ['Escape', 'ctrl+p'])
        settled.assert_called_once_with(driver, vision, Path('/synthetic/preferences-map-recovery.png'), 10, 1)
        self.assertEqual(vision.require_text.call_args.args[2], 'SOCIAL ENGINEERING')

    def test_unknown_setup_panel_cannot_trigger_keys_or_supply_an_answer(self):
        vision = self.vision(); vision.require_text = Mock(side_effect=VisionError('unknown panel'))
        with patch.object(original.base, 'raw_key') as key, patch.object(original.base, 'settled') as settled, patch.object(original.time, 'sleep'), patch.object(original.time, 'monotonic', side_effect=[0, 1, 2, 4]):
            with self.assertRaises(ProtocolError): vision.wait(Mock(), Mock(side_effect=VisionError('not preferences')), Path('/synthetic/preferences.png'), 3)
        key.assert_not_called(); settled.assert_not_called()

    def test_failed_actual_map_guard_cannot_reopen_preferences(self):
        vision = self.vision(); vision.require_text = Mock(return_value=True)
        with patch.object(original.base, 'raw_key') as key, patch.object(original.base, 'settled', side_effect=ProtocolError('map not ready')), patch.object(original.time, 'sleep'):
            with self.assertRaises(ProtocolError): vision.wait(Mock(), Mock(side_effect=VisionError('not preferences')), Path('/synthetic/preferences.png'), 10)
        self.assertEqual([call.args[1] for call in key.call_args_list], ['Escape'])


if __name__ == '__main__': unittest.main()
