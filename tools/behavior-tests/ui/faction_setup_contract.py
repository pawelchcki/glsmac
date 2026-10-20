"""Bounded faction-roster and leader-editor controls; no generated-world claim."""
from protocol import ProtocolError
from ui.vision import normalize

ALGORITHM = 'ui.faction_setup.v1'
PROFILES = ('default', 'common', 'expansion', 'both')
KEYS = ('ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', 'Escape')
BUTTONS = ('OK', 'CANCEL', 'CHANGE NAME', 'RESTORE DEFAULTS', 'CHANGE GENDER')
FRAME_KEYS = {'screen', 'caption', 'items', 'selected', 'random', 'labels', 'values', 'buttons'}


def validate_input(value):
    if not isinstance(value, dict) or set(value) != {'profile', 'actions'} or value['profile'] not in PROFILES:
        raise ProtocolError('faction setup requires a declared profile and actions')
    actions = value['actions']
    if not isinstance(actions, list) or len(actions) > 32:
        raise ProtocolError('faction setup accepts at most 32 control actions')
    for action in actions:
        if not isinstance(action, dict) or len(action) != 1:
            raise ProtocolError('faction setup actions require exactly one control')
        kind, data = next(iter(action.items()))
        valid = False
        if kind == 'key':
            valid = isinstance(data, str) and data in KEYS
        elif kind == 'button':
            valid = isinstance(data, str) and data in BUTTONS
        elif kind in ('slot', 'focus'):
            valid = type(data) is int and 0 <= data < 7
        elif kind == 'preset':
            valid = isinstance(data, str) and data in ('base', 'expansion')
        elif kind == 'mode':
            valid = isinstance(data, str) and data in ('selected', 'random')
        elif kind == 'roster' and isinstance(data, dict) and set(data) == {'slot', 'option'}:
            valid = type(data['slot']) is int and 0 <= data['slot'] < 7 and type(data['option']) is int and 0 <= data['option'] < 15
        elif kind == 'edit' and isinstance(data, dict) and set(data) == {'field', 'text'}:
            valid = (type(data['field']) is int and 0 <= data['field'] < 7
                     and isinstance(data['text'], str) and len(data['text']) <= 64
                     and all(32 <= ord(char) < 127 and char != '|' for char in data['text']))
        if not valid:
            raise ProtocolError('unknown or malformed faction setup action')


def validate_frame(frame):
    if not isinstance(frame, dict) or set(frame) != FRAME_KEYS:
        raise ProtocolError('incomplete actual faction setup checkpoint')
    screen = frame['screen']
    if screen not in ('factions', 'name', 'customize', 'menu', 'starting'):
        raise ProtocolError('unsupported faction setup screen')
    if not isinstance(frame['caption'], str) or (not frame['caption'] and screen != 'starting') or normalize(frame['caption']) != frame['caption']:
        raise ProtocolError('invalid actual faction caption')
    if type(frame['selected']) is not int or type(frame['random']) is not bool:
        raise ProtocolError('invalid actual faction selection scalar')
    for key in ('items', 'labels', 'values', 'buttons'):
        if not isinstance(frame[key], list) or not all(isinstance(item, str) and '\n' not in item and '\r' not in item for item in frame[key]):
            raise ProtocolError('invalid actual faction control strings')
    if screen == 'factions':
        valid = 0 < len(frame['items']) <= 32 and -1 <= frame['selected'] < len(frame['items']) and not frame['labels'] and not frame['values'] and bool(frame['buttons'])
    elif screen == 'starting':
        valid = not frame['items'] and frame['selected'] == -1 and not frame['random'] and not frame['labels'] and not frame['values'] and not frame['buttons']
    elif screen == 'menu':
        valid = bool(frame['items']) and 0 <= frame['selected'] < len(frame['items']) and not frame['random'] and not frame['labels'] and not frame['values'] and not frame['buttons']
    else:
        count = 1 if screen == 'name' else 7
        valid = (not frame['items'] and frame['selected'] == -1 and not frame['random']
                 and len(frame['labels']) == count and len(frame['values']) == 1 and bool(frame['buttons']))
    if not valid:
        raise ProtocolError('actual faction controls disagree with their screen type')


def validate_output(value, case):
    if not isinstance(value, dict) or set(value) != {'trace'} or not isinstance(value['trace'], list):
        raise ProtocolError('faction setup requires actual control checkpoints')
    if len(value['trace']) != len(case['input']['actions']) + 1:
        raise ProtocolError('missing actual faction setup checkpoints')
    for frame in value['trace']:
        validate_frame(frame)
