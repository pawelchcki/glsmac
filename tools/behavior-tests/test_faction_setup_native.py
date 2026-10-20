"""Synthetic memory guards are harness tests, not original behavior evidence."""
import struct
import tempfile
import unittest

from protocol import ProtocolError
from ui import faction_setup_native as native
from ui.faction_setup_contract import validate_input, validate_output


class Memory:
    def __init__(self):
        self.data = {}

    def address(self, value):
        return value

    def put_word(self, address, value):
        self.put(address, struct.pack('<I', value & 0xffffffff))

    def put(self, address, value):
        self.data.update((address + i, byte) for i, byte in enumerate(value))

    def read(self, address, size):
        if not all(address + i in self.data for i in range(size)):
            raise ProtocolError('unmapped synthetic control data')
        return bytes(self.data[address + i] for i in range(size))

    def word(self, address, signed=False):
        return struct.unpack('<i' if signed else '<I', self.read(address, 4))[0]

    def image_word(self, address, signed=False):
        return self.word(address, signed)

    text = native.NativeMemory.text


def fixture():
    memory = Memory()
    nodes = [0x1000000 + i * 64 for i in range(7)]
    memory.put_word(native.ROSTER_HEAD, nodes[0])
    memory.put_word(native.ROSTER_COUNT, 7)
    memory.put_word(native.ROSTER_SELECTION, 2)
    memory.put_word(native.SELECTED_MODE, 1)
    memory.put_word(native.RANDOM_MODE, 0)
    for i, node in enumerate(nodes):
        string, text = 0x2000000 + i * 256, 0x3000000 + i * 256
        for offset, value in ((0, native.NODE_TYPE), (4, i + 1), (8, string),
                              (12, nodes[(i + 1) % 7]), (16, nodes[(i - 1) % 7])):
            memory.put_word(node + offset, value)
        memory.put_word(string, native.STRING_TYPE)
        memory.put_word(string + 4, text)
        memory.put(text, (f'Unexpected row {i}|Actual role').encode().ljust(128, b'\0'))
    return memory, nodes


class FactionNativeTests(unittest.TestCase):
    def test_memory_reads_are_bounded_to_one_owned_writable_mapping(self):
        memory = native.NativeMemory.__new__(native.NativeMemory)
        with tempfile.TemporaryFile() as file:
            file.write(b'abcdefgh'); file.flush()
            memory.file = file
            memory.mappings = [(0, 8, 'rw-p')]
            self.assertEqual(memory.read(2, 3), b'cde')
            for address, size in ((True, 1), (0, True), (-1, 1), (0, 0), (0, 513), (7, 2)):
                with self.subTest(address=address, size=size), self.assertRaises(ProtocolError):
                    memory.read(address, size)
            for mappings in ([(0, 8, 'r--p')], [(0, 8, '-w-p')], [(0, 4, 'rw-p'), (4, 8, 'rw-p')],
                             [(0, 8, 'rw-p'), (0, 8, 'rw-p')]):
                memory.mappings = mappings
                with self.subTest(mappings=mappings), self.assertRaises(ProtocolError):
                    memory.read(2, 4)
            memory.mappings = [(0, 20, 'rw-p')]
            with self.assertRaisesRegex(ProtocolError, 'incomplete'):
                memory.read(7, 4)

    def test_roster_reads_actual_ordered_text_and_separate_mode(self):
        m, _ = fixture()
        before = dict(m.data)
        result = native.FactionControls(m).roster()
        self.assertEqual(result, {'items': [f'Unexpected row {i}|Actual role' for i in range(7)], 'selected': 2, 'random': False})
        self.assertEqual(m.data, before)
        m.put_word(native.RANDOM_MODE, 1); m.put_word(native.SELECTED_MODE, 0)
        self.assertEqual(native.FactionControls(m).roster()['selected'], 2)
        self.assertTrue(native.FactionControls(m).roster()['random'])

    def test_corrupt_lists_cannot_produce_partial_or_expected_answers(self):
        for kind in ('count', 'cycle', 'order', 'backlink', 'node_type', 'string_type', 'selection', 'mode'):
            with self.subTest(kind=kind):
                m, nodes = fixture()
                address, value = {
                    'count': (native.ROSTER_COUNT, 6), 'cycle': (nodes[0] + 12, nodes[0]),
                    'order': (nodes[3] + 4, 1), 'backlink': (nodes[4] + 16, nodes[0]),
                    'node_type': (nodes[5], 0), 'string_type': (0x2000000, 0),
                    'selection': (native.ROSTER_SELECTION, 7), 'mode': (native.RANDOM_MODE, 1),
                }[kind]
                m.put_word(address, value)
                with self.assertRaises(ProtocolError):
                    native.FactionControls(m).roster()

    def test_unterminated_nontext_and_wrong_encoding_values_are_rejected(self):
        for data in (b'x' * 128, b'bad\nvalue\0'.ljust(128, b'\0'), b'\x81\0'.ljust(128, b'\0')):
            m, _ = fixture(); m.put(0x3000000, data)
            with self.assertRaises(ProtocolError):
                native.FactionControls(m).roster()

    def test_focused_editor_preserves_case_without_layout_or_queue_guesses(self):
        m = Memory(); reader = native.FactionControls(m)
        for index, control in enumerate((0x4000000, 0x5123400, 0x6130400)):
            m.put_word(native.FOCUSED_CONTROL, control)
            m.put_word(control, native.EDIT_TYPE)
            m.put(control + native.EDIT_VALUE, f'Case Kept {index}'.encode().ljust(128, b'\0'))
            before = dict(m.data)
            self.assertEqual(reader.focused_value(), f'Case Kept {index}')
            self.assertEqual(m.data, before)
            m.put_word(control, 0)
            with self.assertRaises(ProtocolError):
                reader.focused_value()

    def test_noneditor_focus_cannot_supply_a_text_value(self):
        m = Memory(); m.put_word(native.FOCUSED_CONTROL, 0x4000000); m.put_word(0x4000000, 1)
        with self.assertRaises(ProtocolError):
            native.FactionControls(m).focused_value()

    def test_action_schema_contains_inputs_only_and_preserves_empty_text(self):
        valid = {'profile': 'default', 'actions': [{'edit': {'field': 0, 'text': ''}}, {'roster': {'slot': 6, 'option': 14}}, {'mode': 'random'}]}
        validate_input(valid)
        for value in (dict(valid, expected=True), dict(valid, profile='guessed'),
                      dict(valid, actions=[{'slot': True}]), dict(valid, actions=[{'slot': 7}]),
                      dict(valid, actions=[{'edit': {'field': 7, 'text': 'Nova'}}]),
                      dict(valid, actions=[{'edit': {'field': 0, 'text': 'a\nb'}}]),
                      dict(valid, actions=[{'roster': {'slot': 0, 'option': 15}}])):
            with self.assertRaises(ProtocolError):
                validate_input(value)

    def test_missing_checkpoints_and_wrong_screen_shapes_are_not_matches(self):
        case = {'input': {'profile': 'default', 'actions': []}}
        frame = {'screen': 'name', 'caption': 'ACTUAL CAPTION', 'items': [], 'selected': -1,
                 'random': False, 'labels': ['ACTUAL LABEL'], 'values': ['Case Preserved'], 'buttons': ['OK', 'CANCEL']}
        validate_output({'trace': [frame]}, case)
        for output in ({'trace': []}, {'trace': [dict(frame, values=[])]}, {'trace': [dict(frame, screen='expected')]}, {'trace': [frame, frame]}):
            with self.assertRaises(ProtocolError):
                validate_output(output, case)


if __name__ == '__main__':
    unittest.main()
