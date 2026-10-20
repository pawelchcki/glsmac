"""Strict visible-label transport and independent original evidence binding."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import unittest

from compare import validate_observations
from protocol import ProtocolError
from ui import base_resource_hud_contract as contract
from ui.base_resource_hud_headless import parse_candidate
from ui.unit_selection_original import fingerprint as fixture_fingerprint

DIRECTORY = Path(__file__).parent / 'ui'


class BaseResourceHudTests(unittest.TestCase):
    def test_repeated_original_evidence_binds_both_complete_panel_observers(self):
        suite = json.loads((DIRECTORY / 'cases/base-resource-hud.json').read_text())
        evidence = json.loads((DIRECTORY / 'observations/smacx-gog-2.0-base-resource-hud.json').read_text())
        validate_observations(evidence, suite)
        self.assertEqual(evidence['repeat'], 2)
        self.assertEqual(len(suite['cases']), 2)
        join_hash = hashlib.sha256(fixture_fingerprint().encode() + (DIRECTORY / 'colony_join_original.py').read_bytes()).hexdigest()
        capture_hash = hashlib.sha256(join_hash.encode() + (DIRECTORY / 'base_hud_capture_original.py').read_bytes()).hexdigest()
        wrapper_hash = hashlib.sha256((DIRECTORY / 'base_resource_hud_original.py').read_bytes()).hexdigest()
        self.assertEqual(evidence['reference']['full_observer_sha256'], capture_hash)
        self.assertEqual(evidence['reference']['adapter_sha256'], hashlib.sha256((capture_hash + wrapper_hash).encode()).hexdigest())
        self.assertEqual(evidence['reference']['ocr']['passes'], [2, 3, 4])
        for case, row in zip(suite['cases'], evidence['observations'], strict=True):
            self.assertEqual(case['algorithm'], contract.ALGORITHM)
            contract.validate_input(case['input'])
            contract.validate_output(row['output'], case['input']['actions'])
        changed = deepcopy(suite)
        changed['cases'][0]['input']['actions'].pop()
        with self.assertRaises(ProtocolError):
            validate_observations(evidence, changed)

    @staticmethod
    def transport():
        cases = [dict(id='wire', input=dict(actions=['open', 'close', 'open', 'close']))]
        text = 'HUD_CASE|wire\n'
        for i in (0, 2):
            text += (f'HUD_OPEN|{i}|2\nHUD_RESOURCE|nutrients|002 - 004|-002\n'
                     'HUD_RESOURCE|minerals|001 - 000|+001\nHUD_RESOURCE|energy|002 - 000|+002\n'
                     'HUD_STATUS|= SURPLUS\nHUD_ALLOCATION|economy| 40%|  1|  0|  1\n'
                     'HUD_ALLOCATION|labs| 40%|  1|  0|  1\nHUD_ALLOCATION|psych| 20%|  0|  4|  4\n'
                     'HUD_OPEN_DONE\n')
        return cases, text + 'HUD_CASE_DONE\nAll tests passed.\n'

    def test_transport_preserves_wrong_status_allocation_and_missing_result_prefix(self):
        cases, text = self.transport()
        states = parse_candidate(text, cases)[0]['output']['trace']
        for state in states:
            self.assertEqual(state['status'], 'SURPLUS')
            self.assertEqual(state['allocation']['psych']['percent'], 20)
            self.assertEqual(state['rows']['nutrients']['visible_right'], '-002')
            self.assertEqual(state['rows']['nutrients']['net'], -2)

    def test_transport_reads_displayed_net_without_recomputing_game_answers(self):
        cases, text = self.transport()
        text = text.replace('|002 - 004|-002', '|002 - 004|= +007')
        for state in parse_candidate(text, cases)[0]['output']['trace']:
            self.assertEqual(state['rows']['nutrients']['net'], 7)
            self.assertEqual(state['rows']['nutrients']['visible_right'], '= +007')

    def test_transport_preserves_original_equals_prefix_and_signed_zero(self):
        cases, text = self.transport()
        text = text.replace('|002 - 004|-002', '|002 - 002|= +000')
        row = parse_candidate(text, cases)[0]['output']['trace'][0]['rows']['nutrients']
        self.assertEqual(row['visible_right'], '= +000')
        self.assertEqual(row['net'], 0)

    def test_transport_rejects_partial_duplicate_reordered_and_coerced_observations(self):
        cases, text = self.transport()
        for before, after in [
            ('HUD_CASE_DONE\n', ''), ('All tests passed.', ''),
            ('HUD_OPEN|2', 'HUD_OPEN|3'), ('HUD_OPEN|0|2', 'HUD_OPEN|0|true'),
            ('HUD_STATUS|= SURPLUS\n', ''),
            ('HUD_STATUS|= SURPLUS\n', 'HUD_STATUS|= SURPLUS\nHUD_STATUS|= SURPLUS\n'),
            ('HUD_RESOURCE|energy|002 - 000|+002\n', ''),
            ('HUD_RESOURCE|energy|002 - 000|+002\n', 'HUD_RESOURCE|energy|002 - 000|+002\nHUD_RESOURCE|energy|002 - 000|+002\n'),
            ('HUD_ALLOCATION|psych| 20%', 'HUD_ALLOCATION|psych|101%'),
            ('HUD_ALLOCATION|psych| 20%|  0', 'HUD_ALLOCATION|psych| 20%|0.0'),
            ('HUD_ALLOCATION|psych| 20%|  0|  4|  4', 'HUD_ALLOCATION|psych| 20%|  0|  4'),
            ('HUD_OPEN_DONE', 'HUD_UNKNOWN'),
            ('002 - 004|-002', '002 - 004|minus two'),
        ]:
            with self.subTest(before=before, after=after), self.assertRaises(ProtocolError):
                parse_candidate(text.replace(before, after), cases)

    def test_contract_rejects_mismatched_visible_transport_without_deriving_net(self):
        cases, text = self.transport()
        state = parse_candidate(text, cases)[0]['output']['trace'][0]
        for field, value in [('intake', True), ('intake', 3), ('visible_right', '= +00'), ('consumption', -1)]:
            changed = deepcopy(state)
            changed['rows']['nutrients'][field] = value
            with self.subTest(field=field), self.assertRaises(ProtocolError):
                contract.validate_checkpoint(changed)


if __name__ == '__main__':
    unittest.main()
