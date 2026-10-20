"""Road-network transport integrity, separate from observed game behavior."""
from copy import deepcopy
import json
from pathlib import Path
import struct
import unittest

from compare import validate_observations
from protocol import ProtocolError
from ui.generate_road_network import suite, map_input
from ui.road_network_contract import ALGORITHM, PROFILES, validate_input, validate_output
from ui.road_network_headless import parse_candidate


class RoadNetworkTests(unittest.TestCase):
    def test_frozen_evidence_binds_every_case_to_two_whole_original_runs(self):
        directory = Path(__file__).parent / 'ui'
        inputs = json.loads((directory / 'cases/road-network.json').read_text())
        evidence = json.loads((directory / 'observations/smacx-gog-2.0-road-network.json').read_text())
        validate_observations(evidence, inputs)
        self.assertGreaterEqual(evidence['repeat'], 2)
        self.assertEqual(len(evidence['observations']), 2)
        for case, row in zip(inputs['cases'], evidence['observations'], strict=True):
            validate_output(row['output'], case['input']['actions'])

    def test_inputs_reproduce_the_declared_suite(self):
        directory = Path(__file__).parent / 'ui'
        declared = suite()
        self.assertEqual(declared, json.loads((directory / 'cases/road-network.json').read_text()))
        self.assertEqual(len(declared['cases']), len({c['id'] for c in declared['cases']}))
        for case in declared['cases']:
            self.assertEqual(case['algorithm'], ALGORITHM)
            validate_input(case['input'])

    def test_map_profiles_supply_only_declared_synthetic_terrain(self):
        for profile, (moisture, rockiness, forest) in PROFILES.items():
            data = map_input(profile)
            for index in range(40 * 80 // 2):
                at = 15 + 0xaa4 + index * 44
                self.assertEqual(((data[at] >> 3) & 3) + 1, moisture)
                self.assertEqual((data[at + 5] >> 6) + 1, rockiness)
                flags = struct.unpack_from('<I', data, at + 8)[0]
                self.assertEqual(bool(flags & 0x200000), forest)
                self.assertEqual(bool(flags & 4), profile != 'base-road')
                self.assertFalse(flags & 1)  # Actual base founding belongs to each application.

    def test_inputs_cannot_supply_answers_or_unknown_actions(self):
        for data in (None, {}, [], {'profile': [], 'actions': []}, {'profile': 'unknown', 'actions': []},
                     {'profile': 'base-road', 'actions': 'east'}, {'profile': 'base-road', 'actions': [None]},
                     {'profile': 'base-road', 'actions': ['teleport']},
                     {'profile': 'base-road', 'actions': ['east'] * 9},
                     {'profile': 'base-road', 'actions': ['advance'] * 3},
                     {'profile': 'base-road', 'actions': [], 'movement_spent': 1}):
            with self.subTest(data=data), self.assertRaises(ProtocolError): validate_input(data)

    @staticmethod
    def witness():
        # Protocol shape only; this is never a claimed original-game result.
        return {'trace': [{'year_delta': 0, 'position': -1, 'movement_spent': 2,
                           'terrain': {'base': True, 'road': False, 'forest': False, 'moisture': 1, 'rockiness': 1}}]}

    def test_outputs_require_complete_typed_state(self):
        validate_output(self.witness(), [])
        for data in (None, {}, {'trace': []}, {'trace': [None]}, {'trace': 'invalid'}):
            with self.subTest(data=data), self.assertRaises(ProtocolError): validate_output(data, [])
        for key in self.witness()['trace'][0]:
            data = self.witness(); del data['trace'][0][key]
            with self.subTest(key=key), self.assertRaises(ProtocolError): validate_output(data, [])
        for key, values in (('year_delta', [True, -1, 3]), ('position', [True, -5, 5]),
                            ('movement_spent', [True, -1, 4])):
            for value in values:
                data = self.witness(); data['trace'][0][key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ProtocolError): validate_output(data, [])
        for key in self.witness()['trace'][0]['terrain']:
            data = self.witness(); del data['trace'][0]['terrain'][key]
            with self.subTest(key=key), self.assertRaises(ProtocolError): validate_output(data, [])
        for key, values in (('base', [1, 'true']), ('road', [0, None]), ('forest', [1.0, 'false']),
                            ('moisture', [True, 0, 4]), ('rockiness', [False, 1.0, 4])):
            for value in values:
                data = self.witness(); data['trace'][0]['terrain'][key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ProtocolError): validate_output(data, [])

    def test_candidate_rejects_partial_reordered_or_coerced_output(self):
        cases = [{'id': 'shape', 'algorithm': ALGORITHM, 'input': {'profile': 'base-road', 'actions': []}}]
        text = 'NETWORK_CASE|shape\nNETWORK_STATE|0|0|-1|2|true|false|false|1|1\nNETWORK_DONE\nAll tests passed.\n'
        self.assertEqual(parse_candidate(text, cases)[0]['output'], self.witness())
        for before, after in (('NETWORK_DONE\n', ''), ('NETWORK_STATE|0', 'NETWORK_STATE|1'),
                              ('|-1|2|', '|-0|2|'), ('|true|', '|1|'), ('|1|1\n', '|1.0|1\n'),
                              ('NETWORK_DONE', 'NETWORK_UNKNOWN'), ('All tests passed.', ''),
                              ('NETWORK_CASE|shape', 'NETWORK_CASE|other'),
                              ('NETWORK_DONE', 'NETWORK_DONE\nNETWORK_DONE')):
            with self.subTest(after=after), self.assertRaises(ProtocolError): parse_candidate(text.replace(before, after), cases)

    def test_every_native_rejection_remains_an_independent_error(self):
        cases = [{'id': 'first', 'algorithm': ALGORITHM, 'input': {'profile': 'base-road', 'actions': []}}]
        cases.append(dict(deepcopy(cases[0]), id='second'))
        rows = parse_candidate('NETWORK_CASE|first\nNETWORK_ERROR|locked\nNETWORK_CASE|second\n'
                               'NETWORK_ERROR|no movement\nAll tests passed.\n', cases)
        self.assertEqual([(r['status'], r['reason']) for r in rows], [('error', 'locked'), ('error', 'no movement')])


if __name__ == '__main__': unittest.main()
