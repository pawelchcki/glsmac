"""Transport, input and data-reader guards; synthetic values are not evidence."""
import unittest
from unittest.mock import patch

from protocol import ProtocolError
from ui.faction_identity_contract import validate_input, validate_output
from ui.faction_identity_headless import parse_candidate
from ui import faction_identity_original as original
from ui.generate_faction_identity import make_suite
from pathlib import Path
import json
import compare


class IdentityTests(unittest.TestCase):
    def setUp(self):
        self.cases = [{'id': 'synthetic'}]
        self.values = ['  Pilot  ', 'Unexpected guild', 'guildfolk', 'orbital', 'Captain', 'brisk']
        self.text = '\n'.join(['IDENTITY_CASE|synthetic', *['IDENTITY_VALUE|' + value for value in self.values],
                               'IDENTITY_END', 'IDENTITY_COMPLETE|1', 'All tests passed.'])

    def test_case_generation_contains_only_reproducible_inputs(self):
        path = Path(__file__).resolve().parent / 'ui/cases/faction-identity.json'
        suite = json.loads(path.read_text())
        self.assertEqual(suite, make_suite())
        self.assertEqual(len(suite['cases']), 22)
        for case in suite['cases']:
            self.assertEqual(set(case), {'id', 'algorithm', 'input'})
            validate_input(case['input'])

    def test_original_identity_evidence_is_bound_to_every_input(self):
        directory = Path(__file__).resolve().parent / 'ui'
        suite = compare.read_json(directory / 'cases/faction-identity.json')
        evidence = compare.read_json(directory / 'observations/smacx-gog-2.0-faction-identity.json')
        compare.validate_observations(evidence, suite)
        self.assertEqual(evidence['repeat'], 2)
        self.assertEqual(len(evidence['observations']), 22)
        for observation in evidence['observations']:
            validate_output(observation['output'])

    def test_exact_text_and_empty_fields_survive_transport(self):
        self.assertEqual(parse_candidate(self.text, self.cases)[0]['output'], {'identity': self.values})
        text = self.text.replace('IDENTITY_VALUE|  Pilot  ', 'IDENTITY_VALUE|')
        self.assertEqual(parse_candidate(text, self.cases)[0]['output']['identity'][0], '')

    def test_missing_handoff_is_explicitly_unsupported(self):
        text = 'IDENTITY_CASE|synthetic\nIDENTITY_MISSING\nIDENTITY_END\nIDENTITY_COMPLETE|1\nAll tests passed.'
        self.assertEqual(parse_candidate(text, self.cases)[0]['status'], 'unsupported')

    def test_partial_duplicate_reordered_unknown_and_failed_workers_reject(self):
        changes = [
            ('IDENTITY_CASE|synthetic', 'IDENTITY_CASE|other'),
            ('IDENTITY_CASE|synthetic', 'IDENTITY_CASE|synthetic\nIDENTITY_CASE|synthetic'),
            ('IDENTITY_CASE|synthetic\n', ''),
            ('IDENTITY_VALUE|brisk\n', ''),
            ('IDENTITY_VALUE|brisk', 'IDENTITY_VALUE|brisk\nIDENTITY_VALUE|extra'),
            ('IDENTITY_VALUE|brisk', 'IDENTITY_MISSING'),
            ('IDENTITY_END', 'IDENTITY_END\nIDENTITY_END'),
            ('IDENTITY_END', 'IDENTITY_UNKNOWN'),
            ('IDENTITY_END\n', ''),
            ('IDENTITY_COMPLETE|1\n', ''),
            ('IDENTITY_COMPLETE|1', 'IDENTITY_COMPLETE|2'),
            ('IDENTITY_COMPLETE|1', 'IDENTITY_COMPLETE|1\nIDENTITY_CASE|synthetic'),
            ('All tests passed.', ''),
            ('All tests passed.', 'All tests passed.\nUnhandled exception'),
            ('All tests passed.', 'All tests passed.\nIDENTITY_VALUE|late'),
        ]
        for before, after in changes:
            with self.subTest(before=before, after=after), self.assertRaises(ProtocolError):
                parse_candidate(self.text.replace(before, after), self.cases)

    def test_contract_limits_and_explicit_selected_scope(self):
        validate_input({'profile': 'default', 'actions': [{'preset': 'base'}, {'slot': 6}, {'key': 'Enter'}]})
        for action in [{'mode': 'random'}, {'mode': 'selected'}, {'roster': {'slot': 0, 'option': 2}}]:
            with self.subTest(action=action), self.assertRaises(ProtocolError):
                validate_input({'profile': 'default', 'actions': [action]})
        for output in [{'identity': [''] * 5}, {'identity': [''] * 7}, {'identity': [0] * 6},
                       {'identity': ['X' * 24] + [''] * 5}, {'identity': ['', 'X' * 40] + [''] * 4},
                       {'identity': ['bad\nvalue'] + [''] * 5}, {'identity': [''] * 6, 'extra': True}]:
            with self.subTest(output=output), self.assertRaises(ProtocolError):
                validate_output(output)

    def test_observer_uses_only_one_mask_byte_and_the_actual_selected_record(self):
        class Memory:
            def __init__(self, mask):
                self.mask, self.reads, self.closed = mask, [], False
            def address(self, value):
                return value + 0x100000
            def read(self, address, size):
                self.reads.append((address, size))
                return bytes([self.mask])
            def text(self, address):
                self.reads.append(address)
                return str(address)
            def close(self):
                self.closed = True

        for slot in range(7):
            memory = Memory(1 << (slot + 1))
            with patch.object(original, 'NativeMemory', return_value=memory):
                result = original.read_identity(object())
            expected = [memory.address(original.RECORD + slot * original.STRIDE + offset) for offset in original.OFFSETS]
            self.assertEqual(memory.reads, [(memory.address(original.HUMAN_MASK), 1), *expected])
            self.assertEqual(result, {'identity': list(map(str, expected))})
            self.assertTrue(memory.closed)
        for mask in (0, 1, 3, 6, 255):
            memory = Memory(mask)
            with patch.object(original, 'NativeMemory', return_value=memory), self.assertRaises(ProtocolError):
                original.read_identity(object())
            self.assertTrue(memory.closed)


if __name__ == '__main__':
    unittest.main()
