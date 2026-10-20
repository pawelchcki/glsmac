"""Frozen join evidence and strict native-observer transport integrity."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import unittest

from compare import validate_observations
from protocol import ProtocolError
from ui import colony_join_contract as contract
from ui.colony_join_headless import parse_candidate
from ui.unit_selection_original import fingerprint as fixture_fingerprint

DIRECTORY = Path(__file__).parent / 'ui'


class ColonyJoinTests(unittest.TestCase):
    def test_two_independent_captures_bind_each_input_and_unchanged_observer(self):
        seen = set()
        for name, observer, count in [('core', 'colony_join_original.py', 4), ('mixed', 'colony_join_mixed_original.py', 6)]:
            inputs = json.loads((DIRECTORY / f'cases/colony-join-{name}.json').read_text())
            evidence = json.loads((DIRECTORY / f'observations/smacx-gog-2.0-colony-join-{name}.json').read_text())
            validate_observations(evidence, inputs)
            self.assertGreaterEqual(evidence['repeat'], 2)
            self.assertEqual(len(inputs['cases']), count)
            expected = hashlib.sha256(fixture_fingerprint().encode() + (DIRECTORY / observer).read_bytes()).hexdigest()
            self.assertEqual(evidence['reference']['adapter_sha256'], expected)
            for case, row in zip(inputs['cases'], evidence['observations'], strict=True):
                self.assertNotIn(case['id'], seen); seen.add(case['id'])
                self.assertEqual(set(case), {'id', 'algorithm', 'input'})
                self.assertEqual(case['algorithm'], contract.ALGORITHM)
                contract.validate_input(case['input'])
                contract.validate_output(row['output'], case['input']['actions'])
            changed = deepcopy(inputs); changed['cases'][0]['input']['initial_base']['minerals'] += 1
            with self.assertRaises(ProtocolError): validate_observations(evidence, changed)

    @staticmethod
    def transport():
        case = {'id': 'wire', 'algorithm': contract.ALGORITHM, 'input': {'actions': ['join', 'wait', 'tab']}}
        text = 'JOIN_CASE|wire\n'
        for i in range(4):
            text += (f'JOIN_STATE|{i}|0|colony\nJOIN_BASE|1|0|1|0|0|9\nJOIN_OWNED|1\n'
                     'JOIN_UNIT|scout|0|0\nJOIN_UNIT|former|1|2\nJOIN_UNIT|colony|0|0\nJOIN_STATE_DONE\n')
        return [case], text + 'JOIN_CASE_DONE\nAll tests passed.\n'

    def test_parser_preserves_mismatches_instead_of_supplying_join_answers(self):
        cases, text = self.transport()
        output = parse_candidate(text, cases)[0]['output']['trace']
        self.assertTrue(all(s['selected'] == 'colony' and s['base']['population'] == 1 and len(s['units']) == 3 for s in output))
        changed = text.replace('JOIN_BASE|1|0|1|0|0|9', 'JOIN_BASE|2|1|1|0|0|9').replace('JOIN_UNIT|colony|0|0\n', '')
        state = parse_candidate(changed, cases)[0]['output']['trace'][0]
        self.assertEqual((state['selected'], state['base']['workers'], state['base']['worked_tiles'], len(state['units'])), ('colony', 1, 0, 2))

    def test_parser_rejects_incomplete_duplicate_reordered_or_coerced_native_data(self):
        cases, text = self.transport()
        for before, after in [('JOIN_CASE_DONE\n', ''), ('JOIN_BASE|1|0|1|0|0|9\n', ''),
                              ('JOIN_OWNED|1\n', ''), ('JOIN_OWNED|1\n', 'JOIN_OWNED|1\nJOIN_OWNED|1\n'),
                              ('JOIN_STATE|1', 'JOIN_STATE|2'), ('|0|colony', '|0.0|colony'),
                              ('JOIN_UNIT|former|1|2', 'JOIN_UNIT|scout|1|2'), ('JOIN_UNIT|former|1|2', 'JOIN_UNIT|former|1|4'),
                              ('JOIN_BASE|1|0|1|0|0|9', 'JOIN_BASE|1|0|1|0|0|9.0'), ('All tests passed.', '')]:
            with self.subTest(before=before), self.assertRaises(ProtocolError):
                parse_candidate(text.replace(before, after), cases)

    def test_schema_rejects_answers_and_malformed_native_counts(self):
        good = dict(profile='stacked', initial_base=contract.INITIAL.copy(), setup=['wait', 'hold'], actions=['join', 'wait', 'tab'])
        contract.validate_input(good)
        for key, value in [('profile', 'spread'), ('setup', ['join', 'wait']), ('setup', None), ('actions', ['join']), ('initial_base', {})]:
            bad = deepcopy(good); bad[key] = value
            with self.subTest(key=key), self.assertRaises(ProtocolError): contract.validate_input(bad)
        bad = deepcopy(good); bad['expected'] = 'population2'
        with self.assertRaises(ProtocolError): contract.validate_input(bad)
        cases, text = self.transport(); state = parse_candidate(text, cases)[0]['output']['trace'][0]
        for key, value in [('population', True), ('workers', 2), ('worked_tiles', 1), ('minerals', -1), ('owned_count', 2)]:
            bad = deepcopy(state); bad['base'][key] = value
            with self.subTest(key=key), self.assertRaises(ProtocolError): contract.validate_state(bad)
