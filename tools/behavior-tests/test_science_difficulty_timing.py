"""Independently repeated rendered timing and its unpromoted full contexts."""
from pathlib import Path
import unittest
import compare
from protocol import ProtocolError
from ui.science_difficulty_timing_contract import validate_input,validate_output

class ScienceDifficultyTimingTests(unittest.TestCase):
    def data(self):
        root=Path(__file__).parent/'ui'
        return root,compare.read_json(root/'cases/early-science-difficulty-timing.json'),compare.read_json(root/'observations/early-science-difficulty-timing.json')

    def test_two_complete_independent_original_runs(self):
        _,suite,record=self.data();compare.validate_observations(record,suite)
        self.assertEqual(record['repeat'],2);self.assertEqual(len(suite['cases']),4)
        for c,r in zip(suite['cases'],record['observations']):validate_input(c['input']);validate_output(r['output'])

    def test_actual_timing_profiles_remain_explicit(self):
        _,suite,record=self.data()
        for c,r in zip(suite['cases'],record['observations']):
            d=r['output'];expected=[0,0,0,0,1,2] if c['input']['difficulty']=='specialist' else [0,1,2,3,4,5]
            self.assertEqual(d['initial_allocation'],dict(economy=50,psych=0,labs=50));self.assertEqual(d['initial_labs_income'],1)
            self.assertEqual([s['turn'] for s in d['trace']],list(range(1,7)))
            self.assertEqual([s['accumulated'] for s in d['trace']],expected)
            for s in d['trace']:
                self.assertEqual((s['faction_id'],s['goal_id'],s['per_turn']),(1,5,1));self.assertEqual(s['owned_ids'],[6])

    def test_complete_context_archive_projects_to_exact_timing(self):
        root,_,record=self.data();actual={r['id']:r['output'] for r in record['observations']}
        for name in ('run-a.json','run-b.json'):
            full=compare.read_json(root/'reference-archives/early-science-difficulty-timing-v2'/name)
            for r in full['observations']:
                d=r['output'];projected=dict(initial_allocation=d['initial_allocation'],initial_labs_income=d['initial_labs_income'],trace=[dict(turn=s['turn'],faction_id=s['faction_id'],goal_id=s['goal_id'],accumulated=s['accumulated'],owned_ids=s['owned_ids'],per_turn=s['report']['per_turn']) for s in d['trace']])
                self.assertEqual(projected,actual[r['id']])
                self.assertTrue(all(set(s['report'])=={'cost','accumulated','per_turn'} and 'units' in s and 'city' in s for s in d['trace']))

    def test_unrecorded_contexts_remain_outside_scope(self):
        base=dict(difficulty='specialist',target_id=5,advances=5,contact_policy='decline-channel')
        for change in (dict(difficulty='citizen'),dict(difficulty='talent'),dict(advances=6)):
            with self.assertRaises(ProtocolError):validate_input(dict(base,**change))
