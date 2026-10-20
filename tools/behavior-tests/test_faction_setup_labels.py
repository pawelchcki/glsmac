"""OCR bounds reject ambiguity without rewriting recognized characters."""
import unittest
from unittest.mock import patch

from ui.faction_setup_original_v2 import FactionVision, plain_label
from ui.vision import VisionError


class FactionLabelTests(unittest.TestCase):
    def test_plain_labels_have_no_expected_word_dictionary(self):
        self.assertEqual(plain_label('Unexpected pilot (3): arbitrary editable text'), 'Unexpected pilot (3)')
        self.assertEqual(plain_label('Different label: anything'), 'Different label')
        for value in ('No delimiter', ': Empty label', 'Pilot (3}: value', 'Pilot (3: value', 'Pilot 3): value'):
            with self.subTest(value=value), self.assertRaises(VisionError):
                plain_label(value)

    def test_smallest_complete_actual_region_supplies_the_label(self):
        observer = FactionVision.__new__(FactionVision)
        boxes = []

        def region(actual, image, box, black=False):
            boxes.append(box)
            return 'Different pilot (3}:' if box[2] == 442 else 'Different pilot (3):'

        with patch.object(FactionVision.__bases__[0], 'region', region):
            self.assertEqual(observer.region(object(), (347, 688, 1007, 708)), 'Different pilot (3):')
        self.assertEqual(boxes, [(347, 688, 442, 708), (347, 688, 450, 708)])

    def test_all_ambiguous_regions_fail_instead_of_returning_a_replacement(self):
        observer = FactionVision.__new__(FactionVision)
        with patch.object(FactionVision.__bases__[0], 'region', return_value='Different pilot (3}:'), \
                self.assertRaises(VisionError):
            observer.region(object(), (347, 688, 1007, 708))
