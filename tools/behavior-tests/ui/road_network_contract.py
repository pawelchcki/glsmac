"""Synthetic road-network scenarios and strict observable units; no answers."""
from protocol import ProtocolError

ALGORITHM = 'game.road_network.v1'
PROFILES = {'base-road': (1, 1, False), 'forest-roads': (1, 1, True)}


def validate_input(data):
    if not isinstance(data, dict) or set(data) != {'profile', 'actions'}:
        raise ProtocolError('Road network requires exactly profile and actions')
    if not isinstance(data['profile'], str) or data['profile'] not in PROFILES:
        raise ProtocolError('Unknown road network profile')
    actions = data['actions']
    if (not isinstance(actions, list) or len(actions) > 8 or actions.count('advance') > 2
            or any(not isinstance(a, str) or a not in ('west', 'east', 'advance') for a in actions)):
        raise ProtocolError('Road network accepts eight moves and two advances')


def validate_output(data, actions):
    if (not isinstance(data, dict) or set(data) != {'trace'} or not isinstance(data['trace'], list)
            or len(data['trace']) != len(actions) + 1):
        raise ProtocolError('Road network requires every checkpoint')
    for state in data['trace']:
        if not isinstance(state, dict) or set(state) != {'year_delta', 'position', 'movement_spent', 'terrain'}:
            raise ProtocolError('Incomplete road network state')
        for key, lower, upper in (('year_delta', 0, 2), ('position', -4, 4), ('movement_spent', 0, 3)):
            if type(state[key]) is not int or not lower <= state[key] <= upper:
                raise ProtocolError('Invalid road network ' + key)
        terrain = state['terrain']
        if not isinstance(terrain, dict) or set(terrain) != {'base', 'road', 'forest', 'moisture', 'rockiness'}:
            raise ProtocolError('Incomplete road network terrain')
        if any(type(terrain[key]) is not bool for key in ('base', 'road', 'forest')):
            raise ProtocolError('Invalid road network flag')
        if any(type(terrain[key]) is not int or not 1 <= terrain[key] <= 3 for key in ('moisture', 'rockiness')):
            raise ProtocolError('Invalid road network terrain classification')
