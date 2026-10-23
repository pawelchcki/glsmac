"""Optional original evidence integrity, without a candidate parity claim."""
from pathlib import Path
import unittest
import compare
from protocol import ProtocolError
from ui import research_priorities_contract as priorities
from ui import blind_rule_contract as rules

class BlindResearchContractTests(unittest.TestCase):
    def test_repeated_optional_records_bind_every_complete_case(self):
        directory=Path(__file__).parent/'ui'
        for name,module in (('initial-blind-priorities',priorities),('blind-research-rule',rules)):
            suite=compare.read_json(directory/'cases'/(name+'.json'));record=compare.read_json(directory/'observations'/(name+'.json'))
            compare.validate_observations(record,suite);self.assertEqual(record['repeat'],2)
            for case,row in zip(suite['cases'],record['observations']):
                module.validate_input(case['input']);module.validate_output(row['output'])
                self.assertEqual(len(row['output']['trace']),len(case['input']['actions'])+1)

    def test_priority_contract_rejects_unknown_and_noninteger_checkbox_inputs(self):
        for value in ({'actions':[]},{'actions':[{'toggle':True}]},{'actions':[{'toggle':4}]},{'actions':['grant']}):
            with self.subTest(value=value),self.assertRaises(ProtocolError):priorities.validate_input(value)
        for value in ({'actions':[]},{'actions':['toggle-other-rule']},{'actions':[{'choose':'UNKNOWN'}]}):
            with self.subTest(value=value),self.assertRaises(ProtocolError):rules.validate_input(value)

    def test_synthetic_labels_and_all_unchecked_are_valid_observations(self):
        page=dict(screen='priorities',caption='SYNTHETIC PRIORITIES',buttons=['CONTINUE'],
                  rows=[dict(label='SYNTHETIC '+str(i),checked=False) for i in range(4)])
        priorities.validate_output(dict(trace=[page,dict(screen='map')]))
        page['rows'][0]['checked']=0
        with self.assertRaises(ProtocolError):priorities.validate_output(dict(trace=[page]))
