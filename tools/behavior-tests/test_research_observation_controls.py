"""Independent original normalization witnesses and report-opening control."""
from pathlib import Path
import unittest
import compare
from protocol import canonical
from research_cost_contract import BASE,validate_input as cost_input,validate_output as cost_output
from ui.research_progress_sparse_contract import validate_input as sparse_input,validate_output as sparse_output

class ResearchObservationControlTests(unittest.TestCase):
    def test_completed_original_batches_are_independent_repeated_and_complete(self):
        root=Path(__file__).parent
        for directory,name,validate_input,validate_output in ((root,'human-research-cost-normalization',cost_input,cost_output),(root/'ui','initial-research-progress-sparse',sparse_input,sparse_output)):
            suite=compare.read_json(directory/'cases'/(name+'.json'));record=compare.read_json(directory/'observations'/(name+'.json'))
            compare.validate_observations(record,suite);self.assertEqual(record['repeat'],2)
            for case,row in zip(suite['cases'],record['observations']):validate_input(case['input']);validate_output(row['output'])

    def test_cost_matrix_covers_requested_scalars_without_changing_prior_suites(self):
        root=Path(__file__).parent
        suite=compare.read_json(root/'cases/human-research-cost-normalization.json');actual={canonical(c['input']) for c in suite['cases']}
        self.assertEqual(len(suite['cases']),19);self.assertEqual(len(actual),19)
        prior=set()
        for n in ('human-research-cost','human-research-cost-held-out'):
            prior|={canonical(c['input']) for c in compare.read_json(root/'cases'/(n+'.json'))['cases']}
        self.assertEqual(len(actual&prior),1);self.assertEqual(len(actual-prior),18)
        for earned in range(9):self.assertIn(canonical(dict(BASE,map_area_sqrt=56,saved_earned_techs=earned)),actual)
        for turn in (1,8,80):
            for stagnation in (False,True):self.assertIn(canonical(dict(BASE,map_area_sqrt=56,saved_earned_techs=8,research_ranking=16,turn=turn,stagnation=stagnation)),actual)
        for earned in (4,8):
            for rating in (-1,1):self.assertIn(canonical(dict(BASE,map_area_sqrt=56,saved_earned_techs=earned,research_rating=rating)),actual)

    def test_original_sparse_and_dense_endpoint_projections_agree(self):
        root=Path(__file__).parent/'ui/observations'
        dense=compare.read_json(root/'initial-research-progress.json')['observations'][0]['output']
        sparse=compare.read_json(root/'initial-research-progress-sparse.json')['observations'][0]['output']
        self.assertEqual(sparse['initial_allocation'],dense['initial_allocation'])
        self.assertEqual(sparse['trace'],[dense['trace'][0],dense['trace'][-1]])
