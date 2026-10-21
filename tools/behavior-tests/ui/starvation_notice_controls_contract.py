"""First owned-city notification Escape/modifier/suppression controls."""
from protocol import ProtocolError
from ui import starvation_dialog_contract as wording

ALGORITHM = 'ui.starvation_notice_controls.v1'
SEQUENCES = (['escape'], ['down', 'escape'], ['shift-escape'], ['suppress'])


def validate_input(data):
    if (not isinstance(data, dict) or set(data) != {'profile', 'initial_base', 'text_profile', 'actions'}
            or data['profile'] != 'stacked' or data['initial_base'] != wording.INITIAL
            or any(type(value) is not int for value in data['initial_base'].values())
            or data['text_profile'] != 'default' or data['actions'] not in SEQUENCES):
        raise ProtocolError('Unsupported first-notice control input')


def validate_output(output, actions):
    wording.validate_output(output, actions)
    for state in output['trace']:
        base = state['base']
        if (state['year_delta'] != 1 or base['owned_count'] != 1
                or base['population'] != base['workers'] + base['doctors']
                or base['worked_tiles'] > base['workers']):
            raise ProtocolError('Inconsistent notice-control context')
