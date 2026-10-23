"""Bounded actual Colony Action rejection beside an existing owned city."""
from protocol import ProtocolError
from ui.ingame_menu_contract import INITIAL, text
ALGORITHM = 'ui.colony_adjacent_warning.v1'
PROFILES = ('synthetic', 'near-edited')
ACTIONS = ['tab', 'tab', 'menu', {'header': 4}, {'row_source': 0}]


def validate_input(data):
    if (not isinstance(data, dict) or set(data) != {'profile','initial_base','text_profile','actions'}
            or data['profile'] != 'spread' or data['initial_base'] != INITIAL
            or not isinstance(data['initial_base'], dict)
            or any(type(data['initial_base'][key]) is not int for key in INITIAL if key != 'name')
            or data['text_profile'] not in PROFILES or data['actions'] != ACTIONS
            or any(isinstance(action,dict) and any(type(v) is not int for v in action.values()) for action in data['actions'])):
        raise ProtocolError('Unsupported adjacent Colony warning input')


def validate_output(output, actions):
    if (not isinstance(output,dict) or set(output) != {'trace'} or not isinstance(output['trace'],list)
            or len(output['trace']) != len(actions)+1):
        raise ProtocolError('Incomplete adjacent Colony warning trace')
    for state in output['trace']:
        if (not isinstance(state,dict) or set(state) != {'year_delta','selected','owned_count','units','root_open','child_header','dialog_open','message'}
                or type(state['year_delta']) is not int or state['year_delta'] != 0
                or state['selected'] not in (None,'scout','former','colony')
                or type(state['owned_count']) is not int or state['owned_count'] != 1
                or type(state['root_open']) is not bool or type(state['dialog_open']) is not bool
                or state['child_header'] is not None and (type(state['child_header']) is not int or state['child_header'] != 4)
                or state['message'] is not None and not text(state['message'])):
            raise ProtocolError('Invalid actual adjacent warning context')
        units=state['units']
        if not isinstance(units,list) or len(units)!=3:
            raise ProtocolError('Incomplete actual adjacent warning units')
        for unit,role in zip(units,('scout','former','colony'),strict=True):
            if (not isinstance(unit,dict) or set(unit) != {'role','order_code','movement_spent'} or unit['role']!=role
                    or type(unit['order_code']) is not int or not 0<=unit['order_code']<=2
                    or type(unit['movement_spent']) is not int or not 0<=unit['movement_spent']<=3):
                raise ProtocolError('Invalid actual adjacent warning unit')
