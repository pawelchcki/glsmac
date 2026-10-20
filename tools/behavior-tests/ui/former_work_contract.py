"""Bounded original Former work/terrain traces; no work policy or answers."""
from protocol import ProtocolError

ALGORITHM = 'game.former_work.v1'
ACTIONS = {'road', 'farm', 'mine', 'forest', 'advance', 'cancel_work'}
RATE_ROWS = {'farm': 0, 'mine': 2, 'forest': 4, 'road': 5}
RATE_PROFILES = {'normal': {}, 'edited': {'road': 3, 'farm': 2, 'mine': 3, 'forest': 2}}


def validate_input(data):
    if not isinstance(data, dict) or set(data) != {'profile', 'actions'}:
        raise ProtocolError('Former work requires exactly profile and actions')
    if not isinstance(data['profile'], str) or data['profile'] not in RATE_PROFILES:
        raise ProtocolError('unknown Former work source profile')
    actions = data['actions']
    if (not isinstance(actions, list) or len(actions) > 12 or actions.count('advance') > 8
            or any(not isinstance(action, str) or action not in ACTIONS for action in actions)):
        raise ProtocolError('Former work accepts at most twelve known actions and eight advances')


def validate_output(data, actions):
    if not isinstance(data, dict) or set(data) != {'trace'} or not isinstance(data['trace'], list) or len(data['trace']) != len(actions) + 1:
        raise ProtocolError('Former work requires one complete state for every checkpoint')
    for state in data['trace']:
        if not isinstance(state, dict) or set(state) != {'year_delta', 'order', 'movement_spent', 'work_units', 'terrain'}:
            raise ProtocolError('unknown or incomplete Former work state')
        for name, high in (('year_delta', 8), ('movement_spent', 3), ('work_units', 128)):
            if type(state[name]) is not int or not 0 <= state[name] <= high:
                raise ProtocolError('invalid Former work scalar: ' + name)
        if state['order'] not in ('none', 'hold', 'farm', 'mine', 'forest', 'road'):
            raise ProtocolError('unknown actual Former order')
        flags = state['terrain']
        if not isinstance(flags, dict) or set(flags) != {'road', 'farm', 'mine', 'forest'} or any(type(value) is not bool for value in flags.values()):
            raise ProtocolError('invalid Former terrain flags')
