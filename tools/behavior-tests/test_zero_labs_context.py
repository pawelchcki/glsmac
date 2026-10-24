"""Frozen zero-income original trace and independent live cost fields."""
from pathlib import Path
import unittest
import compare
from protocol import ProtocolError
from ui.zero_labs_context_contract import INPUT, validate_input, validate_output

class ZeroLabsContextTests(unittest.TestCase):
    def data(self):
        root=Path(__file__).parent/'ui'
        return (compare.read_json(root/'cases/zero-labs-live-context.json'),compare.read_json(root/'observations/zero-labs-live-context.json'))

    def test_complete_repeated_original_case(self):
        suite,record=self.data();compare.validate_observations(record,suite)
        self.assertEqual(record['repeat'],2)
        for c,r in zip(suite['cases'],record['observations']):
            validate_input(c['input']);validate_output(r['output'])

    def test_zero_income_trace_and_live_context_are_distinct_observations(self):
        _,record=self.data();d=record['observations'][0]['output']
        self.assertEqual(d['initial_allocation'],dict(economy=100,psych=0,labs=0))
        self.assertEqual(d['initial_labs_income'],0)
        self.assertEqual([s['turn'] for s in d['trace']],list(range(1,7)))
        for s in d['trace']:
            self.assertEqual(s['report'],dict(cost=9,accumulated=0,per_turn=0));self.assertEqual(s['accumulated'],0)
            c=s['cost_context'];self.assertEqual(c['turn'],s['turn']);self.assertEqual(c['faction_id'],1)
            self.assertEqual((c['target_id'],c['difficulty'],c['map_area_sqrt']),(5,0,40))
            self.assertEqual((c['saved_earned_techs'],c['research_ranking'],c['research_rating']),(0,0,0))
            self.assertEqual((c['discovery_rate_percent'],c['faction_cost_percent']),(100,100))
            self.assertEqual((c['cached_cost'],c['auxiliary_adjustment'],c['global_difficulty']),(-1,0,0))
            self.assertTrue(c['human']);self.assertFalse(c['stagnation'])
            self.assertEqual(c['faction_counters'],[dict(faction_id=i,saved_earned_techs=0,research_ranking=0) for i in range(1,8)])
            self.assertEqual(s['owned_ids'],[6])

    def test_other_allocations_are_outside_recorded_contract(self):
        for change in (dict(labs_percent=10),dict(advances=6),dict(profile='gaians-talent')):
            with self.assertRaises(ProtocolError):validate_input(dict(INPUT,**change))
