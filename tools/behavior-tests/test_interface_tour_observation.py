import unittest

from ui.interface_tour_observation import classify_body, classify_frames


class MountedTourTextTests(unittest.TestCase):
    source = '#LANDFALL\n#button Explore\nArrival at $BASENAME0.\n#TOUR2\n#xs 300\nMove {the declared} $UNITNAME0 now.\n#TOURMENU\nOpen the distinct command panel.\n#END\n'
    topics = {'TOUR2': 'movement', 'TOURMENU': 'menu'}
    bindings = {'$BASENAME0': 'Literal {Home}', '$UNITNAME0': 'Literal $UNITNAME1 Name', '$UNITNAME1': 'Other Unit'}

    def test_actual_wrapped_text_matches_raw_input_with_literal_native_values(self):
        self.assertEqual(classify_body('Move the declared\nLiteral $UNITNAME1 Name now.', self.source, self.topics, self.bindings), 'movement')
        self.assertEqual(classify_body('Arrival at Literal {Home}.', self.source, self.topics, self.bindings), 'tour-prompt')

    def test_healthy_blank_and_wrong_bodies_are_observed_unknown_topics(self):
        for body in ('', '   ', 'Unrelated healthy mounted text.'):
            self.assertEqual(classify_body(body, self.source, self.topics, self.bindings), 'unrecognized-body')

    def test_stale_mounted_body_retains_its_actual_topic(self):
        actual = classify_body('Move the declared Literal $UNITNAME1 Name now.', self.source, self.topics, self.bindings)
        self.assertNotEqual(actual, 'menu')
        self.assertEqual(actual, 'movement')

    def test_public_frames_do_not_expose_raw_body_or_accept_a_supplied_topic(self):
        frame = dict(topic='menu', observed_stage='guided', mounted_body=' ', native_bindings=self.bindings,
                     buttons=['Continue'], menu_open=True, commlink_open=False, native_turn=1)
        output = {'frames': [frame]}
        classify_frames(output, self.source, self.topics)
        self.assertEqual(frame['topic'], 'unrecognized-body')
        self.assertEqual(set(frame), {'topic', 'buttons', 'menu_open', 'commlink_open', 'native_turn'})


if __name__ == '__main__':
    unittest.main()
