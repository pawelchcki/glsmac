"""Strict warning protocol and observation guards; no expected game answers."""
import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

from protocol import ProtocolError
from ui import large_map_contract as contract
from ui import large_map_original as original
from ui import large_map_headless as candidate
from ui.vision import VisionError


def case(actions=()):
    return {'id': 'probe', 'algorithm': contract.ALGORITHM,
            'input': {'route': 'random', 'horizontal': '129', 'vertical': '80', 'submit': 'OK',
                      'actions': list(actions), 'text_profile': 'default'}}


def trace(actions=()):
    result = ('WARN_BEGIN|probe|edited|99|true\nWARN_DIMENSION|ACTUAL CAPTION|17|29\nWARN_END\n'
              'WARN_BEGIN|probe|submit|-1|true\nWARN_MENU|ACTUAL MENU\n'
              'WARN_ENTRY|0|true|FIRST\nWARN_ENTRY|1|false|SECOND\nWARN_END\n')
    for index, _ in enumerate(actions):
        result += (f'WARN_BEGIN|probe|action-{index}|-1|false\nWARN_MENU|ACTUAL MENU\n'
                   'WARN_ENTRY|0|true|FIRST\nWARN_ENTRY|1|false|SECOND\nWARN_END\n')
    return result + 'WARN_DONE|probe\nWARN_COMPLETE|1\nAll tests passed.\n'


