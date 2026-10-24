"""Independent original display/raw production stock witness integrity."""
from pathlib import Path
import unittest
import compare
from protocol import ProtocolError
from ui.production_stock_contract import INPUT,validate_input,validate_output

class ProductionStockContractTests(unittest.TestCase):
    def test_real_display_and_native_record_is_complete_and_repeated(self):
        root=Path(__file__).parent/'ui'
        suite=compare.read_json(root/'cases/initial-production-stock.json');record=compare.read_json(root/'observations/initial-production-stock.json')
        compare.validate_observations(record,suite);self.assertEqual(record['repeat'],2)
        for c,r in zip(suite['cases'],record['observations']):validate_input(c['input']);validate_output(r['output'])

    def test_independent_projection_matches_earlier_raw_endpoints_without_replacing_them(self):
        root=Path(__file__).parent/'ui/observations'
        rows=compare.read_json(root/'initial-production-stock.json')['observations'][0]['output']['trace']
        earlier=compare.read_json(root/'initial-research-progress.json')['observations'][0]['output']['trace']
        for row,old in zip(rows,(earlier[0],earlier[-1])):
            self.assertEqual(row['before']['raw_mineral_field'],old['city']['minerals'])
            self.assertEqual(row['after']['raw_mineral_field'],row['before']['raw_mineral_field'])
            self.assertEqual(row['operations']['pair'][0],row['before']['raw_mineral_field'])
            self.assertEqual(row['panel']['bright_grid_samples'],row['operations']['pair'][0])
            self.assertEqual(row['panel']['turns'],row['operations']['turns'])
            self.assertEqual(row['panel']['project'],row['operations']['project'])

    def test_fixture_scope_rejects_other_targets_advances_and_contact_acceptance(self):
        for key,value in [('target_id',0),('advances',7),('advances',True),('contact_policy','accept-channel')]:
            with self.subTest(key=key),self.assertRaises(ProtocolError):validate_input(dict(INPUT,**{key:value}))
