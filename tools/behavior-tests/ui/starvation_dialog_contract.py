"""Shape and scope of the first owned-city starvation notification."""
from protocol import ProtocolError

ALGORITHM = 'ui.starvation_dialog.v1'
PROFILES = ('default', 'common', 'expansion', 'both')
INITIAL = {'workers': 0, 'doctors': 1, 'worked_tiles': 0, 'nutrients': 0, 'minerals': 9}
SOURCE_TEXT = {
    'common': {'caption': 'Common Chaplain', 'lines': ['Common warning at $BASENAME0!', 'Common factories await.']},
    'expansion': {'caption': 'Expansion Chaplain', 'lines': ['Expansion warning at $BASENAME0!', 'Expansion factories await.']},
}
EDITED_LABELS = {44: 'Inspect Base Control', 45: 'Carry On', 443: 'Silence This Popup'}


def validate_input(data):
    if not isinstance(data, dict) or set(data) != {'profile', 'initial_base', 'text_profile', 'actions'}:
        raise ProtocolError('Invalid starvation dialog input')
    if data['profile'] != 'stacked' or data['initial_base'] != INITIAL or any(type(v) is not int for v in data['initial_base'].values()):
        raise ProtocolError('Unsupported initial starvation city')
    if data['text_profile'] not in PROFILES or data['actions'] not in (
        ['down', 'confirm'], ['confirm', 'close'], ['down', 'up', 'down', 'confirm'],
    ):
        raise ProtocolError('Unsupported starvation dialog sequence')


def validate_output(output, actions):
    if not isinstance(output, dict) or set(output) != {'trace'} or not isinstance(output['trace'], list) or len(output['trace']) != len(actions) + 1:
        raise ProtocolError('Incomplete starvation dialog trace')
    for index, state in enumerate(output['trace']):
        if not isinstance(state, dict) or set(state) != {'after_action', 'year_delta', 'screen', 'base', 'units', 'dialog'}:
            raise ProtocolError('Invalid starvation checkpoint')
        if type(state['after_action']) is not int or state['after_action'] != index - 1 or type(state['year_delta']) is not int or not 0 <= state['year_delta'] <= 1:
            raise ProtocolError('Invalid starvation checkpoint order/year')
        if state['screen'] not in ('notice', 'base', 'map'):
            raise ProtocolError('Invalid starvation screen')
        base = state['base']
        if not isinstance(base, dict) or set(base) != {'population', 'workers', 'doctors', 'worked_tiles', 'owned_count'} or any(type(v) is not int or not 0 <= v <= 3 for v in base.values()):
            raise ProtocolError('Invalid starvation citizen state')
        if not isinstance(state['units'], list) or len(state['units']) != 2:
            raise ProtocolError('Invalid starvation companions')
        for unit, role in zip(state['units'], ('scout', 'former'), strict=True):
            if not isinstance(unit, dict) or set(unit) != {'role', 'order_code', 'movement_spent'} or unit['role'] != role or type(unit['order_code']) is not int or not 0 <= unit['order_code'] <= 2 or type(unit['movement_spent']) is not int or not 0 <= unit['movement_spent'] <= 3:
                raise ProtocolError('Invalid starvation companion state')
        dialog = state['dialog']
        if state['screen'] != 'notice':
            if dialog is not None: raise ProtocolError('Dialog outside notification')
            continue
        if not isinstance(dialog, dict) or set(dialog) != {'caption', 'body', 'choices', 'selected', 'buttons'}:
            raise ProtocolError('Incomplete starvation notification')
        if any(not isinstance(dialog[k], str) or not dialog[k] for k in ('caption', 'body')) or not isinstance(dialog['choices'], list) or len(dialog['choices']) != 2 or not isinstance(dialog['buttons'], list) or len(dialog['buttons']) != 2:
            raise ProtocolError('Invalid starvation wording')
        if any(not isinstance(v, str) or not v for v in dialog['choices'] + dialog['buttons']) or type(dialog['selected']) is not int or not 0 <= dialog['selected'] <= 1:
            raise ProtocolError('Invalid starvation choices')
