"""Bounded Action-menu source-slot selection, without prescribed effects."""
from protocol import ProtocolError
from ui import ingame_menu_contract as presentation

ALGORITHM = 'ui.unit_menu_orders.v1'
INITIAL = presentation.INITIAL
PROFILES = ('synthetic', 'action-edited')
SOURCE_SLOTS = (26, 29, 30)
SEQUENCES = [
    (f'unit-menu-slot-{slot}-{profile}', profile,
     ['menu', {'header': 4}, {'row_source': slot}, 'tab'])
    for profile in PROFILES for slot in SOURCE_SLOTS
]


def validate_input(data):
    if (not isinstance(data, dict) or set(data) != {'profile', 'initial_base', 'text_profile', 'actions'}
            or data['profile'] != 'stacked' or not isinstance(data['initial_base'], dict)
            or data['initial_base'] != INITIAL
            or any(type(data['initial_base'][key]) is not int for key in INITIAL if key != 'name')
            or data['text_profile'] not in PROFILES or not isinstance(data['actions'], list)):
        raise ProtocolError('Unsupported bounded unit-menu input')
    for action in data['actions']:
        if isinstance(action, str) and action in ('menu', 'tab'):
            continue
        if (isinstance(action, dict) and set(action) == {'header'}
                and type(action['header']) is int and action['header'] == 4):
            continue
        if (isinstance(action, dict) and set(action) == {'row_source'}
                and type(action['row_source']) is int and action['row_source'] in SOURCE_SLOTS):
            continue
        raise ProtocolError('Invalid unit-menu action')
    if not any(data['text_profile'] == profile and data['actions'] == actions for _, profile, actions in SEQUENCES):
        raise ProtocolError('Unrecorded unit-menu input sequence')


def validate_output(output, actions):
    # Reuse the observation shape, never the older navigation input sequences.
    # This validates native bounds and complete checkpoints, not row effects.
    presentation.validate_output(output, actions)
