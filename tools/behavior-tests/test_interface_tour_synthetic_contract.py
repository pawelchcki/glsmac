"""Own source-input identity, frozen original evidence and strict protocol types."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from compare import validate_observations
from protocol import ProtocolError
from ui.interface_tour_inputs import declarations, source_sha256
from ui.interface_tour_synthetic_contract import validate_input, validate_output

DIRECTORY=Path(__file__).parent


class SyntheticInterfaceTourTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.suite=json.loads((DIRECTORY/'ui/cases/interface-tour-synthetic.json').read_text())
        cls.record=json.loads((DIRECTORY/'ui/observations/smacx-gog-2.0-interface-tour-synthetic.json').read_text())
        cls.outputs=validate_observations(cls.record,cls.suite)

    def test_all_four_source_and_control_routes_have_complete_repeated_evidence(self):
        self.assertEqual(self.record['repeat'],2)
        self.assertEqual(len(self.suite['cases']),4)
        for case in self.suite['cases']:
            with self.subTest(case=case['id']):validate_output(self.outputs[case['id']],case)

    def test_source_declarations_are_bound_as_inputs_and_independently_differ(self):
        self.assertNotEqual(declarations('synthetic-a'),declarations('synthetic-b'))
        self.assertNotEqual(source_sha256('synthetic-a'),source_sha256('synthetic-b'))
        data=deepcopy(self.suite['cases'][0]['input']);data['source_profile']='synthetic-b'
        with self.assertRaises(ProtocolError):validate_input(data)
        data['source_sha256']=source_sha256('synthetic-b');validate_input(data)

    def test_wrong_mounted_topics_or_heading_remain_comparable_mismatches(self):
        case=self.suite['cases'][1];output=deepcopy(self.outputs[case['id']])
        output['frames'][1]['topic']='unrecognized-body'
        output['frames'][4]['commlink_text']='ACTUAL WRONG HEADING'
        validate_output(output,case)
        self.assertNotEqual(output,self.outputs[case['id']])

    def test_missing_heading_field_or_unobserved_wrong_types_are_rejected(self):
        case=self.suite['cases'][0]
        for value in [False,{},[]]:
            output=deepcopy(self.outputs[case['id']]);output['frames'][0]['commlink_text']=value
            with self.subTest(value=value),self.assertRaises(ProtocolError):validate_output(output,case)
        output=deepcopy(self.outputs[case['id']]);del output['frames'][0]['commlink_text']
        with self.assertRaises(ProtocolError):validate_output(output,case)


if __name__=='__main__':unittest.main()
