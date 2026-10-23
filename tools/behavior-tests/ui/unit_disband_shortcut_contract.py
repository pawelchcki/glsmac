"""Public keyboard inputs and observed-state shape for ready Former retirement."""
from protocol import ProtocolError
from ui.unit_disband_contract import INITIAL, validate_output

ALGORITHM = 'ui.unit_disband_shortcut.v1'
PROFILES = ('synthetic', 'disband-edited')
SEQUENCES = {
    'synthetic': ['tab', 'disband-shortcut', 'cancel', 'disband-shortcut', 'down', 'confirm'],
    'disband-edited': ['tab', 'disband-shortcut', 'confirm', 'disband-shortcut', 'up', 'down', 'down', 'up', 'button-ok'],
}


def validate_input(data):
    if (not isinstance(data, dict) or set(data) != {'profile', 'initial_base', 'text_profile', 'actions'}
            or data['profile'] != 'spread' or not isinstance(data['initial_base'], dict)
            or data['initial_base'] != INITIAL
            or any(type(data['initial_base'][key]) is not int for key in INITIAL if key != 'name')
            or data['text_profile'] not in PROFILES
            or data['actions'] != SEQUENCES[data['text_profile']]):
        raise ProtocolError('Unsupported ready Former Disband keyboard input')
