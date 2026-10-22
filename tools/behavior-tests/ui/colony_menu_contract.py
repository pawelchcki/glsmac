"""Player Action-menu Colony join; shape validation without supplied effects."""
from protocol import ProtocolError
from ui.ingame_menu_contract import INITIAL
from ui.colony_join_contract import validate_state

ALGORITHM = 'ui.colony_menu_join.v1'
PROFILES = ('synthetic', 'join-edited')


def validate_input(data):
    if (not isinstance(data, dict)
            or set(data) != {'profile', 'initial_base', 'text_profile', 'actions'}
            or data['profile'] != 'stacked' or not isinstance(data['initial_base'], dict)
            or data['initial_base'] != INITIAL
            or any(type(data['initial_base'][key]) is not int for key in INITIAL if key != 'name')
            or data['text_profile'] not in PROFILES
            or data['actions'] != ['tab', 'tab', 'menu', {'header': 4}, {'row_source': 1}, 'tab']
            or any(isinstance(action, dict) and any(type(value) is not int for value in action.values())
                   for action in data['actions'])):
        raise ProtocolError('Unsupported bounded Colony menu input')


def validate_output(output, actions):
    if (not isinstance(output, dict) or set(output) != {'trace'}
            or not isinstance(output['trace'], list) or len(output['trace']) != len(actions) + 1):
        raise ProtocolError('Incomplete Colony menu trace')
    for state in output['trace']:
        if (not isinstance(state, dict)
                or set(state) != {'year_delta', 'selected', 'base', 'units', 'root_open', 'child_header'}
                or type(state['root_open']) is not bool
                or state['child_header'] is not None and
                   (type(state['child_header']) is not int or state['child_header'] != 4)
                or state['child_header'] is not None and not state['root_open']):
            raise ProtocolError('Invalid Colony menu visibility')
        validate_state({key: state[key] for key in ('year_delta', 'selected', 'base', 'units')})
