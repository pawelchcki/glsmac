"""Decoder/health tests only; these packets are not native agreement evidence."""
import unittest

from protocol import ProtocolError
from ui.interface_tour_headless import parse_candidate
from ui.interface_tour_inputs import declarations, source_sha256, tutorial_document
from ui.interface_tour_observation import raw_bodies
from ui.interface_tour_synthetic_contract import ALGORITHM


class NativeTourTransportTests(unittest.TestCase):
    case = {'id':'decoder-only', 'algorithm':ALGORITHM,
            'input':{'source_profile':'synthetic-a', 'source_sha256':source_sha256('synthetic-a'), 'finish':'early'}}

    def packet(self, body=None, turn=41):
        inputs = declarations('synthetic-a'); controls = inputs['controls']; raw = raw_bodies(tutorial_document('synthetic-a'))
        lines = ['TOUR_CASE|decoder-only']
        for index, (stage, text, buttons) in enumerate([
            ('tour', raw['LANDFALL'], [controls['tour'],controls['close']]),
            ('guided', raw['TOUR1'].replace('$UNITNAME0','Synthetic Unit') if body is None else body, [controls['next'],controls['end']]),
            ('map', '', []),
        ]):
            lines.append(f'TOUR_FRAME|{index}|{stage}|{turn}|false|false')
            lines.extend(f'TOUR_BUTTON|{20+350*ordinal}|{label}' for ordinal,label in enumerate(buttons))
            lines.extend([f'TOUR_BODY|{text}', 'TOUR_COMMLINK|', 'TOUR_BINDINGS|Synthetic Home|Synthetic Unit',
                          'TOUR_UNIT|7|Synthetic|4|8|0.8|0.5|HOLD|false', 'TOUR_FRAME_DONE'])
        return '\n'.join(lines+['TOUR_DONE|true','All tests passed.'])+'\n'

    def test_native_counter_is_observed_without_projection(self):
        output = parse_candidate(self.packet(), [self.case])[0]['output']
        self.assertEqual([frame['native_turn'] for frame in output['frames']], [41,41,41])
        self.assertTrue(output['units_unchanged'])

    def test_blank_and_wrong_healthy_text_stay_successful_observations_with_wrong_topics(self):
        for body in ('', 'Unrelated mounted prose.'):
            result = parse_candidate(self.packet(body), [self.case])[0]
            self.assertEqual(result['status'], 'ok')
            self.assertEqual(result['output']['frames'][1]['topic'], 'unrecognized-body')

    def test_stale_body_cannot_follow_a_page_identifier(self):
        body = raw_bodies(tutorial_document('synthetic-a'))['TOURMENU']
        result = parse_candidate(self.packet(body), [self.case])[0]
        self.assertEqual(result['output']['frames'][1]['topic'], 'menu')
        self.assertNotEqual(result['output']['frames'][1]['topic'], 'unit-status')

    def test_runtime_failure_remains_an_error(self):
        result = parse_candidate('TOUR_CASE|decoder-only\nTOUR_ERROR|Synthetic runtime failure\nAll tests passed.\n', [self.case])[0]
        self.assertEqual(result['status'], 'error')
        with self.assertRaises(ProtocolError):
            parse_candidate(self.packet().replace('All tests passed.','TEST FAILED'), [self.case])

    def test_incomplete_transport_is_rejected(self):
        with self.assertRaises(ProtocolError):
            parse_candidate(self.packet().replace('TOUR_FRAME_DONE\n','',1), [self.case])


if __name__ == '__main__':
    unittest.main()
