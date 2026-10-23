"""Frozen-reference/protocol checks only; these do not execute either game."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from compare import validate_observations
from protocol import ProtocolError
from ui.opening_sequence_contract import validate_input, validate_output

DIRECTORY = Path(__file__).parent


class OpeningSequenceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.suite = json.loads((DIRECTORY/'ui/cases/opening-sequence.json').read_text())
        cls.record = json.loads((DIRECTORY/'ui/observations/smacx-gog-2.0-opening-sequence.json').read_text())
        cls.outputs = validate_observations(cls.record, cls.suite)

    def test_frozen_reference_has_every_phase_for_both_transports(self):
        for case in self.suite['cases']:
            with self.subTest(case=case['id']): validate_output(self.outputs[case['id']], case)

    def test_missing_phase_is_reportable_but_cannot_be_complete(self):
        case = self.suite['cases'][0]
        partial = dict(frames=[dict(phase='map',caption=None,value=None,native_turn=1)],
                       completed=False,failure=dict(step=0,reason='Actual Planetfall control is absent'))
        validate_output(partial,case)
        for change in [dict(completed=True),dict(failure=None)]:
            invalid = deepcopy(partial);invalid.update(change)
            with self.subTest(change=change), self.assertRaises(ProtocolError): validate_output(invalid,case)

    def test_turn_and_editor_values_require_actual_protocol_types(self):
        case = self.suite['cases'][0]
        for turn in [True,'0',-1,10001]:
            output = deepcopy(self.outputs[case['id']]);output['frames'][0]['native_turn']=turn
            with self.subTest(turn=turn), self.assertRaises(ProtocolError): validate_output(output,case)
        output = deepcopy(self.outputs[case['id']]);output['frames'][1]['value']={'expected':'name'}
        with self.assertRaises(ProtocolError):validate_output(output,case)

    def test_confirmation_cannot_be_replaced_by_an_internal_action(self):
        for data in [{'confirmation':'direct-api'},{'confirmation':'keyboard','skip_to_map':True},{}]:
            with self.subTest(data=data), self.assertRaises(ProtocolError):validate_input(data)


if __name__ == '__main__':unittest.main()