class LargeMapTests(unittest.TestCase):
    def test_input_schema_bounds_and_action_order_are_explicit(self):
        base = case()['input']
        for update in ({'horizontal': 129}, {'vertical': True}, {'horizontal': '01'}, {'vertical': '257'},
                       {'horizontal': '1'}, {'horizontal': '+2'}, {'vertical': '2.0'}, {'actions': 'Enter'},
                       {'actions': ['unknown']}, {'actions': ['Enter', 'ArrowDown']}, {'actions': ['Home'] * 7},
                       {'text_profile': 'unknown'}, {'expected': 'warning'}, {'route': 'imported'}):
            with self.subTest(update=update), self.assertRaises(ProtocolError):
                contract.validate_input(dict(base, **update))
        for value in ('2', '128', '129', '256'):
            contract.validate_input(dict(base, horizontal=value, vertical=value))

    def test_actual_values_kind_and_unavailable_controls_are_preserved(self):
        row = contract.parse_candidate(trace(['Escape']), [case(['Escape'])])[0]['output']['trace']
        self.assertEqual(row[0]['screen']['values'], ['17', '29'])
        self.assertEqual(row[0]['screen']['caption'], 'ACTUAL CAPTION')
        self.assertEqual(row[1]['size_kind'], -1)
        self.assertFalse(row[2]['available'])
        self.assertEqual(row[2]['screen']['selected'], ['FIRST'])

    def test_missing_reordered_duplicate_and_late_markers_fail(self):
        text = trace()
        for value in (text.replace('WARN_END\n', '', 1), text.replace('WARN_DONE|probe\n', ''),
                      text.replace('WARN_BEGIN|probe|submit', 'WARN_BEGIN|other|submit'),
                      text.replace('WARN_BEGIN|probe|edited', 'WARN_BEGIN|probe|submit'),
                      text.replace('WARN_COMPLETE|1', 'WARN_COMPLETE|0'), text + 'WARN_END\n',
                      text.replace('WARN_DONE|probe', 'WARN_DONE|other')):
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                contract.parse_candidate(value, [case()])

    def test_malformed_native_state_and_highlight_fail(self):
        text = trace()
        for value in (text.replace('|99|true', '|099|true'), text.replace('|99|true', '|98|true'),
                      text.replace('|99|true', '|99|1'), text.replace('0|true|FIRST', '2|true|FIRST'),
                      text.replace('1|false|SECOND', '1|true|SECOND'), text.replace('17|29', '17|'),
                      text.replace('WARN_MENU|ACTUAL MENU', 'WARN_SURPRISE|ACTUAL MENU')):
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                contract.parse_candidate(value, [case()])

    def test_worker_failure_cannot_count_as_candidate_output(self):
        for value in (trace().replace('All tests passed.', ''), trace() + 'TEST FAILED', trace() + 'Unhandled exception'):
            with self.assertRaises(ProtocolError):
                contract.parse_candidate(value, [case()])

    def test_warning_markers_observe_choices_and_confirmation_button(self):
        text = trace().replace('WARN_MENU|ACTUAL MENU', 'WARN_WARNING|ACTUAL NOTICE')
        text = text.replace('WARN_END\nWARN_DONE', 'WARN_BUTTON|0|ACTUAL OK\nWARN_END\nWARN_DONE')
        screen = contract.parse_candidate(text, [case()])[0]['output']['trace'][1]['screen']
        self.assertEqual(screen['kind'], 'large-map-warning')
        self.assertEqual(screen['buttons'], ['ACTUAL OK'])
        for broken in (text.replace('WARN_BUTTON|0|ACTUAL OK\n', ''), text.replace('WARN_BUTTON|0|', 'WARN_BUTTON|1|')):
            with self.assertRaises(ProtocolError):
                contract.parse_candidate(broken, [case()])

    def test_original_selection_uses_observed_focused_and_unfocused_paint(self):
        reader = original.WarningVision(Mock())
        reader.dialog.read_region = Mock(side_effect=lambda image, box, **kwargs: {
            original.WARNING_ROWS[0]: 'OBSERVED ONE', original.WARNING_ROWS[1]: 'OBSERVED TWO',
            (345, 497, 1012, 521): 'OBSERVED CAPTION', (650, 731, 705, 748): 'OBSERVED BUTTON'}[box])
        for colors, selected in original.WarningVision.PALETTES.items():
            image = Mock(size=(1024, 768))
            image.getpixel.side_effect = lambda point: colors[0 if point[1] == 685 else 1]
            result = reader.read(image)
            self.assertEqual(result['selected'], [result['entries'][selected]])
            self.assertEqual(result['caption'], 'OBSERVED CAPTION')
            self.assertEqual(result['buttons'], ['OBSERVED BUTTON'])

    def test_unknown_selection_paint_is_not_guessed(self):
        reader = original.WarningVision(Mock())
        reader.dialog.read_region = Mock()
        image = Mock(size=(1024, 768))
        image.getpixel.return_value = (0, 0, 0)
        with self.assertRaises(VisionError):
            reader.read(image)
        reader.dialog.read_region.assert_not_called()

    def test_edited_value_crops_do_not_depend_on_expected_digits_or_lengths(self):
        reader = original.WarningVision(Mock())
        reader.dialog.read_region = Mock(return_value='ACTUAL DIALOG')
        reader.numeric_region = Mock(side_effect=['12345', '7'])
        origins = [(424, 665, 440, 685), (424, 688, 440, 708)]
        result = reader.edited(Mock(), origins)
        self.assertEqual(result['values'], ['12345', '7'])
        self.assertEqual(reader.numeric_region.call_args_list[0].args[1], (423, 663, 1007, 686))
        self.assertEqual(reader.numeric_region.call_args_list[1].args[1], (423, 687, 1007, 711))

    def test_numeric_mask_removes_only_full_height_caret(self):
        try:
            from PIL import Image, ImageOps
        except ImportError:
            self.skipTest('optional image observation dependencies are absent')
        vision = Mock(Image=Image, ImageOps=ImageOps)
        reader = original.WarningVision(vision)
        source = Image.new('RGB', (12, 24), (0, 0, 0))
        for y in range(6, 18):
            source.putpixel((3, y), (120, 164, 212))
        for y in range(2, 22):
            source.putpixel((9, y), (120, 164, 212))
        def read(mask):
            scale = mask.width // (12 + 16)
            self.assertEqual(mask.getpixel(((3 + 8) * scale, (7 + 8) * scale)), 0)
            self.assertEqual(mask.getpixel(((9 + 8) * scale, (7 + 8) * scale)), 255)
            return '7'
        vision.text.side_effect = read
        self.assertEqual(reader.numeric_region(source, (0, 0, 12, 24)), '7')

    def test_controlled_source_patch_preserves_body_and_neighbor_blocks(self):
        raw = b'#BEFORE\r\ntext\r\n#VERYLARGEMAP\r\n#caption Warning!\r\n#xs 440\r\nSynthetic paragraph.\r\n^\r\nAnother paragraph.\r\nContinue anyway.\r\nNever mind.\r\n#AFTER\r\nunchanged\r\n'
        patched = original.patch_warning(raw, ('Synthetic Caption', 'First action.', 'Second action.'))
        self.assertEqual(patched, raw.replace(b'#caption Warning!', b'#caption Synthetic Caption')
                         .replace(b'Continue anyway.', b'First action.').replace(b'Never mind.', b'Second action.'))
        for broken in (raw.replace(b'#VERYLARGEMAP', b'#OTHER'), raw.replace(b'Never mind.', b'unknown'),
                       raw.replace(b'#caption Warning!', b'#caption One\r\n#caption Two')):
            with self.assertRaises(ProtocolError):
                original.patch_warning(broken, ('A', 'B', 'C'))

    def test_unknown_contract_never_launches_original(self):
        with patch('sys.argv', ['original.py', '--assets', '/unused']), \
                patch.object(original, 'load_request', return_value={'cases': [dict(case(), algorithm='unknown.v1')]}), \
                patch.object(original, 'capture') as capture, patch.object(original, 'write_response') as write:
            original.main()
        capture.assert_not_called()
        self.assertEqual(write.call_args.args[1][0]['status'], 'unsupported')

    def test_unknown_contract_never_launches_candidate_engine(self):
        with patch('sys.argv', ['candidate.py']), \
                patch.object(candidate, 'load_request', return_value={'cases': [dict(case(), algorithm='unknown.v1')]}), \
                patch.object(candidate, 'headless') as headless, patch.object(candidate, 'write_response') as write:
            candidate.main()
        headless.assert_not_called()
        self.assertEqual(write.call_args.args[1][0]['status'], 'unsupported')

    def test_inputs_cover_both_routes_source_profiles_and_all_actions(self):
        path = Path(__file__).parent / 'ui/cases/large-map-warning.json'
        cases = json.loads(path.read_text())['cases']
        self.assertEqual(len(cases), 68)
        self.assertEqual(len({row['id'] for row in cases}), len(cases))
        for row in cases:
            contract.validate_input(row['input'])
        for route in ('random', 'custom'):
            values = [row['input'] for row in cases if row['input']['route'] == route]
            self.assertEqual({value['text_profile'] for value in values}, set(contract.PROFILES))
            self.assertEqual({action for value in values for action in value['actions']}, set(contract.ACTIONS))
            self.assertTrue(any(value['vertical'] == '129' for value in values))

    def test_additive_navigation_probes_preserve_independent_case_identity(self):
        root = Path(__file__).parent / 'ui/cases'
        initial = json.loads((root / 'large-map-warning.json').read_text())['cases']
        extra = json.loads((root / 'large-map-warning-navigation.json').read_text())['cases']
        self.assertEqual(len(extra), 10)
        self.assertEqual(len({row['id'] for row in initial + extra}), 78)
        for row in extra:
            contract.validate_input(row['input'])
        self.assertEqual({tuple(row['input']['actions']) for row in extra},
                         {('ArrowDown', 'ArrowDown'), ('ArrowDown', 'ArrowUp', 'ArrowUp'),
                          ('ArrowDown', 'Home'), ('ArrowDown', 'End'), ('ArrowUp', 'ArrowUp')})

    def test_odd_height_continuations_add_independent_inputs(self):
        root = Path(__file__).parent / 'ui/cases'
        cases = json.loads((root / 'large-map-warning-odd-heights.json').read_text())['cases']
        self.assertEqual(len(cases), 6)
        for row in cases:
            contract.validate_input(row['input'])
        for route in ('random', 'custom'):
            selected = [row['input'] for row in cases if row['input']['route'] == route]
            self.assertEqual({(row['horizontal'], row['vertical'], tuple(row['actions'])) for row in selected},
                             {('30', '49', ()), ('80', '129', ('Enter',)), ('129', '129', ('Enter',))})


if __name__ == '__main__':
    unittest.main()
