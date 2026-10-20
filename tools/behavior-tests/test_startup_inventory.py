"""Fail-closed inventory observation and the explicit first-page contract."""
from pathlib import Path
import hashlib
import unittest
from unittest.mock import Mock
import compare
from protocol import ProtocolError
from ui.startup_inventory_contract import validate_input, validate_output
from ui.startup_inventory_original import InventoryVision
from ui.startup_inventory_headless import parse_candidate
from ui.vision import VisionError, consensus


class StartupInventoryTests(unittest.TestCase):
    def test_original_evidence_is_immutable_repeated_and_bound_to_all_inputs(self):
        directory = Path(__file__).parent / 'ui'
        path = directory / 'observations/smacx-gog-2.0-startup-inventory.json'
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),
                         '49bc0dd94e719026842ebb3460530dbde42f4ba8bf08d42eb1d35ee7feef8680')
        suite = compare.read_json(directory / 'cases/startup-inventory.json')
        record = compare.read_json(path); compare.validate_observations(record, suite)
        self.assertEqual(record['repeat'], 2)
        for row in record['observations']:
            validate_output(row['output'])

    def test_candidate_transport_rejects_incomplete_or_fabricated_completion(self):
        text = ('INVENTORY_CASE|synthetic\nINVENTORY_ACTIVE|SCOUT\nINVENTORY_ACTIVE|SCOUT\n'
                'INVENTORY_PRODUCTION|POD\nINVENTORY_END\nINVENTORY_DONE|1\nAll tests passed.')
        result = parse_candidate(text, [{'id': 'synthetic'}])[0]['output']
        self.assertEqual(result['units'][1]['active'], 2)
        self.assertEqual(result['units'][0]['production'], 1)
        for old, new in [('CASE|synthetic', 'CASE|other'), ('INVENTORY_END', ''),
                         ('INVENTORY_DONE|1', 'INVENTORY_DONE|2'),
                         ('INVENTORY_DONE|1', 'INVENTORY_DONE|1\nINVENTORY_ACTIVE|LATE'),
                         ('All tests passed.', ''), ('All tests passed.', 'All tests passed.\nTEST FAILED')]:
            with self.subTest(old=old, new=new), self.assertRaises(ProtocolError):
                parse_candidate(text.replace(old, new), [{'id': 'synthetic'}])

    def test_input_scope_rejects_other_factions_difficulties_and_boolean_slots(self):
        cases = compare.read_json(Path(__file__).parent / 'ui/cases/startup-inventory.json')['cases']
        for case in cases:
            validate_input(case['input'])
        for value in ({}, {'preset': 'base', 'slot': True}, {'preset': 'base', 'slot': 1},
                      {'preset': 'expansion', 'slot': 0, 'difficulty': 0}, {'preset': 'random', 'slot': 0}):
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                validate_input(value)

    def test_output_distinguishes_active_queued_and_lost_without_a_name_dictionary(self):
        output = {'units': [{'name': 'SYNTHETIC NEW UNIT', 'active': 0, 'production': 1, 'lost': 0}]}
        validate_output(output)
        for key, value in (('active', True), ('production', -1), ('lost', 100), ('name', ''), ('name', 'lowercase')):
            row = dict(output['units'][0]); row[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ProtocolError):
                validate_output({'units': [row]})
        with self.assertRaises(ProtocolError):
            validate_output({'units': output['units'] * 2})
        with self.assertRaises(ProtocolError):
            validate_output({'units': []})

    def test_ocr_requires_two_actual_agreeing_readings(self):
        self.assertEqual(consensus(['UNKNOWN UNIT', 'UNKNOWN UNIT', 'OTHER']), 'UNKNOWN UNIT')
        for readings in (['POD', 'POO', 'POX'], ['', '', 'SCOUT']):
            with self.assertRaises(VisionError):
                consensus(readings)

    def test_observer_discovers_extra_rows_and_rejects_ambiguous_counts_or_later_year(self):
        try:
            from PIL import Image, ImageDraw
        except ImportError:
            self.skipTest('optional Pillow is needed for synthetic observer images')
        image = Image.new('RGB', (1024, 768))
        draw = ImageDraw.Draw(image)
        for y in (47, 91, 135):
            draw.rectangle((270, y, 280, y + 7), fill=(88, 140, 44))
            draw.rectangle((650, y, 705, y + 7), fill=(16, 228, 0))
            draw.rectangle((770, y, 810, y + 7), fill=(255, 0, 0))
        observer = object.__new__(InventoryVision)
        observer.require_text = Mock()
        observer.readings = Mock(return_value=['REPORT, M.Y. 2101', 'REPORT, MY. 2101', 'unreadable'])
        observer.line = Mock(side_effect=['UNIT Z', '1 ACTIVE,', '0 PROD,', '0 LOST',
                                          'UNIT A', '0 ACTIVE,', '1 PROD,', '0 LOST',
                                          'UNEXPECTED UNIT', '2 ACTIVE,', '0 PROD,', '0 LOST'])
        output = observer.state(image)
        self.assertEqual([row['name'] for row in output['units']], ['UNEXPECTED UNIT', 'UNIT A', 'UNIT Z'])
        self.assertEqual(sum(row['active'] for row in output['units']), 3)
        observer.readings.return_value = ['MY. 2102'] * 3
        with self.assertRaises(VisionError):
            observer.state(image)
        observer.readings.return_value = ['MY. 2101'] * 3
        observer.line = Mock(side_effect=['UNIT', 'O ACTIVE,'])
        with self.assertRaises(VisionError):
            observer.state(image)


if __name__ == '__main__':
    unittest.main()
