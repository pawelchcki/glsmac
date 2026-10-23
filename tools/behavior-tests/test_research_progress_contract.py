"""Reference integrity and bounded science fixtures, without candidate parity."""
from pathlib import Path
import unittest
import compare
from protocol import ProtocolError
import research_cost_contract as cost
from ui import research_progress_contract as progress

class ResearchProgressContractTests(unittest.TestCase):
    def test_complete_independent_original_records_are_bound_to_inputs(self):
        root=Path(__file__).parent
        for directory,name,module in ((root,'human-research-cost',cost),(root/'ui','initial-research-progress',progress)):
            suite=compare.read_json(directory/'cases'/(name+'.json'));record=compare.read_json(directory/'observations'/(name+'.json'))
            compare.validate_observations(record,suite);self.assertEqual(record['repeat'],2)
            for case,row in zip(suite['cases'],record['observations']):module.validate_input(case['input']);module.validate_output(row['output'])

    def test_cost_scope_rejects_guessed_ownership_mapping_and_invalid_scalars(self):
        for key,value in [('owned_tech_count',1),('difficulty',True),('faction_id',0),('map_area_sqrt',0),('discovery_rate_percent',-1)]:
            with self.subTest(key=key),self.assertRaises(ProtocolError):cost.validate_input(dict(cost.BASE,**{key:value}))
        with self.assertRaises(ProtocolError):cost.validate_output(dict(science_required=True))

    def test_progress_fixture_cannot_silently_extend_to_acquisition_or_other_targets(self):
        for key,value in [('advances',12),('target_id',0),('allocation','labs100'),('advances',True)]:
            with self.subTest(key=key),self.assertRaises(ProtocolError):progress.validate_input(dict(progress.INPUT,**{key:value}))
        with self.assertRaises(ProtocolError):progress.validate_output(dict(initial_allocation=dict(economy=50,psych=0,labs=50),trace=[]))
