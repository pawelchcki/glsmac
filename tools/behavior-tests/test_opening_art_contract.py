"""Protocol and frozen-evidence checks; these do not render either game."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from compare import validate_observations
from protocol import ProtocolError
from ui.opening_art_contract import validate_input, validate_output

DIRECTORY = Path(__file__).parent


class OpeningArtworkContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.suite = json.loads((DIRECTORY/'ui/cases/opening-art.json').read_text())
        cls.record = json.loads((DIRECTORY/'ui/observations/smacx-gog-2.0-opening-art.json').read_text())

    def test_complete_frozen_reference_is_bound_to_cases(self):
        observations = validate_observations(self.record, self.suite)
        for case in self.suite['cases']:
            with self.subTest(case=case['id']):
                validate_output(observations[case['id']], case)

    def test_partial_checkpoint_or_pixel_read_cannot_be_complete(self):
        case = self.suite['cases'][1]
        original = next(row['output'] for row in self.record['observations'] if row['id'] == case['id'])
        for missing in ['frame', 'pixel', 'channel']:
            output = deepcopy(original)
            if missing == 'frame': output['frames'].pop()
            elif missing == 'pixel': output['frames'][0]['pixels'].pop()
            else: output['frames'][0]['pixels'][0].pop()
            with self.subTest(missing=missing), self.assertRaises(ProtocolError):
                validate_output(output, case)

    def test_coordinates_cannot_be_clamped_scaled_or_duplicated(self):
        for point in [[-1,0], [1024,0], [0,768], [True,0], [0.5,0]]:
            data = deepcopy(self.suite['cases'][0]['input']); data['probes'][0] = point
            with self.subTest(point=point), self.assertRaises(ProtocolError): validate_input(data)
        data = deepcopy(self.suite['cases'][0]['input']); data['probes'][1] = data['probes'][0]
        with self.assertRaises(ProtocolError): validate_input(data)

    def test_wrong_canvas_size_or_non_rgb_bytes_are_rejected(self):
        case = self.suite['cases'][0]
        original = next(row['output'] for row in self.record['observations'] if row['id'] == case['id'])
        for value in [True, -1, 256, 12.5]:
            output = deepcopy(original); output['frames'][0]['pixels'][0][0] = value
            with self.subTest(channel=value), self.assertRaises(ProtocolError): validate_output(output, case)
        output = deepcopy(original); output['frames'][0]['viewport'] = [800,600]
        with self.assertRaises(ProtocolError): validate_output(output, case)


if __name__ == '__main__': unittest.main()
