"""Repeated original early timing variants and scoped Talent counterexample."""
from pathlib import Path
import unittest
import compare
from protocol import ProtocolError
from ui.science_timing_variants_contract import validate_input,validate_output

class ScienceTimingVariantTests(unittest.TestCase):
    def test_independent_original_variants_bind_complete_inputs(self):
        root=Path(__file__).parent/'ui';suite=compare.read_json(root/'cases/early-science-variants.json');record=compare.read_json(root/'observations/early-science-variants.json')
        compare.validate_observations(record,suite);self.assertEqual(record['repeat'],2)
        for c,r in zip(suite['cases'],record['observations']):validate_input(c['input']);validate_output(r['output'])

    def test_positive_income_counterexample_is_preserved(self):
        root=Path(__file__).parent/'ui/observations';record=compare.read_json(root/'early-science-variants.json')
        observed={r['id']:r['output'] for r in record['observations']}
        hive=observed['hive-citizen-first-five-advances'];talent=observed['gaians-talent-first-five-advances']
        self.assertEqual(hive['initial_labs_income'],1);self.assertEqual(talent['initial_labs_income'],1)
        self.assertEqual([s['accumulated'] for s in hive['trace']],[0,0,0,0,1,2])
        self.assertEqual([s['accumulated'] for s in talent['trace']],[0,1,2,3,4,5])

    def test_unrecorded_profiles_and_more_turns_are_outside_scope(self):
        for d in (dict(profile='gaians-specialist',target_id=5,advances=5,contact_policy='decline-channel'),dict(profile='hive-citizen',target_id=5,advances=6,contact_policy='decline-channel')):
            with self.assertRaises(ProtocolError):validate_input(d)
