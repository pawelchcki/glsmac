"""Repeated original blind-validation evidence and prespecified corner coverage."""
from pathlib import Path
import unittest
import compare
from protocol import canonical
from research_cost_contract import BASE,validate_input,validate_output

class ResearchCostBlindValidationTests(unittest.TestCase):
    def test_blind_original_evidence_is_complete_and_independently_repeated(self):
        root=Path(__file__).parent
        suite=compare.read_json(root/'cases/human-research-cost-blind-validation.json');record=compare.read_json(root/'observations/human-research-cost-blind-validation.json')
        compare.validate_observations(record,suite);self.assertEqual(record['repeat'],2)
        self.assertEqual(len(suite['cases']),74)
        for c,r in zip(suite['cases'],record['observations']):validate_input(c['input']);validate_output(r['output'])

    def test_random_inputs_and_corner_group_do_not_duplicate_prior_cases(self):
        root=Path(__file__).parent;suite=compare.read_json(root/'cases/human-research-cost-blind-validation.json');rows=suite['cases'];actual={canonical(c['input']) for c in rows}
        self.assertEqual(len(actual),74);self.assertEqual([c['id'] for c in rows[:64]],[f'cost-blind-seed20261023-{i:02}' for i in range(64)])
        self.assertEqual(sum(c['input']['research_ranking']%2 for c in rows[:64]),29)
        prior=set()
        for n in ('human-research-cost','human-research-cost-held-out','human-research-cost-normalization','human-research-cost-time-ranking'):
            prior|={canonical(c['input']) for c in compare.read_json(root/'cases'/(n+'.json'))['cases']}
        self.assertFalse(actual&prior)
        corners={canonical(dict(BASE,map_area_sqrt=56,saved_earned_techs=earned,difficulty=difficulty,turn=turn)) for earned,difficulty in ((6,1),(8,5)) for turn in (0,8,16,24,80)}
        self.assertEqual({canonical(c['input']) for c in rows[64:]},corners)
