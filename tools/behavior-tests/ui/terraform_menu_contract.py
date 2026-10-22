"""Bounded pointer-driven Terraform work; validates shapes, never effects."""
from protocol import ProtocolError
from ui.ingame_menu_contract import INITIAL

ALGORITHM = 'ui.terraform_menu_work.v1'
PROFILES = ('synthetic', 'terrain-edited')
TERRAIN_ROWS = (0, 2, 4, 5)


def validate_input(data):
    if (not isinstance(data, dict)
            or set(data) != {'profile', 'initial_base', 'text_profile', 'actions'}
            or data['profile'] != 'spread' or data['initial_base'] != INITIAL
            or not isinstance(data['initial_base'], dict)
            or any(type(data['initial_base'][key]) is not int for key in INITIAL if key != 'name')
            or data['text_profile'] not in PROFILES
            or not isinstance(data['actions'], list) or not 1 <= len(data['actions']) <= 12):
        raise ProtocolError('Unsupported Terraform menu fixture')
    for action in data['actions']:
        if isinstance(action, str) and action in ('menu', 'escape', 'tab'):
            continue
        if isinstance(action, dict):
            if set(action) == {'header'} and type(action['header']) is int and action['header'] == 5:
                continue
            if (set(action) == {'terrain_index'} and type(action['terrain_index']) is int
                    and action['terrain_index'] in TERRAIN_ROWS):
                continue
        raise ProtocolError('Invalid Terraform menu control')


def validate_output(output, actions):
    if (not isinstance(output, dict) or set(output) != {'trace'}
            or not isinstance(output['trace'], list) or len(output['trace']) != len(actions) + 1):
        raise ProtocolError('Incomplete Terraform menu checkpoints')
    for state in output['trace']:
        if (not isinstance(state, dict)
                or set(state) != {'year_delta', 'selected', 'order', 'movement_spent', 'work_units',
                                  'terrain', 'root_open', 'child_header'}
                or state['selected'] not in (None, 'scout', 'former', 'colony')
                or state['order'] not in ('none', 'hold', 'farm', 'mine', 'forest', 'road')
                or type(state['root_open']) is not bool
                or state['child_header'] is not None and
                   (type(state['child_header']) is not int or state['child_header'] != 5)):
            raise ProtocolError('Invalid Terraform menu state')
        for key, high in (('year_delta', 0), ('movement_spent', 3), ('work_units', 128)):
            if type(state[key]) is not int or not 0 <= state[key] <= high:
                raise ProtocolError('Invalid Terraform menu scalar: ' + key)
        flags = state['terrain']
        if (not isinstance(flags, dict) or set(flags) != {'road', 'farm', 'mine', 'forest'}
                or any(type(value) is not bool for value in flags.values())):
            raise ProtocolError('Invalid Terraform menu native terrain')
        if state['child_header'] is not None and not state['root_open']:
            raise ProtocolError('Terraform child without actual parent')
