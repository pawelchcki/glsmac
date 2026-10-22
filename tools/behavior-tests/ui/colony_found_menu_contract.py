"""Bounded free-tile Colony Action naming, cancellation and confirmation."""
from protocol import ProtocolError
from ui.ingame_menu_contract import INITIAL, text

ALGORITHM = 'ui.colony_found_menu.v1'
PROFILES = ('synthetic', 'found-edited')
SEQUENCES = {
    'synthetic': ['menu', {'header': 4}, {'row_source': 0}, {'edit': 'Birch Gate'},
                  'button-cancel', {'header': 4}, {'row_source': 0}, {'edit': 'Cedar Reach'}, 'button-ok'],
    'found-edited': ['menu', {'header': 4}, {'row_source': 0}, {'edit': 'Elm Vale'},
                     'cancel', {'header': 4}, {'row_source': 0}, {'edit': 'Maple Haven'}, 'confirm'],
}


def validate_input(data):
    if (not isinstance(data, dict)
            or set(data) != {'profile', 'initial_base', 'text_profile', 'actions'}
            or data['profile'] != 'spread-distant' or data['initial_base'] != INITIAL
            or not isinstance(data['initial_base'], dict)
            or any(type(data['initial_base'][key]) is not int for key in INITIAL if key != 'name')
            or data['text_profile'] not in PROFILES
            or data['actions'] != SEQUENCES[data['text_profile']]
            or any(isinstance(action, dict) and any(type(value) is not int for key, value in action.items()
                                                      if key != 'edit') for action in data['actions'])):
        raise ProtocolError('Unsupported Colony founding menu fixture/actions')


def validate_output(output, actions):
    if (not isinstance(output, dict) or set(output) != {'trace'}
            or not isinstance(output['trace'], list) or len(output['trace']) != len(actions) + 1):
        raise ProtocolError('Incomplete Colony founding trace')
    for state in output['trace']:
        if (not isinstance(state, dict)
                or set(state) != {'year_delta', 'selected', 'owned_count', 'new_base', 'units',
                                  'root_open', 'child_header', 'dialog'}
                or type(state['year_delta']) is not int or state['year_delta'] != 0
                or state['selected'] not in (None, 'scout', 'former', 'colony')
                or type(state['owned_count']) is not int or state['owned_count'] not in (1, 2)
                or type(state['root_open']) is not bool
                or state['child_header'] is not None and (type(state['child_header']) is not int or state['child_header'] != 4)):
            raise ProtocolError('Invalid Colony founding context')
        city = state['new_base']
        if city is not None:
            if (not isinstance(city, dict) or set(city) != {'name', 'population', 'workers', 'doctors', 'worked_tiles'}
                    or not text(city['name'], blank=True) or len(city['name']) > 24
                    or any(type(city[key]) is not int or not 0 <= city[key] <= 3 for key in city if key != 'name')
                    or city['population'] != city['workers'] + city['doctors'] or city['worked_tiles'] > city['workers']):
                raise ProtocolError('Invalid actual new city')
        units = state['units']
        if not isinstance(units, list) or [unit.get('role') for unit in units if isinstance(unit, dict)] not in (
                ['scout', 'former', 'colony'], ['scout', 'former']):
            raise ProtocolError('Invalid surviving Colony fixture units')
        for unit in units:
            if (set(unit) != {'role', 'order_code', 'movement_spent'}
                    or type(unit['order_code']) is not int or not 0 <= unit['order_code'] <= 2
                    or type(unit['movement_spent']) is not int or not 0 <= unit['movement_spent'] <= 3):
                raise ProtocolError('Invalid actual Colony fixture order/movement')
        dialog = state['dialog']
        if dialog is not None:
            if (not isinstance(dialog, dict) or set(dialog) != {'caption', 'label', 'value', 'buttons'}
                    or not text(dialog['caption']) or not text(dialog['label'])
                    or not text(dialog['value'], blank=True) or len(dialog['value']) > 24
                    or not isinstance(dialog['buttons'], list) or len(dialog['buttons']) != 2
                    or not all(text(button) for button in dialog['buttons'])):
                raise ProtocolError('Invalid actual Colony naming dialog')
