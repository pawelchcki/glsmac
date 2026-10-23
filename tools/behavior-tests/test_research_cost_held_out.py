"""Additional original witness integrity and declared synthetic matrix coverage."""
from pathlib import Path
import unittest
import compare
from protocol import canonical
from research_cost_contract import BASE,validate_input,validate_output

class ResearchCostHeldOutTests(unittest.TestCase):
    def test_independent_original_evidence_is_complete_and_repeated(self):
        root=Path(__file__).parent
        suite=compare.read_json(root/'cases/human-research-cost-held-out.json');record=compare.read_json(root/'observations/human-research-cost-held-out.json')
        compare.validate_observations(record,suite);self.assertEqual(record['repeat'],2)
        for case,row in zip(suite['cases'],record['observations']):validate_input(case['input']);validate_output(row['output'])

    def test_matrix_retains_32_new_inputs_and_five_explicit_anchors(self):
        root=Path(__file__).parent
        old=compare.read_json(root/'cases/human-research-cost.json');new=compare.read_json(root/'cases/human-research-cost-held-out.json')
        prior={canonical(c['input']) for c in old['cases']};actual={canonical(c['input']) for c in new['cases']}
        self.assertEqual(len(new['cases']),37);self.assertEqual(len(actual),37);self.assertEqual(len(actual&prior),5);self.assertEqual(len(actual-prior),32)
        for earned in range(9):self.assertIn(canonical(dict(BASE,saved_earned_techs=earned)),actual)
        for earned in (4,8):
            for rating in range(-3,4):self.assertIn(canonical(dict(BASE,saved_earned_techs=earned,research_rating=rating)),actual)
        for turn in range(9):self.assertIn(canonical(dict(BASE,saved_earned_techs=4,turn=turn)),actual)
