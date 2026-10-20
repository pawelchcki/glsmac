"""Source edits, native observer guards and candidate transport completeness."""
from pathlib import Path
import unittest
from unittest.mock import patch
import compare
from protocol import ProtocolError
from ui.faction_ratings_contract import validate_input, validate_output
from ui.faction_ratings_sources import rules_override, social_override
from ui.faction_ratings_headless import parse_candidate
from ui import faction_ratings_original as observer
from ui.generate_faction_ratings import make_suite


class FactionRatingsTests(unittest.TestCase):
    def test_input_generation_and_scope_are_strict(self):
        directory = Path(__file__).resolve().parent / 'ui'
        self.assertEqual(make_suite(), compare.read_json(directory / 'cases/faction-ratings.json'))
        self.assertEqual(len(make_suite()['cases']), 18)
        for value in ({'preset': 'random', 'slot': 0, 'profile': 'default'},
                      {'preset': 'base', 'slot': True, 'profile': 'default'},
                      {'preset': 'base', 'slot': 0, 'profile': 'rules-a'}):
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                validate_input(value)

    def test_initialized_original_evidence_is_bound_to_all_inputs(self):
        directory = Path(__file__).resolve().parent / 'ui'
        suite = compare.read_json(directory / 'cases/faction-ratings.json')
        evidence = compare.read_json(directory / 'observations/smacx-gog-2.0-faction-ratings.json')
        compare.validate_observations(evidence, suite)
        self.assertEqual(evidence['repeat'], 2)
        self.assertEqual(len(evidence['observations']), 18)
        for result in evidence['observations']:
            validate_output(result['output'])

    def test_rule_source_changes_only_the_two_declared_input_rows(self):
        raw = b'#RULES\n3 ;a\n2\n3,2\n2\n8\n10, ;nutrient\n10, ;mineral\n100\n#NEXT\nuntouched\n'
        result = rules_override(raw, 17, 23).decode()
        self.assertIn('17, ;nutrient\r\n23, ;mineral\r\n', result)
        self.assertTrue(result.endswith('100\n#NEXT\nuntouched\n'))
        self.assertTrue(result.startswith('#RULES\n3 ;a\n2\n3,2\n2\n8\n'))

    def test_social_source_preserves_unrelated_bonus_pairs(self):
        raw = b'#CYBORG\nSynthetic header\nTECH,Synthetic,SOCIAL,-GROWTH,SOCIAL,++EFFIC,SOCIAL,+INDUSTRY\nNext record\n#END\n'
        result = social_override(raw, 2, -3).decode()
        self.assertIn('TECH, Synthetic, SOCIAL, ++EFFIC, SOCIAL, ++GROWTH, SOCIAL, ---INDUSTRY', result)
        self.assertTrue(result.endswith('Next record\n#END\n'))

    def test_native_fields_must_match_actual_named_ui_rows_and_always_close(self):
        class Memory:
            closed = False
            def address(self, value): return value
            def read(self, address, size):
                if (address, size) != (0x9A64E8, 1): raise AssertionError('mask must be a byte')
                return bytes([8])
            def image_word(self, address, signed=False):
                return {observer.GROWTH + 3 * observer.STRIDE: -1,
                        observer.INDUSTRY + 3 * observer.STRIDE: 2,
                        observer.NUTRIENT_RULE: 17, observer.MINERAL_RULE: 23}[address]
            def close(self): self.closed = True
        memory = Memory()
        with patch.object(observer, 'NativeMemory', return_value=memory):
            result = observer.read_native(object(), {'growth': -1, 'industry': 2})
            self.assertEqual(result, {'growth': -1, 'industry': 2, 'nutrient_rule_factor': 17, 'mineral_rule_factor': 23})
            with self.assertRaises(ProtocolError):
                observer.read_native(object(), {'growth': 2, 'industry': -1})
        self.assertTrue(memory.closed)

    def test_candidate_transport_rejects_incomplete_reordered_and_failed_results(self):
        cases = [{'id': 'synthetic'}]
        text = 'RATINGS_RESULT|synthetic|-1|2|17|23\nRATINGS_DONE|1\nAll tests passed.'
        row = parse_candidate(text, cases)[0]; validate_output(row['output'])
        self.assertEqual(row['output']['growth'], -1)
        for old, new in [('synthetic', 'other'), ('|-1|', '|-01|'), ('|-1|', '|x|'),
                         ('RATINGS_DONE|1', ''), ('RATINGS_DONE|1', 'RATINGS_DONE|2'),
                         ('RATINGS_DONE|1', 'RATINGS_DONE|1\nRATINGS_RESULT|synthetic|0|0|10|10'),
                         ('All tests passed.', ''), ('All tests passed.', 'All tests passed.\nUnhandled exception')]:
            with self.subTest(old=old, new=new), self.assertRaises(ProtocolError):
                parse_candidate(text.replace(old, new), cases)


if __name__ == '__main__':
    unittest.main()
