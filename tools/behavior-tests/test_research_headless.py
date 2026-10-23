"""Optional replay observes controls; malformed/truncated runs cannot pass."""
from copy import deepcopy
from pathlib import Path
import tempfile
import unittest

from protocol import ProtocolError
from ui import research_headless as replay


class ResearchReplayTests(unittest.TestCase):
    def setUp(self):
        self.case = dict(id='synthetic', algorithm=replay.priorities.ALGORITHM, input=dict(actions=['Escape']))
        self.lines = ['RESEARCH_CASE|synthetic', 'RESEARCH_OPEN|priorities|-1|Changed caption']
        self.lines.extend('RESEARCH_ROW|Area ' + str(i) + '|false' for i in range(4))
        self.lines.extend(['RESEARCH_OK|Continue', 'RESEARCH_END', 'RESEARCH_MAP|-1', 'RESEARCH_DONE', 'All tests passed.'])

    def test_actual_labels_and_all_off_survive_without_an_expected_dictionary(self):
        rows = replay.parse_candidate('\n'.join(self.lines), [self.case])
        self.assertEqual(rows[0]['output']['trace'][0], dict(screen='priorities', caption='Changed caption',
                         rows=[dict(label='Area ' + str(i), checked=False) for i in range(4)], buttons=['Continue']))
        self.assertEqual(rows[0]['output']['trace'][1], dict(screen='map'))

    def test_truncated_duplicate_reordered_and_failed_runs_are_rejected(self):
        changes = [self.lines[:-1], self.lines[1:], self.lines[:3] + self.lines[4:],
                   self.lines[:7] + ['RESEARCH_OK|Extra'] + self.lines[7:],
                   self.lines + ['TEST FAILED'], self.lines + ['RESEARCH_MAP|-1'],
                   [line.replace('|false', '|0') for line in self.lines]]
        for lines in changes:
            with self.subTest(lines=lines), self.assertRaises(ProtocolError):
                replay.parse_candidate('\n'.join(lines), [self.case])
        extra = deepcopy(self.case); extra['input']['actions'].append('open')
        with self.assertRaises(ProtocolError):
            replay.parse_candidate('\n'.join(self.lines), [extra])

    def test_local_sources_use_case_insensitive_names_and_normalize_line_endings(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in replay.SOURCE_NAMES:
                (root / (name.upper() + '.TXT')).write_bytes(b'#SYNTHETIC\r\nInput\r\n')
            sources = replay.installed_sources(root)
            self.assertEqual(len(sources), len(replay.SOURCE_NAMES))
            self.assertTrue(all(source['contents'] == '#SYNTHETIC\nInput\n' for source in sources))
            (root / 'gaians.txt').write_text('Ambiguous')
            with self.assertRaisesRegex(ProtocolError, 'Ambiguous'):
                replay.installed_sources(root)
