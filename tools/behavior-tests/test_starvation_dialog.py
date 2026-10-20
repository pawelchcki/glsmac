"""Strict transport and source-profile checks; no generated original answers."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from compare import validate_observations
from protocol import ProtocolError
from ui import starvation_dialog_contract as contract
from ui.starvation_dialog_headless import parse_candidate
from ui.starvation_dialog_inputs import declarations, patch_browser_documents, LABEL_COUNT
from ui.starvation_dialog_original import fingerprint, patch_notice


class StarvationContractTests(unittest.TestCase):
    @staticmethod
    def encoded_case(case, output):
        # Transport-only fixture. It never enters a production candidate runner.
        lines = ['STARVE_CASE|' + case['id']]
        for index, state in enumerate(output['trace']):
            lines.append(f"STARVE_STATE|{index}|{state['year_delta']}|{state['screen']}")
            lines.append('STARVE_BASE|' + '|'.join(str(state['base'][key]) for key in ('population', 'workers', 'doctors', 'worked_tiles', 'owned_count')))
            for unit in state['units']:
                lines.append(f"STARVE_UNIT|{unit['role']}|{unit['order_code']}|{unit['movement_spent']}")
            dialog = state['dialog']
            if dialog is not None:
                lines += ['STARVE_NAME|Fixture Landing', 'STARVE_CAPTION|' + dialog['caption'], 'STARVE_BODY|' + dialog['body'].replace('{BASE}', 'Fixture Landing')]
                lines += ['STARVE_CHOICE|' + value for value in dialog['choices']]
                lines += ['STARVE_SELECTED|' + str(dialog['selected'])]
                lines += ['STARVE_BUTTON|' + value for value in dialog['buttons']]
            lines.append('STARVE_STATE_DONE')
        return '\n'.join(lines + ['STARVE_CASE_DONE', 'All tests passed.', ''])

    def test_independent_original_evidence_and_observer_binding(self):
        root = Path(__file__).parent / 'ui'
        suite = json.loads((root / 'cases/starvation-dialog.json').read_text())
        evidence = json.loads((root / 'observations/smacx-gog-2.0-starvation-dialog.json').read_text())
        validate_observations(evidence, suite)
        self.assertEqual(evidence['repeat'], 2)
        self.assertEqual(len(suite['cases']), 5)
        self.assertEqual(evidence['reference']['adapter_sha256'], fingerprint())
        for case, row in zip(suite['cases'], evidence['observations'], strict=True):
            contract.validate_input(case['input'])
            contract.validate_output(row['output'], case['input']['actions'])
        changed = deepcopy(suite)
        changed['cases'][0]['input']['text_profile'] = 'both'
        with self.assertRaises(ProtocolError): validate_observations(evidence, changed)

    def input(self):
        return dict(profile='stacked', initial_base=dict(contract.INITIAL), text_profile='default', actions=['down', 'confirm'])

    def test_declared_sequences_validate(self):
        for profile in contract.PROFILES:
            value = self.input(); value['text_profile'] = profile
            contract.validate_input(value)

    def test_bool_is_not_initial_resource_integer(self):
        value = self.input(); value['initial_base']['nutrients'] = False
        with self.assertRaises(ProtocolError): contract.validate_input(value)

    def test_unobserved_actions_and_profiles_rejected(self):
        for key, replacement in [('actions', ['escape']), ('actions', ['confirm']), ('text_profile', 'guessed')]:
            value = self.input(); value[key] = replacement
            with self.assertRaises(ProtocolError): contract.validate_input(value)

    def test_extra_input_rejected(self):
        value = self.input(); value['expected_population'] = 1
        with self.assertRaises(ProtocolError): contract.validate_input(value)

    def test_source_edit_stays_inside_declared_block(self):
        raw = b'#BEFORE\r\nKeep before.\r\n#STARVE\r\n#xs 320\r\n#wave 24\r\n#caption Fixture\r\nFirst at $BASENAME0!\r\nSecond line.\r\n\r\n#AFTER\r\nKeep after.\r\n'
        result = patch_notice(raw, contract.SOURCE_TEXT['common'])
        self.assertTrue(result.startswith(b'#BEFORE\r\nKeep before.\r\n'))
        self.assertTrue(result.endswith(b'#AFTER\r\nKeep after.\r\n'))
        self.assertIn(b'#xs 320\r\n#wave 24\r\n', result)
        self.assertIn(b'$BASENAME0!', result)

    def test_missing_duplicate_or_wrong_shape_source_rejected(self):
        fixture = b'#STARVE\n#caption Fixture\nOne.\nTwo.\n'
        for raw in (b'#OTHER\n', fixture + fixture, fixture.replace(b'Two.\n', b''), fixture.replace(b'#caption Fixture\n', b'')):
            with self.assertRaises(ProtocolError): patch_notice(raw, contract.SOURCE_TEXT['common'])

    def test_missing_and_reordered_checkpoints_rejected(self):
        for output in ({'trace': []}, {'trace': [{}, {}, {}]}, {'trace': 'not an array'}):
            with self.assertRaises(ProtocolError): contract.validate_output(output, ['down', 'confirm'])

    def test_public_source_profiles_keep_inputs_independent(self):
        default = declarations('default')
        common = declarations('common')
        expansion = declarations('expansion')
        both = declarations('both')
        self.assertNotEqual(default['script.txt'], common['script.txt'])
        self.assertEqual(default['xscript.txt'], common['xscript.txt'])
        self.assertEqual(default['script.txt'], expansion['script.txt'])
        self.assertNotEqual(default['xscript.txt'], expansion['xscript.txt'])
        self.assertEqual(both['script.txt'], common['script.txt'])
        self.assertEqual(both['xscript.txt'], expansion['xscript.txt'])
        self.assertEqual(default['labels.txt'], common['labels.txt'])
        self.assertEqual(expansion['labels.txt'], both['labels.txt'])
        common['script.txt'] = 'mutated'
        self.assertNotEqual(common, declarations('common'))

    def test_public_label_table_has_real_ordinals_and_complete_count(self):
        for profile in contract.PROFILES:
            rows = declarations(profile)['labels.txt'].splitlines()
            self.assertEqual(rows[:2], ['#LABELS', str(LABEL_COUNT)])
            self.assertEqual(len(rows), LABEL_COUNT + 2)
            if profile in ('expansion', 'both'):
                for index, value in contract.EDITED_LABELS.items(): self.assertEqual(rows[index + 2], value)

    def test_missing_actual_notice_is_preserved_as_candidate_error(self):
        cases = [dict(id='fixture', input=self.input(), algorithm=contract.ALGORITHM)]
        rows = parse_candidate('STARVE_CASE|fixture\nSTARVE_ERROR|Missing actual notification\nAll tests passed.\n', cases)
        self.assertEqual(rows, [dict(id='fixture', status='error', reason='Missing actual notification')])

    def test_candidate_transport_rejects_missing_duplicate_or_orphan_cases(self):
        cases = [dict(id='fixture', input=self.input(), algorithm=contract.ALGORITHM)]
        samples = ['All tests passed.\n', 'STARVE_ERROR|orphan\n',
                   'STARVE_CASE|other\nSTARVE_ERROR|bad\nAll tests passed.\n',
                   'STARVE_CASE|fixture\nSTARVE_ERROR|\nAll tests passed.\n',
                   'STARVE_CASE|fixture\nSTARVE_ERROR|bad\nSTARVE_CASE|fixture\nSTARVE_ERROR|bad\nAll tests passed.\n']
        for text in samples:
            with self.assertRaises(ProtocolError): parse_candidate(text, cases)

    def test_candidate_transport_preserves_every_observed_checkpoint_field(self):
        root = Path(__file__).parent / 'ui'
        suite = json.loads((root / 'cases/starvation-dialog.json').read_text())
        evidence = json.loads((root / 'observations/smacx-gog-2.0-starvation-dialog.json').read_text())
        for case, row in zip(suite['cases'], evidence['observations'], strict=True):
            parsed = parse_candidate(self.encoded_case(case, row['output']), [case])
            self.assertEqual(parsed, [dict(id=case['id'], status='ok', output=row['output'])])

    def test_candidate_transport_rejects_incomplete_and_duplicate_state(self):
        root = Path(__file__).parent / 'ui'
        case = json.loads((root / 'cases/starvation-dialog.json').read_text())['cases'][0]
        output = json.loads((root / 'observations/smacx-gog-2.0-starvation-dialog.json').read_text())['observations'][0]['output']
        text = self.encoded_case(case, output)
        samples = [text.replace('STARVE_STATE_DONE\n', '', 1),
                   text.replace('STARVE_SELECTED|0', 'STARVE_SELECTED|0\nSTARVE_SELECTED|0', 1),
                   text.replace('STARVE_SELECTED|0', 'STARVE_SELECTED|2', 1),
                   text.replace('STARVE_CASE_DONE\n', '', 1),
                   text.replace('STARVE_UNIT|former|2|0\n', '', 1),
                   text.replace('STARVE_NAME|Fixture Landing\n', '', 1)]
        for sample in samples:
            with self.assertRaises(ProtocolError): parse_candidate(sample, [case])

    def test_browser_source_edits_preserve_unrelated_startup_documents(self):
        sources = declarations('default')
        for name in ('script.txt', 'xscript.txt'):
            sources[name] = '#OTHER\r\nKeep before.\r\n' + sources[name] + '\r\n#AFTER\r\nKeep after.\r\n'
        default = patch_browser_documents(sources, 'default')
        self.assertEqual(default, sources)
        for profile in ('common', 'expansion', 'both'):
            edited = patch_browser_documents(sources, profile)
            for name, kind in [('script.txt', 'common'), ('xscript.txt', 'expansion')]:
                self.assertTrue(edited[name].startswith('#OTHER\r\nKeep before.\r\n'))
                self.assertTrue(edited[name].endswith('#AFTER\r\nKeep after.\r\n'))
                if profile not in (kind, 'both'): self.assertEqual(edited[name], sources[name])
            if profile == 'common': self.assertEqual(edited['labels.txt'], sources['labels.txt'])
            else:
                before = sources['labels.txt'].splitlines()
                after = edited['labels.txt'].splitlines()
                changed = [i - 2 for i, (a, b) in enumerate(zip(before, after, strict=True)) if a != b]
                self.assertEqual(changed, list(contract.EDITED_LABELS))

    def test_browser_source_edits_reject_ambiguous_or_truncated_documents(self):
        for labels in ('#LABELS\n', '#LABELS\n1131\n', '#LABELS\n2\nOne\nTwo\n'):
            sources = declarations('default'); sources['labels.txt'] = labels
            with self.assertRaises(ProtocolError): patch_browser_documents(sources, 'both')
        for source in ('#OTHER\n', '#STARVE\n#STARVE\n'):
            sources = declarations('default'); sources['script.txt'] = source
            with self.assertRaises(ProtocolError): patch_browser_documents(sources, 'common')


if __name__ == '__main__': unittest.main()
