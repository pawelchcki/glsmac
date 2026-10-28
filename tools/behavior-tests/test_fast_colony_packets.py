"""Preserve the original colony inputs while isolating complete worker packets."""
import hashlib
import json
import re
import unittest
from pathlib import Path

import fast


class ColonyPacketContractTests(unittest.TestCase):
    def test_original_body_bytes_and_whole_case_packet_inventory_are_preserved(self):
        root = Path(__file__).resolve().parents[2]
        evidence = json.loads((root / 'tools/behavior-tests/state_trace/colony-menu-controls-packets-source-v1.json').read_text())
        source = (root / evidence['case_factory']['script']).read_bytes()
        start = source.index(b'const mounted =')
        original = source[start:start + 7771]
        self.assertEqual(hashlib.sha256(original).hexdigest(), 'bf409e45e8071c7584207a8578d9828729316fa101bd31f43fcc991475dc7393')
        suite = next(row for row in fast.load_catalog(fast.DEFAULT_CATALOG)['suites'] if row['id'] == 'colony-menu-controls')
        self.assertEqual(suite['script'], 'GLSMAC_data/tests/colony_menu_controls.gls.js')
        self.assertNotIn('execution_timeout', suite)
        self.assertEqual(suite['packets']['assertions'], 64)
        self.assertEqual([len(part['scenario_names']) for part in suite['packets']['parts']], [8, 5, 3])
        self.assertEqual([name for part in suite['packets']['parts'] for name in part['scenario_names']],
                         [row['name'] for row in evidence['ordered_cases']])
        for part, declared in zip(suite['packets']['parts'], evidence['packets']):
            self.assertEqual(part['script'], declared['script'])
            producer = (root / part['script']).read_text()
            self.assertIn(f"(behavior, {declared['begin_inclusive']}, {declared['end_exclusive']})", producer)
            self.assertEqual(part['scenario_names'], declared['scenarios'])

    def test_only_the_canonical_suite_is_automatically_discoverable(self):
        root = Path(__file__).resolve().parents[2]
        suite = next(row for row in fast.load_catalog(fast.DEFAULT_CATALOG)['suites'] if row['id'] == 'colony-menu-controls')
        entrypoint = re.compile(r'GLSMAC_data/tests/[^_/][^/]*\.gls\.js')
        self.assertIsNotNone(entrypoint.fullmatch(suite['script']))
        for part in suite['packets']['parts']:
            self.assertTrue(Path(part['script']).name.startswith('_'))
            self.assertIsNone(entrypoint.fullmatch(part['script']))
        self.assertIsNone(entrypoint.fullmatch('GLSMAC_data/tests/_colony_menu_controls_cases.gls.js'))


if __name__ == '__main__':
    unittest.main()
