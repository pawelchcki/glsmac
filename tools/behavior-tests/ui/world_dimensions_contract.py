"""Custom input to generated native grid dimensions, excluding terrain content."""
import re
from protocol import ProtocolError

ALGORITHM = 'map.custom_grid_dimensions.v1'
FIELDS = ('size_kind', 'width', 'height', 'half_width', 'tile_count')


def validate_input(value):
    if not isinstance(value, dict) or set(value) != {'horizontal', 'vertical'}:
        raise ProtocolError('custom grid dimensions require exactly two typed input strings')
    for text in value.values():
        if not isinstance(text, str) or not re.fullmatch('[0-9]{1,3}', text) or str(int(text)) != text or not 2 <= int(text) <= 256:
            raise ProtocolError('custom grid input must be canonical decimal text from 2 through 256')


def validate_output(value):
    if not isinstance(value, dict) or set(value) != set(FIELDS):
        raise ProtocolError('missing actual custom-grid dimension fields')
    if type(value['size_kind']) is not int or value['size_kind'] not in (-1, 0, 1, 2, 3, 4, 99):
        raise ProtocolError('invalid actual size kind')
    for key in FIELDS[1:]:
        if type(value[key]) is not int or not 1 <= value[key] <= 8388608:
            raise ProtocolError('invalid actual grid dimension or count')


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or 'TEST FAILED' in text or 'Unhandled exception' in text:
        raise ProtocolError('custom grid candidate did not complete: ' + text[-2000:])
    rows, done = [], False
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(GRID_[A-Z]+(?:\|.*)?)$', line)
        if not match:
            continue
        if done:
            raise ProtocolError('late custom grid marker')
        parts = match[1].split('|')
        if parts[0] == 'GRID_RESULT' and len(parts) == 7:
            try:
                values = list(map(int, parts[2:]))
            except ValueError as error:
                raise ProtocolError('invalid native grid scalar') from error
            if [str(value) for value in values] != parts[2:]:
                raise ProtocolError('noncanonical native grid scalar')
            output = dict(zip(FIELDS, values))
            validate_output(output)
            rows.append({'id': parts[1], 'status': 'ok', 'output': output})
        elif parts[0] == 'GRID_DONE' and len(parts) == 2 and parts[1] == str(len(cases)):
            done = True
        else:
            raise ProtocolError('invalid custom grid marker')
    if not done or [row['id'] for row in rows] != [case['id'] for case in cases]:
        raise ProtocolError('missing, duplicate or reordered native grid observations')
    return rows
