"""Integrity of genuine all-player evidence; never candidate agreement."""
import hashlib
from pathlib import Path
import unittest

import compare
from protocol import decode_json
from state_trace.schema import validate_reference_output

DIRECTORY = Path(__file__).parent / 'state_trace'
SUITES = ('natural-startup', 'natural-startup-economy-research')


class ReferenceTraceTests(unittest.TestCase):
    def test_all_player_identity_controls_are_frozen_without_full_parity_claim(self):
        directory = DIRECTORY / 'all-player-identity'
        manifest_path = directory / 'manifest-v1.json'
        self.assertEqual(hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
                         'db2dede186561db7d37f4007e8a88eec22cb37af736c81636207de92e8498c88')
        manifest = decode_json(manifest_path.read_text())
        for relative, digest in manifest['files'].items():
            with self.subTest(path=relative):
                path = Path(relative)
                self.assertFalse(path.is_absolute())
                self.assertNotIn('..', path.parts)
                self.assertEqual(hashlib.sha256((directory / path).read_bytes()).hexdigest(), digest)
        suite = compare.read_json(directory / 'cases-v1.json')
        record = compare.read_json(directory / 'observations-v1.json')
        outputs = compare.validate_observations(record, suite)
        self.assertEqual(record['repeat'], 2)
        self.assertEqual(len(outputs), 2)
        for output in outputs.values():
            self.assertEqual(len(output['after_launch']['players']), 7)

    def test_bounded_setup_controls_are_frozen_outside_passing_totals(self):
        directory = DIRECTORY / 'setup-controls'
        manifest_path = directory / 'manifest-v1.json'
        self.assertEqual(hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
                         'fb863b7120863b98fe7879a9fa71639f135da8f9ecba6ad30370a171cbff7abd')
        manifest = decode_json(manifest_path.read_text())
        self.assertEqual(manifest['status'], 'accepted-original-repeat2-bounded-setup-controls')
        self.assertIs(manifest['candidate_inspected_or_executed'], False)
        self.assertIs(manifest['passing_catalog'], False)
        self.assertEqual(manifest['original_only_adapters_included'], [])
        self.assertEqual(len(manifest['files']), 10)
        for relative, digest in manifest['files'].items():
            with self.subTest(path=relative):
                path = Path(relative)
                self.assertFalse(path.is_absolute())
                self.assertNotIn('..', path.parts)
                self.assertEqual(hashlib.sha256((directory / path).read_bytes()).hexdigest(), digest)
        count = 0
        for path in sorted((directory / 'cases').glob('*.json')):
            suite = compare.read_json(path)
            record = compare.read_json(directory / 'observations' / path.name)
            outputs = compare.validate_observations(record, suite)
            self.assertEqual(record['repeat'], 2)
            self.assertEqual(set(outputs), {case['id'] for case in suite['cases']})
            count += len(suite['cases'])
        self.assertEqual(count, manifest['case_count'])
        self.assertEqual(count, 8)

    def test_explicit_world_original_artifacts_and_plan_are_frozen(self):
        manifest_path = DIRECTORY / 'explicit-world-reference-manifest.json'
        self.assertEqual(hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
                         '749b288db5253f929628cb2a010f742e11faca8d7df3f66e71420884a355df02')
        manifest = decode_json(manifest_path.read_text())
        self.assertEqual(manifest['status'], 'accepted-original-repeat2')
        self.assertIs(manifest['candidate_executed'], False)
        for relative, digest in manifest['files'].items():
            with self.subTest(path=relative):
                path = Path(relative)
                self.assertFalse(path.is_absolute())
                self.assertNotIn('..', path.parts)
                self.assertEqual(hashlib.sha256((DIRECTORY / path).read_bytes()).hexdigest(), digest)
        suite = compare.read_json(DIRECTORY / 'cases/explicit-seven-world-v2.json')
        record = compare.read_json(DIRECTORY / 'observations/smacx-gog-2.0-explicit-seven-world-v2-native-defaults.json')
        outputs = compare.validate_observations(record, suite)
        self.assertEqual(record['repeat'], 2)
        self.assertEqual(len(suite['cases']), 3)
        points = [point for case in suite['cases']
                  for point in validate_reference_output(outputs[case['id']], case['input'])]
        self.assertEqual(len(points), 7)
        for point in points:
            for domain in ('players', 'units', 'bases'):
                self.assertEqual(len(point['state'][domain]), 7)

    def test_frozen_manifest_and_original_artifact_hashes(self):
        manifest_path = DIRECTORY / 'reference-manifest.json'
        self.assertEqual(hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
                         'd60ecb152b3291ae7711b0cc3b159bc5d99861cecaff42fcc05b03306f9db778')
        manifest = decode_json(manifest_path.read_text())
        self.assertEqual(manifest['status'], 'accepted-original-repeat2')
        self.assertIs(manifest['candidate_executed'], False)
        self.assertEqual(len(manifest['records']), 2)
        for relative, digest in manifest['files'].items():
            with self.subTest(path=relative):
                path = Path(relative)
                self.assertFalse(path.is_absolute())
                self.assertNotIn('..', path.parts)
                # Original adapters are opaque bytes here, never imported or executed.
                self.assertEqual(hashlib.sha256((DIRECTORY / path).read_bytes()).hexdigest(), digest)

    def test_all_player_records_bind_inputs_and_cover_every_checkpoint(self):
        for name in SUITES:
            with self.subTest(suite=name):
                suite = compare.read_json(DIRECTORY / 'cases' / (name + '.json'))
                record = compare.read_json(DIRECTORY / 'observations' / ('smacx-gog-2.0-' + name + '.json'))
                outputs = compare.validate_observations(record, suite)
                self.assertEqual(record['repeat'], 2)
                for case in suite['cases']:
                    points = validate_reference_output(outputs[case['id']], case['input'])
                    self.assertEqual([p['state']['turn'] for p in points], [1, 1, 2])
                    first = points[0]['state']
                    roster = {p['id'] for p in first['players']}
                    self.assertEqual(roster, {'player:' + str(i) for i in range(1, 8)})
                    for point in points:
                        state = point['state']
                        self.assertEqual({p['id'] for p in state['players']}, roster)
                        for domain in ('units', 'bases'):
                            self.assertEqual({e['owner'] for e in state[domain]}, roster)
                            self.assertEqual(len(state[domain]), 7)
                            self.assertEqual({e['id'] for e in state[domain]}, {e['id'] for e in first[domain]})
                        if name.endswith('economy-research'):
                            self.assertEqual(set(state['research']), roster)
                            for research in state['research'].values():
                                self.assertEqual(set(research), {'owned_tech_ids', 'target_id', 'accumulated'})
                                self.assertEqual(research['owned_tech_ids'], sorted(set(research['owned_tech_ids'])))
                                self.assertTrue(all(type(i) is int and 0 <= i < 89 for i in research['owned_tech_ids']))
                                self.assertIs(type(research['target_id']), int)
                                self.assertIs(type(research['accumulated']), int)
                            for base in state['bases']:
                                self.assertIs(type(base['resources']['minerals']), int)
                                self.assertEqual(set(base['jobs']), {'workers', 'doctors'})
                                self.assertEqual(sum(base['jobs'].values()), base['population'])
                                self.assertTrue(base['project'])
                    before = {u['id']: u for u in points[1]['state']['units']}
                    after = {u['id']: u for u in points[2]['state']['units']}
                    for identifier, unit in before.items():
                        moved = (unit['x'], unit['y']) != (after[identifier]['x'], after[identifier]['y'])
                        self.assertEqual(moved, unit['owner'] != 'player:1')


if __name__ == '__main__':
    unittest.main()
