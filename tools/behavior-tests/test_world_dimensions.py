"""Original field identity and candidate dimensions must remain observations."""
import json
from pathlib import Path
import struct
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from protocol import ProtocolError
from ui import world_dimensions_contract as contract
from ui import world_dimensions_original as original
from ui import world_dimensions_headless as candidate


def case():
    return {'id': 'probe', 'algorithm': contract.ALGORITHM, 'input': {'horizontal': '30', 'vertical': '49'}}


class WorldDimensionsTests(unittest.TestCase):
    def test_input_schema_rejects_answers_and_noncanonical_values(self):
        base = case()['input']
        for value in (None, {}, dict(base, expected_width=60), dict(base, horizontal=30), dict(base, vertical=True),
                      dict(base, horizontal='030'), dict(base, vertical='1'), dict(base, vertical='257')):
            with self.assertRaises(ProtocolError):
                contract.validate_input(value)
        for value in ('2', '49', '256'):
            contract.validate_input(dict(base, vertical=value))

    def test_candidate_preserves_actual_unexpected_fields(self):
        text = 'GRID_RESULT|probe|-1|22|37|11|407\nGRID_DONE|1\nAll tests passed.\n'
        actual = contract.parse_candidate(text, [case()])[0]['output']
        self.assertEqual(actual, {'size_kind': -1, 'width': 22, 'height': 37, 'half_width': 11, 'tile_count': 407})
        for bad in (text.replace('GRID_DONE|1\n', ''), text + 'GRID_RESULT|probe|99|60|49|30|1470\n',
                    text.replace('GRID_DONE|1', 'GRID_DONE|2'), text.replace('probe', 'unknown'),
                    text.replace('|22|', '|022|'), text + 'TEST FAILED', text.replace('All tests passed.', '')):
            with self.assertRaises(ProtocolError):
                contract.parse_candidate(bad, [case()])

    def test_native_reader_uses_five_verified_fields_and_checks_consistency(self):
        values = {'size_kind': 99, 'width': 22, 'height': 37, 'half_width': 11, 'tile_count': 407}
        with tempfile.TemporaryDirectory() as temporary:
            process = Path(temporary)
            (process / 'maps').write_text('00000000-00600000 r-xp 00000000 00:00 1 /owned/game/terranx.exe\n')
            with (process / 'mem').open('wb') as stream:
                stream.write(b'MZ')
                for key, address in original.ADDRESSES.items():
                    stream.seek(address - 0x00400000); stream.write(struct.pack('<i', values[key]))
            driver = SimpleNamespace(work=Path('/owned'))
            with patch.object(original, 'owned_process', return_value=process):
                self.assertEqual(original.read_dimensions(driver), values)
                with (process / 'mem').open('r+b') as stream:
                    stream.seek(original.ADDRESSES['tile_count'] - 0x00400000); stream.write(struct.pack('<i', 408))
                with self.assertRaisesRegex(ProtocolError, 'inconsistent'):
                    original.read_dimensions(driver)

    def test_ambiguous_or_wrong_original_image_is_not_read(self):
        with tempfile.TemporaryDirectory() as temporary:
            process = Path(temporary)
            line = '00000000-00600000 r-xp 00000000 00:00 1 /owned/game/terranx.exe\n'
            for mapping in (line + line, line.replace('/owned', '/other')):
                (process / 'maps').write_text(mapping)
                with patch.object(original, 'owned_process', return_value=process), self.assertRaises(ProtocolError):
                    original.read_dimensions(SimpleNamespace(work=Path('/owned')))

    def test_unknown_original_contract_never_generates_a_world(self):
        with patch('sys.argv', ['original.py', '--assets', '/unused']), \
                patch.object(original, 'load_request', return_value={'cases': [dict(case(), algorithm='unknown.v1')]}), \
                patch.object(original, 'capture') as capture, patch.object(original, 'write_response') as write:
            original.main()
        capture.assert_not_called()
        self.assertEqual(write.call_args.args[1][0]['status'], 'unsupported')

    def test_unknown_candidate_contract_never_executes_native_grids(self):
        with patch('sys.argv', ['candidate.py']), \
                patch.object(candidate, 'load_request', return_value={'cases': [dict(case(), algorithm='unknown.v1')]}), \
                patch.object(candidate, 'headless') as headless, patch.object(candidate, 'write_response') as write:
            candidate.main()
        headless.assert_not_called()
        self.assertEqual(write.call_args.args[1][0]['status'], 'unsupported')

    def test_four_case_inputs_are_distinct_and_cover_even_odd_and_warned_maps(self):
        root = Path(__file__).parent / 'ui'
        cases = json.loads((root / 'cases/custom-grid-dimensions.json').read_text())['cases']
        self.assertEqual(len({row['id'] for row in cases}), 4)
        self.assertEqual({(row['input']['horizontal'], row['input']['vertical']) for row in cases},
                         {('30', '48'), ('30', '49'), ('31', '49'), ('129', '49')})
        for row in cases:
            contract.validate_input(row['input'])


if __name__ == '__main__':
    unittest.main()
