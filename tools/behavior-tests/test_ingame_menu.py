"""Strict public menu inputs and independent observation guard regressions."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest

from protocol import ProtocolError
from ui import ingame_menu_contract as contract
from ui import ingame_menu_inputs as inputs
from ui.ingame_menu_headless import parse_candidate


class IngameMenuContractTests(unittest.TestCase):
    def test_checked_in_cases_are_input_only_generated_sequences(self):
        path = Path(__file__).parent / 'ui/cases/ingame-menus.json'
        self.assertEqual(json.loads(path.read_text()), inputs.suite())
        self.assertEqual(len(inputs.suite()['cases']), 12)
        for case in inputs.suite()['cases']:
            self.assertEqual(set(case), {'id', 'algorithm', 'input'})
            contract.validate_input(case['input'])

    def test_unsupported_actions_profiles_and_boolean_indices_are_rejected(self):
        for key, value in [('actions', ['escape']), ('actions', ['quit']), ('actions', ['menu', {'header': True}]),
                           ('text_profile', 'unknown'), ('profile', 'spread'), ('extra', 1)]:
            data = deepcopy(inputs.suite()['cases'][0]['input'])
            data[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ProtocolError):
                contract.validate_input(data)

    def test_fixture_types_cannot_substitute_boolean_for_integer(self):
        for key in contract.INITIAL:
            data = deepcopy(inputs.suite()['cases'][0]['input'])
            data['initial_base'][key] = True
            with self.subTest(key=key), self.assertRaises(ProtocolError):
                contract.validate_input(data)

    def test_source_overrides_are_independent_inputs(self):
        first = inputs.declarations('synthetic')['menu.txt']
        edited = inputs.declarations('game-edited')['menu.txt']
        self.assertIn('&Game Entry Two|Key Two', first)
        self.assertIn('&Compact Choices|Key Two', edited)
        self.assertIn('#GAME\n&Core\n', edited)
        self.assertIn('&Depart|Key Thirteen', edited)
        self.assertEqual(first.split('#HQ')[1], edited.split('#HQ')[1])
        for identifier, title, count in contract.MENU_SPECS:
            block = first.split('#' + identifier + '\n')[1].split('\n#')[0].strip().splitlines()
            self.assertEqual(block[0], title)
            self.assertEqual(len(block[1:]), count)
        with self.assertRaises(ProtocolError):
            inputs.declarations('unknown')

    def test_dynamic_terrain_labels_are_declared_public_inputs(self):
        first = inputs.declarations('synthetic')['alphax.txt']
        self.assertEqual(first, inputs.declarations('game-edited')['alphax.txt'])
        lines = first.splitlines()
        self.assertEqual((lines[0], lines[-1], len(lines)), ('#TERRAIN', '#END', 22))
        for index, line in enumerate(lines[1:-1]):
            self.assertEqual(line.split(','), [f'Site {inputs.WORDS[index]}', 'None', f'Water {inputs.WORDS[index]}',
                                               'None', '4', 'Shape $STR0', 'q', 'Q'])

    def test_original_terrain_patch_preserves_unrelated_installed_rules(self):
        from ui.ingame_menu_original import patch_terrain
        before = b'#BEFORE\r\nUnrelated input.\r\n'
        after = b'#AFTER\r\nPreserve this.\r\n'
        raw = before + b'#TERRAIN\r\nOld,fixture\r\n; comment\r\n' + after
        declaration = inputs.declarations('synthetic')['alphax.txt']
        patched = patch_terrain(raw, declaration)
        self.assertTrue(patched.startswith(before))
        self.assertTrue(patched.endswith(after))
        self.assertIn(b'Site Twenty,None,Water Twenty,None,4,Shape $STR0,q,Q\r\n', patched)
        self.assertNotIn(b'#END', patched)
        for bad in (before, raw + raw):
            with self.assertRaises(ProtocolError):
                patch_terrain(bad, declaration)

    def output(self):
        # Deliberately arbitrary observations. A schema must not supply the
        # transitions or menu contents implied by the requested actions.
        state = dict(after_action=-1, screen='menu', year_delta=0, selected='former',
                     base=dict(name='  MiXeD City  ', population=2, workers=1, doctors=1, worked_tiles=0, owned_count=1),
                     units=[dict(role=role, order_code=1, movement_spent=2) for role in ('scout', 'former', 'colony')],
                     menu=dict(headers=[dict(label='ARBITRARY', active=i == 8) for i in range(9)],
                               child=dict(header_index=8, rows=[dict(label='UNRELATED OBSERVATION', tone='dark'),
                                                               dict(separator=True), dict(label='OTHER', tone='light')])))
        actions = inputs.suite()['cases'][0]['input']['actions']
        return dict(trace=[dict(deepcopy(state), after_action=i-1) for i in range(len(actions)+1)]), actions

    def test_output_validation_does_not_derive_answers_from_actions(self):
        output, actions = self.output()
        contract.validate_output(output, actions)
        for row in output['trace']:
            row['screen'] = 'map'
            row['menu'] = None
        contract.validate_output(output, actions)
        self.assertEqual(output['trace'][0]['base']['name'], '  MiXeD City  ')

    def test_missing_native_context_rows_or_checkpoints_are_rejected(self):
        mutations = [lambda out: out['trace'].pop(),
                     lambda out: out['trace'][0]['units'].pop(),
                     lambda out: out['trace'][0]['menu']['headers'].pop(),
                     lambda out: out['trace'][0]['menu']['child']['rows'].append({'separator': False}),
                     lambda out: out['trace'][0]['base'].update(population=3),
                     lambda out: out['trace'][0].update(year_delta=1),
                     lambda out: out['trace'][0].update(screen='map')]
        for mutation in mutations:
            output, actions = self.output()
            mutation(output)
            with self.assertRaises(ProtocolError):
                contract.validate_output(output, actions)

    def encode(self, case, output):
        lines = ['IMENU_CASE|' + case['id']]
        for index, state in enumerate(output['trace']):
            lines.append(f"IMENU_STATE|{index}|{state['screen']}|0|{state['selected'] or 'none'}")
            lines.append('IMENU_NAME|' + state['base']['name'])
            lines.append('IMENU_BASE|' + '|'.join(str(state['base'][key]) for key in
                                                ('population', 'workers', 'doctors', 'worked_tiles', 'owned_count')))
            for unit in state['units']:
                lines.append(f"IMENU_UNIT|{unit['role']}|{unit['order_code']}|{unit['movement_spent']}")
            if state['menu'] is not None:
                for header_index, header in enumerate(state['menu']['headers']):
                    lines.append(f"IMENU_HEADER|{header_index}|{str(header['active']).lower()}|{header['label']}")
                child = state['menu']['child']
                if child is not None:
                    lines.append('IMENU_CHILD|' + str(child['header_index']))
                    for row in child['rows']:
                        lines.append('IMENU_SEPARATOR' if 'separator' in row else
                                     'IMENU_ROW|' + ('black' if row['tone'] == 'dark' else 'rgb(176,212,235)') + '|' + row['label'])
            lines.append('IMENU_STATE_DONE')
        return '\n'.join(lines + ['IMENU_CASE_DONE', 'All tests passed.', ''])

    def test_candidate_transport_preserves_arbitrary_native_and_menu_observations(self):
        case = inputs.suite()['cases'][0]
        output, _ = self.output()
        self.assertEqual(parse_candidate(self.encode(case, output), [case]),
                         [dict(id=case['id'], status='ok', output=output)])
        log = self.encode(case, output).replace('IMENU_ROW|black|UNRELATED OBSERVATION',
                                               'IMENU_ROW|black|  mixed   label  ')
        parsed = parse_candidate(log, [case])[0]['output']
        self.assertEqual(parsed['trace'][0]['menu']['child']['rows'][0]['label'], 'MIXED LABEL')
        self.assertEqual(parsed['trace'][0]['base']['name'], '  MiXeD City  ')

    def test_partial_candidate_failure_cannot_be_promoted_to_a_passing_trace(self):
        case = inputs.suite()['cases'][0]
        log = 'IMENU_CASE|' + case['id'] + '\nIMENU_STATE|0|menu|0|scout\nIMENU_ERROR|actual mounted controls missing\nAll tests passed.\n'
        self.assertEqual(parse_candidate(log, [case]),
                         [dict(id=case['id'], status='error', reason='actual mounted controls missing')])

    def test_candidate_rejects_missing_reordered_or_unrecognized_observations(self):
        case = inputs.suite()['cases'][0]
        output, _ = self.output()
        log = self.encode(case, output)
        bad = [log.replace('All tests passed.', ''), log + 'TEST FAILED\n',
               log.replace('IMENU_UNIT|colony|1|2\n', '', 1),
               log.replace('IMENU_HEADER|1|false|', 'IMENU_HEADER|2|false|', 1),
               log.replace('IMENU_ROW|black|', 'IMENU_ROW|unknown-colour|', 1),
               log.replace('IMENU_STATE_DONE\n', '', 1),
               'IMENU_SEPARATOR\n' + log,
               log.replace('IMENU_CASE_DONE\n', 'IMENU_UNKNOWN\nIMENU_CASE_DONE\n')]
        for value in bad:
            with self.assertRaises(ProtocolError):
                parse_candidate(value, [case])

    def test_repeated_reference_is_bound_to_current_inputs_and_observer(self):
        import compare
        from ui.ingame_menu_original import fingerprint
        directory = Path(__file__).parent / 'ui'
        suite = json.loads((directory / 'cases/ingame-menus.json').read_text())
        evidence = json.loads((directory / 'observations/smacx-gog-2.0-ingame-menus.json').read_text())
        compare.validate_observations(evidence, suite)
        self.assertGreaterEqual(evidence['repeat'], 2)
        self.assertEqual(evidence['reference']['adapter_sha256'], fingerprint())
        self.assertEqual(evidence['reference']['contract'], contract.ALGORITHM)
        for case, row in zip(suite['cases'], evidence['observations'], strict=True):
            contract.validate_output(row['output'], case['input']['actions'])
            self.assertEqual(parse_candidate(self.encode(case, row['output']), [case])[0]['output'], row['output'])
        changed = deepcopy(suite)
        changed['cases'][0]['input']['initial_base']['name'] = 'Changed input'
        with self.assertRaises(ProtocolError):
            compare.validate_observations(evidence, changed)

    def test_switching_pilot_is_independent_original_evidence_not_extra_catalog_coverage(self):
        import compare
        from ui.ingame_menu_original import fingerprint
        directory = Path(__file__).parent / 'ui'
        suite = json.loads((directory / 'cases/ingame-menu-switch-pilot.json').read_text())
        evidence = json.loads((directory / 'observations/smacx-gog-2.0-ingame-menu-switch-pilot.json').read_text())
        compare.validate_observations(evidence, suite)
        self.assertEqual(len(suite['cases']), 1)
        self.assertGreaterEqual(evidence['repeat'], 2)
        self.assertEqual(evidence['reference']['adapter_sha256'], fingerprint())
        self.assertEqual(suite['cases'][0], next(case for case in inputs.suite()['cases']
                                               if case['id'] == 'ingame-menu-header-switch'))
        contract.validate_output(evidence['observations'][0]['output'], suite['cases'][0]['input']['actions'])
        catalog = json.loads((directory / 'catalog.json').read_text())
        self.assertNotIn('observations/smacx-gog-2.0-ingame-menu-switch-pilot.json',
                         [row['observations'] for row in catalog['references']])


@unittest.skipUnless(importlib.util.find_spec('PIL'), 'optional original screenshot dependency')
class IngameMenuGeometryTests(unittest.TestCase):
    def reader(self):
        from PIL import Image
        from ui.ingame_menu_vision import IngameMenuVision
        reader = object.__new__(IngameMenuVision)
        reader.vision = SimpleNamespace(Image=Image)
        # Geometry tests use synthetic glyph blobs; OCR supplies no geometry.
        reader.text = lambda mask: 'SYNTHETIC GLYPH'
        return reader

    def test_last_glyph_band_is_not_clipped_by_interrupted_background_run(self):
        from PIL import Image
        image = Image.new('RGB', (1024, 768), (50, 50, 50))
        for y in range(1, 61):
            for x in range(140, 300):
                image.putpixel((x, y), (103, 91, 181) if y % 2 else (28, 80, 99))
        # Last row interrupts every wide purple run. Measuring height from
        # only those runs previously dropped this complete text row.
        for top, tone in [(5, (176, 212, 235)), (45, (0, 0, 0))]:
            for y in range(top, top + 16):
                for x in range(150, 160):
                    image.putpixel((x, y), tone)
        self.assertEqual(self.reader().child(image), [dict(label='SYNTHETIC GLYPH', tone='light'),
                                                    dict(separator=True), dict(label='SYNTHETIC GLYPH', tone='dark')])

    def test_centered_quit_frame_cannot_be_observed_as_map(self):
        from PIL import Image
        from ui.vision import VisionError
        image = Image.new('RGB', (1024, 768))
        for point, colour in [((160, 260), (80, 104, 104)), ((160, 270), (48, 94, 80)), ((500, 263), (13, 23, 36))]:
            image.putpixel(point, colour)
        with self.assertRaisesRegex(VisionError, 'confirmation'):
            self.reader().read(image)


class IngameMenuSetupGuardTests(unittest.TestCase):
    def test_only_the_recognized_pre_action_wizard_timeout_is_retryable(self):
        import tempfile
        from unittest.mock import patch
        from ui import ingame_menu_original as original
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'fixture'
            message = 'original citizen-job observation timed out: ' + str(path / 'base-name.png')
            with patch.object(original.base, 'prepare', side_effect=ProtocolError(message)) as prepare:
                with self.assertRaises(original.rename.InitialManagementUnavailable):
                    original.capture(None, None, None, None, {}, path)
                self.assertEqual(prepare.call_count, 1)

    def test_native_identity_errors_and_other_timeouts_are_not_retryable(self):
        import tempfile
        from unittest.mock import patch
        from ui import ingame_menu_original as original
        for message in ('native identity guard failed', 'original citizen-job observation timed out: wrong-path.png'):
            with tempfile.TemporaryDirectory() as temporary:
                with patch.object(original.base, 'prepare', side_effect=ProtocolError(message)):
                    with self.assertRaises(ProtocolError) as caught:
                        original.capture(None, None, None, None, {}, Path(temporary) / 'fixture')
                    self.assertNotIsInstance(caught.exception, original.rename.InitialManagementUnavailable)


if __name__ == '__main__':
    unittest.main()
