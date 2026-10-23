"""Frozen independently seeded inputs and repeated original output integrity."""
import hashlib
from pathlib import Path
import unittest
import compare
from protocol import canonical
from research_cost_contract import validate_input,validate_output

class ResearchCostFinalBlindValidationTests(unittest.TestCase):
    def test_input_freeze_precedes_immutable_repeated_original_evidence(self):
        root=Path(__file__).parent;path=root/'cases/human-research-cost-final-blind-validation.json'
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),'a5dad6ca1a95753bce46c5bde4828c852e5e129b8847e675e3a52b432002a32f')
        suite=compare.read_json(path);record=compare.read_json(root/'observations/human-research-cost-final-blind-validation.json')
        compare.validate_observations(record,suite);self.assertEqual(record['repeat'],2)
        self.assertEqual(len(suite['cases']),64)
        for c,r in zip(suite['cases'],record['observations']):validate_input(c['input']);validate_output(r['output'])

    def test_all_64_inputs_are_new_and_no_corner_inputs_were_appended(self):
        root=Path(__file__).parent
        rows=compare.read_json(root/'cases/human-research-cost-final-blind-validation.json')['cases'];actual={canonical(c['input']) for c in rows}
        self.assertEqual(len(actual),64);self.assertEqual([c['id'] for c in rows],[f'cost-blind-seed20261024-{i:02}' for i in range(64)])
        prior=set()
        for n in ('human-research-cost','human-research-cost-held-out','human-research-cost-normalization','human-research-cost-time-ranking','human-research-cost-blind-validation','human-research-cost-targeted-normalization'):
            prior|={canonical(c['input']) for c in compare.read_json(root/'cases'/(n+'.json'))['cases']}
        self.assertEqual(len(prior),269);self.assertFalse(actual&prior)
