"""Targeted original witness coverage and exact prior-anchor consistency."""
import itertools
from pathlib import Path
import unittest
import compare
from protocol import canonical
from research_cost_contract import BASE,validate_input,validate_output

class ResearchCostTargetedNormalizationTests(unittest.TestCase):
    def test_complete_repeated_original_results_and_exact_anchor(self):
        root=Path(__file__).parent
        suite=compare.read_json(root/'cases/human-research-cost-targeted-normalization.json');record=compare.read_json(root/'observations/human-research-cost-targeted-normalization.json')
        compare.validate_observations(record,suite);self.assertEqual(record['repeat'],2)
        for c,r in zip(suite['cases'],record['observations']):validate_input(c['input']);validate_output(r['output'])
        old_suite=compare.read_json(root/'cases/human-research-cost-blind-validation.json');old_record=compare.read_json(root/'observations/human-research-cost-blind-validation.json')
        self.assertEqual(suite['cases'][-1]['input'],old_suite['cases'][43]['input'])
        old={r['id']:r['output'] for r in old_record['observations']}
        self.assertEqual(record['observations'][-1]['output'],old[old_suite['cases'][43]['id']])

    def test_targeted_inputs_exactly_cover_prespecified_matrix(self):
        root=Path(__file__).parent;suite=compare.read_json(root/'cases/human-research-cost-targeted-normalization.json')
        base=dict(BASE,map_area_sqrt=56,saved_earned_techs=7,research_ranking=12,turn=9)
        expected={canonical(dict(base,difficulty=difficulty,stagnation=stagnation)) for difficulty,stagnation in itertools.product(range(6),(False,True))}
        expected|={canonical(dict(base,difficulty=3,research_rating=-3,stagnation=stagnation)) for stagnation in (False,True)}
        expected.add(canonical(dict(base,saved_earned_techs=8,research_ranking=10,difficulty=3,stagnation=True)))
        old=compare.read_json(root/'cases/human-research-cost-blind-validation.json');expected.add(canonical(old['cases'][43]['input']))
        actual={canonical(c['input']) for c in suite['cases']};self.assertEqual(len(suite['cases']),16);self.assertEqual(len(actual),16);self.assertEqual(actual,expected)
