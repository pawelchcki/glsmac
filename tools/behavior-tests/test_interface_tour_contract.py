"""Reference integrity/protocol checks; these do not execute either game."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from compare import validate_observations
from protocol import ProtocolError
from ui.interface_tour_contract import validate_input, validate_output

DIRECTORY = Path(__file__).parent


class InterfaceTourContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.suite = json.loads((DIRECTORY/'ui/cases/interface-tour.json').read_text())
        cls.record = json.loads((DIRECTORY/'ui/observations/smacx-gog-2.0-interface-tour.json').read_text())
        cls.outputs = validate_observations(cls.record, cls.suite)

    def test_every_recorded_case_has_complete_declared_checkpoints(self):
        self.assertGreaterEqual(self.record['repeat'], 2)
        for case in self.suite['cases']:
            with self.subTest(case=case['id']):
                validate_output(self.outputs[case['id']], case)

    def test_missing_tour_is_an_explicit_comparable_partial_trace(self):
        case = self.suite['cases'][0]
        partial = dict(frames=[dict(topic='tour-prompt', buttons=['OK'], menu_open=False,
                                   commlink_open=False, native_turn=1)], completed=False,
                       failure=dict(step=0, reason='Actual Tour control is absent'), units_unchanged=None)
        validate_output(partial, case)
        for change in (dict(completed=True), dict(failure=None)):
            with self.subTest(change=change), self.assertRaises(ProtocolError):
                validate_output(dict(partial, **change), case)

    def test_actual_wrong_controls_or_panels_remain_comparable(self):
        case = self.suite['cases'][1]
        observed = deepcopy(self.outputs[case['id']])
        observed['frames'][0]['buttons'] = ['ACTUALLY WRONG']
        observed['frames'][3]['menu_open'] = False
        observed['frames'][4]['commlink_open'] = False
        observed['units_unchanged'] = False
        validate_output(observed, case)
        self.assertNotEqual(observed, self.outputs[case['id']])

    def test_native_turn_panel_and_unit_state_need_real_protocol_types(self):
        case = self.suite['cases'][0]
        for key, value in (('native_turn', True), ('menu_open', 1), ('commlink_open', 'false')):
            observed = deepcopy(self.outputs[case['id']]); observed['frames'][0][key] = value
            with self.subTest(key=key), self.assertRaises(ProtocolError): validate_output(observed, case)
        observed = deepcopy(self.outputs[case['id']]); observed['units_unchanged'] = 'true'
        with self.assertRaises(ProtocolError): validate_output(observed, case)
        for data in ({}, {'finish':'native-api'}, {'finish':'full','fake_buttons':True}):
            with self.subTest(data=data), self.assertRaises(ProtocolError): validate_input(data)


if __name__ == '__main__': unittest.main()
