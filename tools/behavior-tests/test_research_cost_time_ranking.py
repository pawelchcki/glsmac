"""Exact deduplication and independent original time/ranking witness integrity."""
import itertools
from pathlib import Path
import unittest
import compare
from protocol import canonical
from research_cost_contract import BASE,validate_input,validate_output

class ResearchCostTimeRankingTests(unittest.TestCase):
    def test_original_additional_results_are_complete_and_independently_repeated(self):
        root=Path(__file__).parent
        suite=compare.read_json(root/'cases/human-research-cost-time-ranking.json');record=compare.read_json(root/'observations/human-research-cost-time-ranking.json')
        compare.validate_observations(record,suite);self.assertEqual(record['repeat'],2)
        for c,r in zip(suite['cases'],record['observations']):validate_input(c['input']);validate_output(r['output'])

    def test_requested_matrix_is_covered_without_repeating_prior_inputs(self):
        root=Path(__file__).parent;prior=set()
        for n in ('human-research-cost','human-research-cost-held-out','human-research-cost-normalization'):
            prior|={canonical(c['input']) for c in compare.read_json(root/'cases'/(n+'.json'))['cases']}
        rows=compare.read_json(root/'cases/human-research-cost-time-ranking.json')['cases'];actual={canonical(c['input']) for c in rows}
        requested=set()
        for earned,ranking,turn,stagnation in itertools.product((0,2,4,8),(0,8,16),(1,8,24,80),(False,True)):
            requested.add(canonical(dict(BASE,map_area_sqrt=56,saved_earned_techs=earned,research_ranking=ranking,turn=turn,stagnation=stagnation)))
        for earned,turn in itertools.product((2,4,8),(1,80)):
            requested.add(canonical(dict(BASE,map_area_sqrt=56,difficulty=1,saved_earned_techs=earned,turn=turn)))
        self.assertEqual(len(requested),102);self.assertEqual(len(requested&prior),10)
        self.assertEqual(len(rows),92);self.assertEqual(len(actual),92);self.assertFalse(actual&prior)
        self.assertEqual(actual,requested-prior)
