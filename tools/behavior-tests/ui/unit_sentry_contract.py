"""Bounded Sentry observation schema and protocol units; no behavior answers."""
from protocol import ProtocolError
from ui.unit_selection_contract import ROLES

ALGORITHM = 'game.unit_sentry_lifecycle.v1'
ACTIONS = {'sleep', 'hold', 'skip', 'wait', 'tab', 'advance'}


def validate_input(data):
    if not isinstance(data, dict) or set(data) != {'profile', 'actions'} or data['profile'] != 'stacked':
        raise ProtocolError('Sentry requires the declared stacked profile')
    actions = data['actions']
    if (not isinstance(actions, list) or not 1 <= len(actions) <= 12
            or any(not isinstance(action, str) or action not in ACTIONS for action in actions)
            or actions.count('advance') > 1):
        raise ProtocolError('Invalid bounded Sentry sequence')


def validate_output(output, actions):
    if (not isinstance(output, dict) or set(output) != {'trace'} or not isinstance(output['trace'], list)
            or len(output['trace']) != len(actions) + 1):
        raise ProtocolError('Sentry requires every checkpoint')
    for state in output['trace']: validate_state(state)
    initial = output['trace'][0]
    if (initial['year_delta'] != 0 or initial['selected'] != 'scout'
            or any(unit['order_code'] != 0 or unit['movement_spent'] != 0 for unit in initial['units'])):
        raise ProtocolError('Sentry fixture must start ready and unmoved with Scout selected')


def validate_state(state):
    if not isinstance(state, dict) or set(state) != {'year_delta', 'selected', 'units'}:
        raise ProtocolError('Incomplete Sentry state')
    if type(state['year_delta']) is not int or state['year_delta'] not in (0, 1):
        raise ProtocolError('Invalid Sentry turn difference')
    if state['selected'] is not None and (not isinstance(state['selected'], str) or state['selected'] not in ROLES):
        raise ProtocolError('Unknown selected Sentry unit')
    if not isinstance(state['units'], list) or len(state['units']) != 3:
        raise ProtocolError('Sentry needs all three native units')
    for role, unit in zip(ROLES, state['units'], strict=True):
        if (not isinstance(unit, dict) or set(unit) != {'role', 'order_code', 'movement_spent'} or unit['role'] != role
                or type(unit['order_code']) is not int or unit['order_code'] not in (0, 1, 2)
                or type(unit['movement_spent']) is not int or not 0 <= unit['movement_spent'] <= 3):
            raise ProtocolError('Invalid Sentry unit state or protocol units')
