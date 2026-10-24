"""The bounded native projection preserves literal evidence and fails strictly."""
import unittest
from pathlib import Path
import hashlib

import compare
from protocol import ProtocolError
from ui.production_controls_native import parse_candidate, project_reference


class NativeProductionProjectionTests(unittest.TestCase):
    def test_clean_reference_manifest_keeps_the_preserved_contract_and_answers_immutable(self):
        root = Path(__file__).parent / 'ui'
        manifest = compare.read_json(root / 'startup-production-reference-manifest.json')
        self.assertEqual((manifest['case_count'], manifest['repeat']), (8, 2))
        for name, expected in manifest['files'].items():
            self.assertEqual(hashlib.sha256((root / name).read_bytes()).hexdigest(), expected, name)

    def test_projection_retains_original_stock_and_actual_price_without_rewriting_evidence(self):
        root = Path(__file__).parent / 'ui/observations'
        count = 0
        for group in ('core', 'source'):
            for row in compare.read_json(root / f'initial-production-controls-{group}.json')['observations']:
                value = row['output']; actual = project_reference(value)
                self.assertEqual(actual['minerals'], value['first_city_before_panels']['raw_mineral_field'])
                self.assertEqual(actual['price'], value['operations']['pair'][1])
                self.assertEqual(actual['population'], value['first_city_before_panels']['city']['population'])
                count += 1
        self.assertEqual(count, 8)

    def test_native_worker_must_complete_with_one_full_observation(self):
        marker = 'PRODUCTION_NATIVE|FORMERS|9|16|1|1|0|1|0|0|1|0\n'
        done = 'BEHAVIOR_SUMMARY 1 1\nAll tests passed.\n'
        self.assertEqual(parse_candidate(marker + done)['minerals'], 9)
        for output in (done, marker, marker + marker + done, marker + done + 'TEST FAILED\n',
                       marker.replace('|16|', '|broken|') + done):
            with self.assertRaises((ProtocolError, ValueError)):
                parse_candidate(output)


if __name__ == '__main__':
    unittest.main()
