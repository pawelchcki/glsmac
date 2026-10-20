"""Calibrated fixture boundaries and immutable historical provenance."""
import hashlib
from pathlib import Path
import unittest
import compare
import original
import glsmac
from factors_v2 import ALGORITHMS, NUTRIENT, MINERAL, CUSTOM_NUTRIENT, CUSTOM_MINERAL, validate_input
from factors_v2_original import fixture
from generate_factors_v2 import make_suites
from protocol import ProtocolError

DIRECTORY = Path(__file__).resolve().parent


class CalibratedFactorsTests(unittest.TestCase):
    def test_calibrated_resource_names_select_verified_physical_fields(self):
        for algorithm in ALGORITHMS:
            nutrient = algorithm in (NUTRIENT, CUSTOM_NUTRIENT)
            custom = algorithm in (CUSTOM_NUTRIENT, CUSTOM_MINERAL)
            value = {'faction_id': 3, ('nutrient_rule_factor' if nutrient else 'mineral_rule_factor'): 17,
                     ('growth' if nutrient else 'industry'): -3}
            if not custom:
                value['map_size_level'] = 1
            old, prepared = fixture(algorithm, value)
            self.assertEqual(old, (original.CUSTOM_MINERAL_FACTOR if custom else original.HUMAN_MINERAL_FACTOR) if nutrient else
                             (original.CUSTOM_NUTRIENT_FACTOR if custom else original.HUMAN_NUTRIENT_FACTOR))
            self.assertEqual(prepared['industry' if nutrient else 'growth'], -3)
            self.assertEqual(prepared['mineral_rule_factor' if nutrient else 'nutrient_rule_factor'], 17)
            self.assertEqual(prepared['faction_id'], 3)
            self.assertIn('_v2 ', glsmac.encode_input(algorithm, value))

    def test_all_new_inputs_and_repeated_original_observations_are_reproducible(self):
        count = 0
        for name, generated in make_suites().items():
            suite = compare.read_json(DIRECTORY / 'cases' / (name + '.json'))
            self.assertEqual(suite, generated)
            evidence = compare.read_json(DIRECTORY / 'observations' / ('smacx-gog-2.0-' + name + '.json'))
            compare.validate_observations(evidence, suite)
            self.assertEqual(evidence['repeat'], 2)
            for case in suite['cases']:
                validate_input(case['algorithm'], case['input'])
            count += len(suite['cases'])
        self.assertEqual(count, 6487)

    def test_historical_v1_answers_are_retained_byte_for_byte(self):
        hashes = {
            'human-mineral-factor': 'e1f55ec29d368e80b7b82f8fc47e03f621f7acd321517e68a637c2630871024e',
            'human-nutrient-factor': '1732e6da585166e2fcb6411fc7290442e148d2a0f03a167240cdef1cd4b64561',
            'human-nutrient-factor-held-out': '49303f130d2f98e9b289c2a0bcfeb452e4b02cd72df938c80179b379d66cce8b',
            'custom-map-human-factors': '3fa9bb5afaf362173bdd15b462e3a545feb20a6d6132768c988ad340f509b71b',
        }
        for name, expected in hashes.items():
            path = DIRECTORY / 'observations' / ('smacx-gog-2.0-' + name + '.json')
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), expected)
        active = compare.read_json(DIRECTORY / 'catalog.json')['references']
        self.assertTrue(set(hashes).isdisjoint(row['id'] for row in active))

    def test_malformed_or_unobserved_calibrated_input_rejects(self):
        valid = {'faction_id': 1, 'map_size_level': 0, 'nutrient_rule_factor': 10, 'growth': 0}
        for update in ({'faction_id': 0}, {'growth': -9}, {'growth': 11}, {'growth': True},
                       {'map_size_level': 99}, {'nutrient_rule_factor': 0}, {'extra': 0}):
            with self.subTest(update=update), self.assertRaises(ProtocolError):
                validate_input(NUTRIENT, dict(valid, **update))
