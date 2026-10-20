"""Recorder input/shape guards. Synthetic fixtures contain no work answers."""
import json
from itertools import repeat
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import Mock, patch

from protocol import ProtocolError
from compare import validate_observations
from ui.former_work_contract import ALGORITHM, RATE_PROFILES, RATE_ROWS, validate_input, validate_output
from ui.former_work_sources import arid_map, block_rows, free_former, profiles, work_rates
from ui.generate_former_work import suite
from ui import former_work_original as recorder


class FormerWorkContractTests(unittest.TestCase):
    def test_public_inputs_are_reproducible_unique_and_bounded(self):
        declared = suite()
        self.assertEqual(declared, json.loads((Path(__file__).parent / 'ui/cases/former-work.json').read_text()))
        self.assertEqual(len(declared['cases']), len({case['id'] for case in declared['cases']}))
        self.assertEqual({case['input']['profile'] for case in declared['cases']}, set(RATE_PROFILES))
        for case in declared['cases']:
            self.assertEqual(case['algorithm'], ALGORITHM)
            validate_input(case['input'])
        core = json.loads((Path(__file__).parent / 'ui/cases/former-work-core.json').read_text())
        self.assertEqual(core['cases'], [case for case in declared['cases'] if case['id'] in
                                        ('former-mine-source', 'former-farm-cancel-resume')])

    def test_invalid_inputs_fail_closed(self):
        for value in (None, [], {}, {'profile': 'normal', 'actions': 'farm'},
                      {'profile': 'unknown', 'actions': []}, {'profile': [], 'actions': []},
                      {'profile': 'normal', 'actions': ['farm'] * 13},
                      {'profile': 'normal', 'actions': ['advance'] * 9},
                      {'profile': 'normal', 'actions': ['teleport']},
                      {'profile': 'normal', 'actions': [{}]},
                      {'profile': 'normal', 'actions': [], 'answer': 2}):
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                validate_input(value)

    def test_frozen_core_evidence_matches_inputs_and_requires_independent_repetition(self):
        directory = Path(__file__).parent / 'ui'
        inputs = json.loads((directory / 'cases/former-work-core.json').read_text())
        recorded = json.loads((directory / 'observations/smacx-gog-2.0-former-work-core.json').read_text())
        validate_observations(recorded, inputs)
        self.assertGreaterEqual(recorded['repeat'], 2)
        for case, observation in zip(inputs['cases'], recorded['observations'], strict=True):
            self.assertEqual(case['id'], observation['id'])
            validate_output(observation['output'], case['input']['actions'])

    @staticmethod
    def output():
        # Arbitrary shape witness, not a claimed result of any original action.
        return {'trace': [{'year_delta': 0, 'order': 'none', 'movement_spent': 0, 'work_units': 0,
                           'terrain': dict.fromkeys(('road', 'farm', 'mine', 'forest'), False)}]}

    def test_output_requires_complete_trace_and_all_four_boolean_flags(self):
        validate_output(self.output(), [])
        invalid = [None, {}, {'trace': []}, {'trace': [None]}, self.output() | {'extra': True}]
        for field in self.output()['trace'][0]:
            value = self.output(); del value['trace'][0][field]; invalid.append(value)
        for flags in ({}, {'road': False}, dict.fromkeys(('road', 'farm', 'mine', 'forest'), 0)):
            value = self.output(); value['trace'][0]['terrain'] = flags; invalid.append(value)
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                validate_output(value, [])
        with self.assertRaises(ProtocolError):
            validate_output(self.output(), ['farm'])

    def test_output_rejects_coercions_unknown_orders_and_out_of_range_scalars(self):
        for field, invalid in (('year_delta', -1), ('year_delta', 9), ('movement_spent', 4),
                               ('movement_spent', True), ('work_units', 129), ('work_units', 2.0),
                               ('order', 'guessed'), ('order', None)):
            value = self.output(); value['trace'][0][field] = invalid
            with self.subTest(field=field, invalid=invalid), self.assertRaises(ProtocolError):
                validate_output(value, [])


