"""Input-only Action-menu checks after native Tab selects another unit."""
from protocol import ProtocolError
from ui import unit_menu_orders_contract as previous

ALGORITHM = 'ui.unit_menu_context.v1'
INITIAL = previous.INITIAL
PROFILES = previous.PROFILES
SOURCE_SLOTS = previous.SOURCE_SLOTS
SEQUENCES = [
    (f'unit-menu-{role}-slot-{slot}-{profile}', profile,
     ['tab'] * steps + ['menu', {'header': 4}, {'row_source': slot}, 'tab'])
    for role, steps in (('former', 1), ('colony', 2))
    for profile in PROFILES for slot in SOURCE_SLOTS
]


def validate_input(data):
    if (not isinstance(data, dict) or set(data) != {'profile', 'initial_base', 'text_profile', 'actions'}
            or data['profile'] != 'stacked' or not isinstance(data['initial_base'], dict)
            or data['initial_base'] != INITIAL
            or any(type(data['initial_base'][key]) is not int for key in INITIAL if key != 'name')
            or data['text_profile'] not in PROFILES or not isinstance(data['actions'], list)):
        raise ProtocolError('Unsupported bounded unit-menu context input')
    for action in data['actions']:
        if isinstance(action, str) and action in ('menu', 'tab'):
            continue
        if (isinstance(action, dict) and set(action) == {'header'}
                and type(action['header']) is int and action['header'] == 4):
            continue
        if (isinstance(action, dict) and set(action) == {'row_source'}
                and type(action['row_source']) is int and action['row_source'] in SOURCE_SLOTS):
            continue
        raise ProtocolError('Invalid unit-menu context action')
    if not any(data['text_profile'] == profile and data['actions'] == actions for _, profile, actions in SEQUENCES):
        raise ProtocolError('Unrecorded unit-menu context sequence')


def validate_output(output, actions):
    previous.validate_output(output, actions)
