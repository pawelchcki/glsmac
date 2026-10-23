"""Run production C++ against immutable independently recorded science costs."""
from pathlib import Path
import unittest

import compare
import glsmac


class ResearchCostCandidateTests(unittest.TestCase):
    def test_native_costs_match_every_promoted_original_observation(self):
        root = Path(__file__).parent
        cases, expected = [], []
        for path in sorted((root / 'cases').glob('human-research-cost*.json')):
            suite = compare.read_json(path)
            record = compare.read_json(root / 'observations' / path.name)
            compare.validate_observations(record, suite)
            cases.extend(suite['cases'])
            expected.extend(row['output'] for row in record['observations'])
        self.assertEqual(len(cases), 340)
        actual = glsmac.run_cases(cases, 'native')
        for case, want, got in zip(cases, expected, actual):
            with self.subTest(case=case['id']):
                self.assertEqual(got, want)