class FormerWorkSourceTests(unittest.TestCase):
    @staticmethod
    def rules():
        return ('; synthetic input only\r\n#TERRAIN\r\n' + ''.join(
            f'Action{row},None,Sea,None,8,Build $STR0,x,X ; row {row}\r\n' for row in range(6))
            + '#END\r\n').encode('latin1')

    def test_normal_source_is_byte_identical_and_edited_rates_change_only_declared_fields(self):
        original = self.rules()
        self.assertEqual(work_rates(original, 'normal'), original)
        before, indices = block_rows(original, 'TERRAIN')
        after, _ = block_rows(work_rates(original, 'edited'), 'TERRAIN')
        for line in range(len(before)):
            matching = [name for name, row in RATE_ROWS.items() if indices[row] == line]
            if not matching:
                self.assertEqual(after[line], before[line]); continue
            fields = before[line].split(','); fields[4] = ' ' + str(RATE_PROFILES['edited'][matching[0]])
            self.assertEqual(after[line], ','.join(fields))

    def test_free_former_changes_only_the_declared_bonus_record(self):
        original = b'#GAIANS\r\nSynthetic header\r\nTECH,Ecology,SOCIAL,+GROWTH ; preserved\r\n#END\r\n'
        edited = free_former(original)
        self.assertEqual(edited, original.replace(b' ; preserved', b', UNIT, 1 ; preserved'))
        with self.assertRaises(ProtocolError):
            free_former(edited)

    def test_ambiguous_or_missing_source_blocks_reject(self):
        for raw in (b'', b'#TERRAIN\n#END\n', self.rules() + self.rules()):
            with self.subTest(raw=raw), self.assertRaises(ProtocolError):
                work_rates(raw, 'edited')
        with self.assertRaises(ProtocolError):
            free_former(b'#GAIANS\nHeader\nTECH\n#END\n')

    def test_source_bundle_preserves_filenames_and_never_writes_the_supplied_installation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'AlphaX.txt').write_bytes(self.rules())
            (root / 'Gaians.txt').write_bytes(b'#GAIANS\nHeader\nTECH,Ecology\n#END\n')
            before = {path.name: path.read_bytes() for path in root.iterdir()}
            bundle = profiles(root)
            self.assertEqual({path.name: path.read_bytes() for path in root.iterdir()}, before)
            for profile in RATE_PROFILES:
                self.assertEqual(set(bundle[profile]), set(before))
                self.assertIn(b'UNIT, 1', bundle[profile]['Gaians.txt'])

    def test_map_is_a_synthetic_empty_flat_land_input_with_declared_dimensions(self):
        raw = arid_map(); offset = 15 + 0xaa4
        self.assertEqual(raw[:11], b'TERRANMAP\0\x1a')
        self.assertEqual(struct.unpack_from('<I', raw, 11)[0], 5)
        self.assertEqual(struct.unpack_from('<II', raw, 15), (40, 80))
        for index in range(40 * 80 // 2):
            tile = raw[offset + index * 44:offset + (index + 1) * 44]
            self.assertEqual((tile[0], tile[1], tile[4]), (96, 64, 255))
            self.assertEqual(struct.unpack_from('<I', tile, 8)[0], 0)


class FormerWorkRecorderSynchronizationTests(unittest.TestCase):
    # Symbolic native checkpoints test recorder safety, never game work rules.
    @staticmethod
    def checkpoint(turn):
        return {'turn': turn, 'order': 'none', 'movement_spent': 0}

    def run_settle(self, driver, states, interruptions, timeout=10):
        now = [0.0]
        vision = Mock()
        vision.require_text.side_effect = recorder.VisionError('No recognized confirmation dialog')
        def sleep(duration):
            now[0] += duration
        with patch.object(recorder.time, 'monotonic', side_effect=lambda: now[0]), \
                patch.object(recorder.time, 'sleep', side_effect=sleep), \
                patch.object(recorder, 'native', side_effect=states), \
                patch.object(recorder, 'dismiss_research', side_effect=interruptions):
            return recorder.settled(driver, vision, Path('/unused-recorder-checkpoint.png'), timeout,
                                    turn=4, advance=True)

    def test_resumed_pending_advance_does_not_receive_a_second_click(self):
        driver = Mock()
        actual = self.run_settle(driver, [self.checkpoint(3), self.checkpoint(4), self.checkpoint(4)],
                                 [True, False, False, False])
        self.assertEqual(actual['turn'], 4)
        driver.click.assert_not_called()

    def test_overshot_turn_is_rejected_instead_of_recorded(self):
        with self.assertRaisesRegex(ProtocolError, 'advanced past'):
            self.run_settle(Mock(), [self.checkpoint(5)], [False])

    def test_missing_advance_without_a_recognized_interruption_never_guesses_an_answer(self):
        driver = Mock()
        with self.assertRaisesRegex(ProtocolError, 'did not settle'):
            self.run_settle(driver, repeat(self.checkpoint(3)), repeat(False), timeout=2)
        driver.click.assert_not_called()



if __name__ == '__main__':
    unittest.main()
