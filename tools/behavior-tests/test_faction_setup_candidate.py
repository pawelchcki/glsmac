"""Transport completeness tests, independent of recorded original answers."""
import unittest
from unittest.mock import patch

from protocol import ProtocolError
from ui.faction_setup_candidate import parse_candidate
from ui import faction_setup_headless as replay


class FactionCandidateTests(unittest.TestCase):
    def setUp(self):
        self.cases = [{'id': 'synthetic-case', 'input': {'profile': 'default', 'actions': [{'key': 'Enter'}]}}]
        self.transcript = '\n'.join([
            'FSET_CASE|synthetic-case', 'FSET_STATE|factions|0|false', 'FSET_CAPTION|SYNTHETIC ROSTER',
            'FSET_ITEM|Unexpected guild|(Unexpected role)', 'FSET_BUTTON|OK', 'FSET_END',
            'FSET_STATE|name|-1|false', 'FSET_CAPTION|SYNTHETIC EDITOR', 'FSET_LABEL|PILOT',
            'FSET_VALUE|  Case Preserved  ', 'FSET_BUTTON|OK', 'FSET_BUTTON|CANCEL', 'FSET_END',
            'FSET_DONE', 'FSET_COMPLETE|1', 'All tests passed.',
        ])

    def test_preserves_actual_packed_columns_and_exact_input(self):
        rows = parse_candidate(self.transcript, self.cases)
        self.assertEqual(rows[0]['output']['trace'][0]['items'], ['Unexpected guild|(Unexpected role)'])
        self.assertEqual(rows[0]['output']['trace'][1]['values'], ['  Case Preserved  '])
        self.assertEqual(rows[0]['id'], 'synthetic-case')

    def test_empty_focused_value_is_observed(self):
        text = self.transcript.replace('FSET_VALUE|  Case Preserved  ', 'FSET_VALUE|')
        self.assertEqual(parse_candidate(text, self.cases)[0]['output']['trace'][1]['values'], [''])

    def test_rejects_missing_duplicate_unknown_reordered_and_late_markers(self):
        changes = [
            ('FSET_CASE|synthetic-case', 'FSET_CASE|other-case'),
            ('FSET_CASE|synthetic-case', 'FSET_CASE|synthetic-case\nFSET_CASE|synthetic-case'),
            ('FSET_CAPTION|SYNTHETIC ROSTER\n', ''),
            ('FSET_CAPTION|SYNTHETIC ROSTER', 'FSET_CAPTION|SYNTHETIC ROSTER\nFSET_CAPTION|OTHER'),
            ('FSET_STATE|name|-1|false', 'FSET_STATE|name|-01|false'),
            ('FSET_STATE|name|-1|false', 'FSET_STATE|name|-1|0'),
            ('FSET_LABEL|PILOT\n', ''),
            ('FSET_VALUE|  Case Preserved  \n', ''),
            ('FSET_VALUE|  Case Preserved  ', 'FSET_VALUE|a\nFSET_VALUE|b'),
            ('FSET_DONE', 'FSET_DONE\nFSET_DONE'),
            ('FSET_COMPLETE|1', 'FSET_COMPLETE|2'),
            ('FSET_COMPLETE|1\n', ''),
            ('FSET_COMPLETE|1', 'FSET_COMPLETE|1\nFSET_CASE|synthetic-case'),
            ('FSET_END', 'FSET_UNKNOWN'),
            ('All tests passed.', 'All tests passed.\nUnhandled exception'),
            ('All tests passed.', ''),
        ]
        for old, new in changes:
            with self.subTest(old=old, new=new), self.assertRaises(ProtocolError):
                parse_candidate(self.transcript.replace(old, new), self.cases)

    def test_missing_checkpoint_cannot_complete_a_longer_action_sequence(self):
        cases = [{'id': 'synthetic-case', 'input': {'actions': [{'key': 'Enter'}, {'key': 'Escape'}]}}]
        with self.assertRaises(ProtocolError):
            parse_candidate(self.transcript, cases)

    def test_worker_log_prefixes_do_not_change_observations(self):
        text = '\n'.join('[worker] ' + line if line.startswith('FSET_') else line for line in self.transcript.splitlines())
        self.assertEqual(parse_candidate(text, self.cases), parse_candidate(self.transcript, self.cases))

    def test_native_graphs_use_bounded_fresh_batches_and_preserve_case_order(self):
        cases = [{'id': str(index)} for index in range(5)]
        calls = []

        def batch(actual, runtime, **sources):
            calls.append([case['id'] for case in actual])
            self.assertEqual(runtime, 'synthetic-runtime')
            return {'scripts_sha256': 'synthetic-' + actual[0]['id'], 'runtime_sha256': 'same'}, actual

        with patch.object(replay, 'batch', side_effect=batch):
            metadata, actual = replay.headless(cases, 'synthetic-runtime', jobs=1)
        self.assertEqual(calls, [['0', '1'], ['2', '3'], ['4']])
        self.assertEqual(actual, cases)
        self.assertEqual(metadata['batch_size'], 2)
        self.assertEqual(len(metadata['batch_scripts_sha256']), 3)

    def test_changed_runtime_between_batches_cannot_be_reported_as_agreement(self):
        with patch.object(replay, 'batch', side_effect=[
            ({'scripts_sha256': 'first', 'runtime_sha256': 'old'}, []),
            ({'scripts_sha256': 'second', 'runtime_sha256': 'new'}, []),
        ]), self.assertRaisesRegex(ProtocolError, 'different runtime'):
            replay.headless([{}] * 3, 'synthetic-runtime')
