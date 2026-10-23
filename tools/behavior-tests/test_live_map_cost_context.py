"""Recorded initial live map/preset inputs and actual F2 Laboratories entry."""
from pathlib import Path
import unittest
import compare
from protocol import ProtocolError
from ui.live_map_cost_context_contract import validate_input,validate_output

class LiveMapCostContextTests(unittest.TestCase):
    def data(self):
        root=Path(__file__).parent/'ui'
        return compare.read_json(root/'cases/live-map-cost-context.json'),compare.read_json(root/'observations/live-map-cost-context.json')

    def test_fresh_repeated_complete_original_inputs(self):
        suite,record=self.data();compare.validate_observations(record,suite)
        self.assertEqual(record['repeat'],2);self.assertEqual(len(suite['cases']),6)
        self.assertEqual(record['reference']['kind'],'original-executable')
        self.assertEqual(record['reference']['executable_sha256'],'01901cbf7196b0c5d0df9540a029520f5df8fd9a6b343deef8b5663872805fcf')
        self.assertRegex(record['reference']['windows_key_helper_sha256'],r'^[0-9a-f]{64}$')
        for c,r in zip(suite['cases'],record['observations']):validate_input(c['input']);validate_output(r['output'])

    def test_physical_dimensions_and_live_fields_are_independent_measurements(self):
        suite,record=self.data()
        for c,r in zip(suite['cases'],record['observations']):
            d=r['output'];n=d['native'];x=d['cost_context']
            self.assertEqual((n['map_width'],n['map_height']),(c['input']['map_width'],c['input']['map_height']))
            self.assertEqual((n['turn'],x['turn']),(1,1));self.assertEqual((n['goal_id'],x['target_id']),(5,5))
            self.assertEqual(n['accumulated'],d['report']['accumulated'])
            self.assertEqual(d['entry'],dict(key='F2',transport='windows-sendinput'))
            self.assertEqual([r['faction_id'] for r in x['faction_counters']],list(range(1,8)))
            self.assertTrue(all(type(row[k]) is int for row in x['faction_counters'] for k in ('saved_earned_techs','research_ranking')))
            self.assertEqual(len(d['setup_preset_trace']),0 if c['input']['setup_preset']=='load-default' else 1)

    def test_same_physical_anchor_has_declared_independent_preset_controls(self):
        suite,record=self.data();data={c['input']['setup_preset']:r['output'] for c,r in zip(suite['cases'],record['observations']) if (c['input']['map_width'],c['input']['map_height'])==(40,80)}
        self.assertEqual(set(data),{'load-default','tiny','standard'})
        anchor=data['load-default'];self.assertEqual(anchor['report'],dict(cost=9,accumulated=0,per_turn=1))
        self.assertEqual((anchor['native']['map_kind'],anchor['cost_context']['map_area_sqrt']),(0,40))
        self.assertEqual(data['tiny']['setup_preset_trace'],[dict(phase='preset-selected',map_kind=0)])
        self.assertEqual(data['standard']['setup_preset_trace'],[dict(phase='preset-selected',map_kind=2)])

    def test_other_map_and_target_contexts_are_not_fabricated(self):
        base=dict(map_width=40,map_height=80,setup_preset='load-default',target_id=5)
        for change in (dict(map_width=41),dict(target_id=0),dict(setup_preset='huge'),dict(map_width=68,map_height=34,setup_preset='standard')):
            with self.assertRaises(ProtocolError):validate_input(dict(base,**change))
