"""Synthetic source override inputs stay separate from observed answers."""
import json
import hashlib
from pathlib import Path
import unittest

import compare
from protocol import ProtocolError
from ui.faction_setup_sources import script_override, cyborg_override, rewrite_block
from ui.generate_faction_setup import make_suite, make_random_suite


class FactionSourceTests(unittest.TestCase):
    def test_historical_record_is_immutable_and_fresh_recapture_only_resolves_six_label_glyphs(self):
        directory = Path(__file__).resolve().parent / 'ui'
        historical = directory / 'observations/smacx-gog-2.0-faction-setup.json'
        self.assertEqual(hashlib.sha256(historical.read_bytes()).hexdigest(),
                         '95e30cb940149c79f7799dec147e5bf4dec8dfe44f37cbb83a4af836a334b2a3')
        old = compare.read_json(historical)
        new = compare.read_json(directory / 'observations/smacx-gog-2.0-faction-setup-v2.json')
        changed = []
        for before, after in zip(old['observations'], new['observations']):
            self.assertEqual(before['id'], after['id'])
            differences = compare.differences(before['output'], after['output'])
            if differences:
                self.assertEqual(len(differences), 1)
                self.assertTrue(differences[0]['path'].endswith('["labels"][0]'))
                changed.append(before['id'])
        self.assertEqual(set(changed), {'faction-base-1-editors', 'faction-base-2-editors', 'faction-base-6-editors',
                                      'faction-expansion-2-editors', 'faction-expansion-4-editors', 'faction-name-case-spaces'})

    def test_input_generator_is_reproducible_and_contains_577_public_checkpoints(self):
        path = Path(__file__).resolve().parent / 'ui/cases/faction-setup.json'
        suite = make_suite()
        self.assertEqual(json.loads(path.read_text()), suite)
        self.assertEqual(len(suite['cases']), 80)
        self.assertEqual(sum(1 + len(case['input']['actions']) for case in suite['cases']), 577)

    def test_additive_original_inputs_and_both_frozen_references_stay_bound(self):
        directory = Path(__file__).resolve().parent / 'ui'
        random = make_random_suite()
        self.assertEqual(json.loads((directory / 'cases/faction-random-customization.json').read_text()), random)
        self.assertTrue({case['id'] for case in random['cases']}.isdisjoint({case['id'] for case in make_suite()['cases']}))
        count, checkpoints = 0, 0
        for name in ('faction-setup', 'faction-random-customization'):
            suite = compare.read_json(directory / f'cases/{name}.json')
            recording = 'faction-setup-v2' if name == 'faction-setup' else name
            evidence = compare.read_json(directory / f'observations/smacx-gog-2.0-{recording}.json')
            compare.validate_observations(evidence, suite)
            count += len(suite['cases'])
            checkpoints += sum(len(case['input']['actions']) + 1 for case in suite['cases'])
        self.assertEqual((count, checkpoints), (82, 603))

    def test_overrides_change_only_declared_dialog_records(self):
        source = '\n'.join(['#BEFORE', 'Preserved before.', '#NAME', '#caption Old pilot', '#button Old action', 'Name (Male):',
                            '#NAME2', '#caption Old pilot', '#button Old action', 'Name (Female):',
                            '#NAME3', '#caption Old pilot', 'Name:', '#CUSTOMNAMES', '#caption Old crew',
                            '#button Old reset', '#AFTER', 'Preserved after.', '#END', '']).encode('latin1')
        changed = script_override(source, 'Synthetic').decode('latin1')
        self.assertIn('#BEFORE\nPreserved before.\n', changed)
        self.assertIn('#AFTER\nPreserved after.\n#END', changed)
        self.assertEqual(changed.count('#caption Synthetic Pilot'), 3)
        self.assertEqual(changed.count('#button Synthetic Style'), 2)
        self.assertIn('Synthetic Male:', changed)
        self.assertIn('Synthetic Female:', changed)
        self.assertIn('Synthetic:\r\n', changed)
        self.assertIn('#caption Synthetic Crew', changed)
        self.assertIn('#button Synthetic Reset', changed)

    def test_missing_duplicate_and_ambiguous_targets_fail_explicitly(self):
        for source in (b'#OTHER\n#caption Other\n', b'#NAME\n#caption A\n#NAME\n#caption B\n',
                       b'#NAME\n#caption A\n#caption B\n'):
            with self.subTest(source=source), self.assertRaises(ProtocolError):
                rewrite_block(source, 'NAME', {'#caption ': 'Synthetic'})

    def test_header_override_preserves_undeclared_columns_and_blocks(self):
        source = ('#CYBORG\nOriginal,Role,Noun,keep3,keep4,Old,F,keep7,8,9,10,11\n'
                  'Row one\nRow two\nRow three\nAdjective,keep-adverb\nRow five\nTitle,Description,keep-style\n'
                  '#OTHER\nPreserved body.\n#END\n').encode('latin1')
        result = cyborg_override(source).decode('latin1')
        self.assertIn('Orbit Guild, Orbit Agenda, Orbiters, keep3, keep4, Nova, M, keep7, 8, 9, 10, 11', result)
        self.assertIn('Orbital, keep-adverb', result)
        self.assertIn('Navigator, brisk, keep-style', result)
        self.assertIn('#OTHER\nPreserved body.\n#END', result)
