"""Bounded owned-city Rename dialog and native name lifecycle."""
from protocol import ProtocolError

ALGORITHM = 'ui.base_rename.v1'
INITIAL = dict(name="Gaia's Landing", workers=0, doctors=1, worked_tiles=0, nutrients=0, minerals=9)
PROFILES = ('default', 'common', 'expansion', 'both')
SOURCE_TEXT = {
    'default': dict(caption='Chief Librarian', prompt='What shall we rename $BASENAME0?', label='Name:'),
    'common': dict(caption='Common Archivist', prompt='Common title for $BASENAME0?', label='Tag:'),
    'expansion': dict(caption='Expansion Archivist', prompt='Expansion title for $BASENAME0?', label='Key:'),
}
SEQUENCES = [
    ('rename-cancel', 'default', ['rename', 'cancel']),
    ('rename-unchanged', 'default', ['rename', 'confirm', 'close', 'open']),
    ('rename-confirm-reopen', 'default', ['rename', {'edit': 'Test Grove'}, 'confirm', 'close', 'open']),
    ('rename-discard-reopen', 'default', ['rename', {'edit': 'Other Grove'}, 'cancel', 'rename', 'cancel']),
    ('rename-empty', 'default', ['rename', {'edit': ''}, 'confirm']),
    ('rename-spaces', 'default', ['rename', {'edit': '  Green Glade  '}, 'confirm']),
    ('rename-long', 'default', ['rename', {'edit': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'}, 'confirm']),
    ('rename-mouse-cancel', 'default', ['rename', {'edit': 'False Grove'}, 'button-cancel']),
    ('rename-common-source', 'common', ['rename', {'edit': 'Common Grove'}, 'button-ok']),
    ('rename-expansion-source', 'expansion', ['rename', {'edit': 'Expansion Grove'}, 'button-ok']),
    ('rename-both-source', 'both', ['rename', {'edit': 'Both Grove'}, 'button-ok']),
]


def validate_input(data):
    if (not isinstance(data, dict) or set(data) != {'profile', 'initial_base', 'text_profile', 'actions'}
            or data['profile'] != 'stacked' or data['initial_base'] != INITIAL
            or any(type(data['initial_base'][key]) is not int for key in INITIAL if key != 'name')
            or not any(data['text_profile'] == profile and data['actions'] == actions for _, profile, actions in SEQUENCES)):
        raise ProtocolError('Unsupported bounded Rename input')


def text(value, blank=False):
    return isinstance(value, str) and (blank or bool(value)) and len(value) <= 256 and all(32 <= ord(c) < 127 for c in value)


def validate_output(output, actions):
    if not isinstance(output, dict) or set(output) != {'trace'} or not isinstance(output['trace'], list) or len(output['trace']) != len(actions) + 1:
        raise ProtocolError('Incomplete Rename trace')
    for index, state in enumerate(output['trace']):
        if (not isinstance(state, dict) or set(state) != {'after_action', 'screen', 'title', 'year_delta', 'selected', 'base', 'units', 'dialog'}
                or type(state['after_action']) is not int or state['after_action'] != index - 1
                or type(state['year_delta']) is not int or state['year_delta'] != 0
                or state['screen'] not in ('base', 'rename', 'map')
                or state['selected'] not in (None, 'scout', 'former', 'colony')):
            raise ProtocolError('Invalid Rename checkpoint context')
        if (state['screen'] == 'map' and state['title'] is not None
                or state['screen'] != 'map' and not text(state['title'], blank=True)):
            raise ProtocolError('Incomplete Rename management title')
        base = state['base']
        if (not isinstance(base, dict) or set(base) != {'name', 'population', 'workers', 'doctors', 'worked_tiles', 'owned_count'}
                or not text(base['name'], blank=True)
                or any(type(base[key]) is not int or not 0 <= base[key] <= 3 for key in base if key != 'name')
                or base['owned_count'] != 1 or base['population'] != base['workers'] + base['doctors']
                or base['worked_tiles'] > base['workers']):
            raise ProtocolError('Invalid Rename native city')
        units = state['units']
        if not isinstance(units, list) or len(units) != 3: raise ProtocolError('Incomplete Rename companions')
        for unit, role in zip(units, ('scout', 'former', 'colony'), strict=True):
            if (not isinstance(unit, dict) or set(unit) != {'role', 'order_code', 'movement_spent'} or unit['role'] != role
                    or type(unit['order_code']) is not int or not 0 <= unit['order_code'] <= 2
                    or type(unit['movement_spent']) is not int or not 0 <= unit['movement_spent'] <= 3):
                raise ProtocolError('Invalid Rename native unit')
        dialog = state['dialog']
        if state['screen'] != 'rename':
            if dialog is not None: raise ProtocolError('Rename controls outside actual dialog')
        elif (not isinstance(dialog, dict) or set(dialog) != {'caption', 'prompt', 'label', 'value', 'buttons'}
                or any(not text(dialog[key]) for key in ('caption', 'prompt', 'label'))
                or not text(dialog['value'], blank=True) or not isinstance(dialog['buttons'], list)
                or len(dialog['buttons']) != 2 or any(not text(value) for value in dialog['buttons'])):
            raise ProtocolError('Incomplete actual Rename controls')
