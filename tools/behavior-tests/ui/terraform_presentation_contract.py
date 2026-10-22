"""Observed Terraform menu labels/tones/groups across real unit navigation."""
from protocol import ProtocolError
from ui.ingame_menu_contract import INITIAL, text

ALGORITHM = 'ui.terraform_menu_presentation.v1'
PROFILES = ('synthetic', 'terrain-edited', 'rates-edited')
ACTIONS = ['menu', {'header': 5}, 'escape', 'tab', 'menu', {'header': 5}]


def validate_input(data):
    if (not isinstance(data, dict)
            or set(data) != {'profile', 'initial_base', 'text_profile', 'actions'}
            or data['profile'] != 'spread' or not isinstance(data['initial_base'], dict)
            or data['initial_base'] != INITIAL
            or any(type(data['initial_base'][key]) is not int for key in INITIAL if key != 'name')
            or data['text_profile'] not in PROFILES or data['actions'] != ACTIONS
            or any(isinstance(action, dict) and any(type(value) is not int for value in action.values())
                   for action in data['actions'])):
        raise ProtocolError('Unsupported Terraform context presentation input')


def validate_output(output, actions):
    if (not isinstance(output, dict) or set(output) != {'trace'}
            or not isinstance(output['trace'], list) or len(output['trace']) != len(actions) + 1):
        raise ProtocolError('Incomplete Terraform presentation trace')
    for state in output['trace']:
        if (not isinstance(state, dict) or set(state) != {'year_delta', 'selected', 'menu'}
                or type(state['year_delta']) is not int or state['year_delta'] != 0
                or state['selected'] not in (None, 'scout', 'former', 'colony')):
            raise ProtocolError('Invalid Terraform presentation native context')
        menu = state['menu']
        if menu is None:
            continue
        if not isinstance(menu, dict) or set(menu) != {'headers', 'child'}:
            raise ProtocolError('Invalid observed Terraform menu')
        headers = menu['headers']
        if not isinstance(headers, list) or len(headers) != 9:
            raise ProtocolError('Incomplete observed menu headers')
        for header in headers:
            if (not isinstance(header, dict) or set(header) != {'label', 'active'}
                    or not text(header['label']) or type(header['active']) is not bool):
                raise ProtocolError('Invalid observed menu header')
        if sum(header['active'] for header in headers) > 1:
            raise ProtocolError('Multiple active observed headers')
        child = menu['child']
        if child is None:
            continue
        if (not isinstance(child, dict) or set(child) != {'header_index', 'rows'}
                or type(child['header_index']) is not int or child['header_index'] != 5
                or not isinstance(child['rows'], list) or not 1 <= len(child['rows']) <= 128):
            raise ProtocolError('Invalid observed Terraform child')
        for row in child['rows']:
            if isinstance(row, dict) and set(row) == {'separator'} and row['separator'] is True:
                continue
            if (not isinstance(row, dict) or set(row) != {'label', 'tone'}
                    or not text(row['label']) or row['tone'] not in ('light', 'dark')):
                raise ProtocolError('Invalid observed Terraform row')
