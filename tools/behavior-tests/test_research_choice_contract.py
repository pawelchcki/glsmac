"""Reference integrity only; these checks make no candidate agreement claim."""
from pathlib import Path
import unittest
import compare
from protocol import ProtocolError
from ui.research_choice_contract import validate_input,validate_output


class ResearchChoiceContractTests(unittest.TestCase):
    def test_optional_original_records_bind_complete_inputs_and_repeat(self):
        directory=Path(__file__).parent/'ui'
        for name in ('initial-directed-research','initial-research-eligibility'):
            suite=compare.read_json(directory/'cases'/(name+'.json'))
            record=compare.read_json(directory/'observations'/(name+'.json'))
            compare.validate_observations(record,suite)
            self.assertEqual(record['repeat'],2)
            if name=='initial-directed-research':
                for case,row in zip(suite['cases'],record['observations']):
                    validate_input(case['input']);validate_output(row['output'])
                    self.assertEqual(len(row['output']['trace']),len(case['input']['actions'])+1)

    def test_inputs_exclude_unknown_commands_and_noninteger_card_slots(self):
        for value in ({'actions':[]},{'actions':[{'choose':True}]},{'actions':[{'choose':7}]},
                      {'actions':['grant']},{'actions':[{'choose':-1}]},{'actions':['Escape'],'extra':1}):
            with self.subTest(value=value),self.assertRaises(ProtocolError):validate_input(value)

    def test_output_card_names_are_observed_values_without_a_dictionary(self):
        page=dict(screen='research',caption='SYNTHETIC CAPTION',goal_id=-1,
                  choices=[dict(name='SYNTHETIC '+str(i),category='GROUP '+str(i)) for i in range(7)])
        validate_output(dict(trace=[page,dict(screen='map',goal_id=32)]))
        page['choices'].pop()
        with self.assertRaises(ProtocolError):validate_output(dict(trace=[page]))
