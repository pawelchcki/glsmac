"""Three-unit selection sequences and observable units, without answers."""
from protocol import ProtocolError

ALGORITHM = 'game.unit_selection.v1'
ROLES = ('scout', 'former', 'colony')
ACTIONS = {'wait', 'tab', 'hold', 'skip', 'advance'}


def validate_input(data):
    if not isinstance(data, dict) or set(data) != {'profile', 'actions'}:
        raise ProtocolError('Unit selection requires exactly profile and actions')
    if not isinstance(data['profile'], str) or data['profile'] not in ('stacked', 'spread'):
        raise ProtocolError('Unknown unit selection profile')
    actions = data['actions']
    if (not isinstance(actions, list) or len(actions) > 12 or actions.count('advance') > 1
            or any(not isinstance(a, str) or a not in ACTIONS for a in actions)):
        raise ProtocolError('Unit selection accepts twelve known actions and one advance')


def validate_output(data, actions):
    if (not isinstance(data, dict) or set(data) != {'trace'} or not isinstance(data['trace'], list)
            or len(data['trace']) != len(actions) + 1):
        raise ProtocolError('Unit selection requires every checkpoint')
    for state in data['trace']:
        if not isinstance(state, dict) or set(state) != {'year_delta', 'selected', 'units'}:
            raise ProtocolError('Incomplete unit selection state')
        if type(state['year_delta']) is not int or not 0 <= state['year_delta'] <= 1:
            raise ProtocolError('Invalid selection year delta')
        if state['selected'] is not None and (not isinstance(state['selected'], str) or state['selected'] not in ROLES):
            raise ProtocolError('Invalid selected unit')
        if not isinstance(state['units'], list) or len(state['units']) != len(ROLES):
            raise ProtocolError('Unit selection needs all three actual units')
        for role, unit in zip(ROLES, state['units'], strict=True):
            if not isinstance(unit, dict) or set(unit) != {'role', 'x_delta', 'y_delta', 'order', 'movement_spent'}:
                raise ProtocolError('Incomplete selection unit state')
            if unit['role'] != role or unit['order'] not in ('none', 'hold'):
                raise ProtocolError('Unknown or reordered selection unit')
            for key, lower, upper in (('x_delta', -1, 1), ('y_delta', 0, 1), ('movement_spent', 0, 3)):
                if type(unit[key]) is not int or not lower <= unit[key] <= upper:
                    raise ProtocolError('Invalid selection unit ' + key)
