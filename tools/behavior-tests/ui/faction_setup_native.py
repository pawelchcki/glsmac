"""Read actual original roster/edit controls, never source-file answers.

The pinned original image owns the control roots. Heap/stack pointers are
checked against this private process's readable/writable mappings on every read.
No original instructions or process memory are modified.
"""
import os
from pathlib import Path
import struct

from protocol import ProtocolError
from ui.size_kind_original import owned_process

IMAGE_BASE = 0x00400000
IMAGE_SIZE = 0x0060C000
ROSTER_HEAD = 0x0082B8F8
ROSTER_COUNT = 0x0082B900
ROSTER_SELECTION = 0x0082B920
SELECTED_MODE = 0x0082E584
RANDOM_MODE = 0x0082F0D0
FOCUSED_CONTROL = 0x009B663C
NODE_TYPE = 0x006693C8
STRING_TYPE = 0x006693BC
EDIT_TYPE = 0x0066A038
EDIT_VALUE = 0xA14


class NativeMemory:
    def __init__(self, driver):
        process = owned_process(driver)
        self.mappings = []
        image = []
        expected = str(driver.work / 'game/terranx.exe')
        for line in (process / 'maps').read_text().splitlines():
            row = line.split(maxsplit=5)
            start, end = (int(value, 16) for value in row[0].split('-'))
            self.mappings.append((start, end, row[1]))
            if len(row) == 6 and row[2] == '00000000' and row[5] == expected:
                image.append(start)
        if len(image) != 1:
            raise ProtocolError('missing or ambiguous original faction image')
        self.base = image[0]
        self.file = (process / 'mem').open('rb', buffering=0)
        try:
            # The verified executable header is read-only; UI data reads below
            # separately require writable owned mappings.
            if os.pread(self.file.fileno(), 2, self.base) != b'MZ':
                raise ProtocolError('invalid original faction image header')
        except BaseException:
            self.close()
            raise

    def close(self):
        self.file.close()

    def address(self, original):
        return self.base + original - IMAGE_BASE

    def read(self, address, size):
        if type(address) is not int or type(size) is not int or not 0 < size <= 512:
            raise ProtocolError('unbounded original faction read')
        matches = [(start, end, flags) for start, end, flags in self.mappings
                   if start <= address and address + size <= end and 'r' in flags and 'w' in flags]
        if len(matches) != 1:
            raise ProtocolError('original faction pointer is outside owned writable data')
        raw = os.pread(self.file.fileno(), size, address)
        if len(raw) != size:
            raise ProtocolError('incomplete original faction read')
        return raw

    def word(self, address, signed=False):
        return struct.unpack('<i' if signed else '<I', self.read(address, 4))[0]

    def image_word(self, original, signed=False):
        return self.word(self.address(original), signed)

    def text(self, address):
        raw = self.read(address, 128)
        if b'\0' not in raw:
            raise ProtocolError('unterminated original faction control text')
        try:
            text = raw.split(b'\0', 1)[0].decode('cp1252')
        except UnicodeError as error:
            raise ProtocolError('invalid original faction control encoding') from error
        if any(ord(char) < 32 or ord(char) == 127 for char in text):
            raise ProtocolError('nontext original faction control value')
        return text


class FactionControls:
    def __init__(self, memory):
        self.memory = memory

    def typed(self, address, expected):
        if self.memory.word(address) != self.memory.address(expected):
            raise ProtocolError('unexpected original faction control type')

    def roster(self):
        m = self.memory
        count = m.image_word(ROSTER_COUNT)
        if count != 7:
            raise ProtocolError('original faction roster does not contain seven items')
        head = m.image_word(ROSTER_HEAD)
        node, seen, items = head, set(), []
        for index in range(count):
            if node in seen:
                raise ProtocolError('premature original faction list cycle')
            seen.add(node)
            self.typed(node, NODE_TYPE)
            if m.word(node + 4) != index + 1:
                raise ProtocolError('invalid original faction item order')
            previous, following = m.word(node + 0x10), m.word(node + 0x0C)
            if m.word(previous + 0x0C) != node or m.word(following + 0x10) != node:
                raise ProtocolError('inconsistent original faction list links')
            string = m.word(node + 8)
            self.typed(string, STRING_TYPE)
            items.append(m.text(m.word(string + 4)))
            node = following
        if node != head:
            raise ProtocolError('unterminated original faction roster')
        selected = m.image_word(ROSTER_SELECTION, signed=True)
        selected_mode, random_mode = m.image_word(SELECTED_MODE), m.image_word(RANDOM_MODE)
        if selected not in range(-1, 7) or (selected_mode, random_mode) not in ((1, 0), (0, 1)):
            raise ProtocolError('invalid original faction selection/mode')
        return {'items': items, 'selected': selected, 'random': bool(random_mode)}

    def focused_value(self):
        m = self.memory
        control = m.image_word(FOCUSED_CONTROL)
        self.typed(control, EDIT_TYPE)
        return m.text(control + EDIT_VALUE)
