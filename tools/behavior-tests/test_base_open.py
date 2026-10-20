"""Evidence binding and fail-closed base-opening observation transport."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import unittest

from compare import validate_observations
from protocol import ProtocolError
from ui import base_open_contract as contract
from ui.base_open_headless import parse_candidate
from ui.unit_selection_original import fingerprint as fixture_fingerprint

DIRECTORY = Path(__file__).parent / 'ui'


class BaseOpenTests(unittest.TestCase):
    def test_repeated_evidence_binds_inputs_and_unchanged_observer_chain(self):
        suite = json.loads((DIRECTORY / 'cases/base-open-recalc.json').read_text())
        evidence = json.loads((DIRECTORY / 'observations/smacx-gog-2.0-base-open-recalc.json').read_text())
        validate_observations(evidence, suite)
        self.assertEqual(evidence['repeat'], 2)
        self.assertEqual(len(suite['cases']), 2)
        join_hash = hashlib.sha256(fixture_fingerprint().encode() + (DIRECTORY / 'colony_join_original.py').read_bytes()).hexdigest()
        observer_hash = hashlib.sha256(join_hash.encode() + (DIRECTORY / 'base_open_original.py').read_bytes()).hexdigest()
        self.assertEqual(evidence['reference']['adapter_sha256'], observer_hash)
        for case, row in zip(suite['cases'], evidence['observations'], strict=True):
            self.assertEqual(case['algorithm'], contract.ALGORITHM)
            contract.validate_input(case['input'])
            contract.validate_output(row['output'], case['input']['actions'])
        changed = deepcopy(suite)
        changed['cases'][0]['input']['actions'].pop()
        with self.assertRaises(ProtocolError): validate_observations(evidence, changed)

    @staticmethod
    def transport():
        case = dict(id='wire', algorithm=contract.ALGORITHM, input=dict(actions=['open', 'close', 'open', 'close']))
        text = 'BASEOPEN_CASE|wire\n'
        for i in range(5):
            text += (f'BASEOPEN_STATE|{i}|0|colony|map|false\n'
                     'BASEOPEN_BASE|2|1|1|0|0|9\nBASEOPEN_OWNED|1\n'
                     'BASEOPEN_UNIT|scout|0|0\nBASEOPEN_UNIT|former|0|0\nBASEOPEN_UNIT|colony|0|0\n'
                     'BASEOPEN_STATE_DONE\n')
        return [case], text + 'BASEOPEN_CASE_DONE\nAll tests passed.\n'

    def test_transport_keeps_observed_mismatches_and_signed_counter(self):
        cases, text = self.transport()
        # Intentionally map context throughout: parser must not infer a successful
        # opening, title or citizen allocation from the requested actions.
        states = parse_candidate(text, cases)[0]['output']['trace']
        self.assertTrue(all(s['screen'] == 'map' and not s['title_matches_base'] for s in states))
        self.assertTrue(all(s['base']['workers'] == 1 and s['base']['doctors'] == 1 for s in states))
        negative = text.replace('BASEOPEN_BASE|2|1|1|0|0|9', 'BASEOPEN_BASE|2|1|1|0|-1|9')
        self.assertTrue(all(s['base']['nutrients'] == -1 for s in parse_candidate(negative, cases)[0]['output']['trace']))

    def test_citizen_capture_is_fresh_bound_projection_and_preserves_full_counter_evidence(self):
        suite = json.loads((DIRECTORY / 'cases/base-open-citizens.json').read_text())
        evidence = json.loads((DIRECTORY / 'observations/smacx-gog-2.0-base-open-citizens.json').read_text())
        full = json.loads((DIRECTORY / 'observations/smacx-gog-2.0-base-open-recalc.json').read_text())
        validate_observations(evidence, suite)
        self.assertEqual(evidence['repeat'], 2)
        join_hash = hashlib.sha256(fixture_fingerprint().encode() + (DIRECTORY / 'colony_join_original.py').read_bytes()).hexdigest()
        full_hash = hashlib.sha256(join_hash.encode() + (DIRECTORY / 'base_open_original.py').read_bytes()).hexdigest()
        projection_hash = hashlib.sha256((DIRECTORY / 'base_open_citizens_original.py').read_bytes()).hexdigest()
        expected_hash = hashlib.sha256((full_hash + projection_hash).encode()).hexdigest()
        self.assertEqual(evidence['reference']['adapter_sha256'], expected_hash)
        self.assertEqual(evidence['reference']['full_observer_sha256'], full_hash)
        self.assertNotEqual(evidence['captured_at'], full['captured_at'])
        for case, row, raw in zip(suite['cases'], evidence['observations'], full['observations'], strict=True):
            self.assertEqual(case['algorithm'], contract.CITIZENS_ALGORITHM)
            contract.validate_input(case['input'])
            contract.validate_output(row['output'], case['input']['actions'], include_nutrients=False)
            observed_projection = deepcopy(raw['output'])
            for state in observed_projection['trace']:
                del state['base']['nutrients']
            self.assertEqual(row['output'], observed_projection)
            for state in row['output']['trace']:
                self.assertNotIn('nutrients', state['base'])
        self.assertEqual(full['observations'][1]['output']['trace'][2]['base']['nutrients'], -1)

    def test_transport_rejects_missing_duplicate_reordered_or_coerced_fields(self):
        cases, text = self.transport()
        for before, after in [
            ('BASEOPEN_CASE_DONE\n', ''), ('BASEOPEN_OWNED|1\n', ''),
            ('BASEOPEN_STATE|1', 'BASEOPEN_STATE|2'),
            ('BASEOPEN_OWNED|1\n', 'BASEOPEN_OWNED|1\nBASEOPEN_OWNED|1\n'),
            ('|map|false', '|map|0'), ('|map|false', '|unknown|false'),
            ('BASEOPEN_BASE|2|1|1|0|0|9', 'BASEOPEN_BASE|2|1|1|0|-0|9'),
            ('BASEOPEN_BASE|2|1|1|0|0|9', 'BASEOPEN_BASE|2|1|1|0|0.0|9'),
            ('BASEOPEN_BASE|2|1|1|0|0|9', 'BASEOPEN_BASE|2|1|1|0|0|-1'),
            ('BASEOPEN_UNIT|former|0|0', 'BASEOPEN_UNIT|scout|0|0'),
            ('BASEOPEN_UNIT|former|0|0', 'BASEOPEN_UNIT|former|0|4'),
            ('All tests passed.', ''),
        ]:
            with self.subTest(before=before, after=after), self.assertRaises(ProtocolError):
                parse_candidate(text.replace(before, after), cases)

    def test_input_rejects_wider_scope_or_expected_answers(self):
        good = dict(profile='stacked', initial_base=contract.INITIAL.copy(), setup=['wait', 'wait'], actions=contract.SEQUENCES[0].copy())
        contract.validate_input(good)
        for key, value in [('profile', 'spread'), ('setup', ['skip', 'skip']), ('actions', ['open']), ('expected', 'two-doctors')]:
            bad = deepcopy(good); bad[key] = value
            with self.subTest(key=key), self.assertRaises(ProtocolError): contract.validate_input(bad)

    def test_state_rejects_non_integer_or_unbounded_native_counters(self):
        cases, text = self.transport()
        state = parse_candidate(text, cases)[0]['output']['trace'][0]
        for key, value in [('population', True), ('nutrients', -100001), ('minerals', -1), ('worked_tiles', 2), ('owned_count', 2)]:
            bad = deepcopy(state); bad['base'][key] = value
            with self.subTest(key=key), self.assertRaises(ProtocolError): contract.validate_state(bad)
