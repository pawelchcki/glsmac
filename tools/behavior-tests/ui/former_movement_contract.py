"""Bounded original road movement and subsequent work; no gameplay answers."""
from protocol import ProtocolError
from ui.former_work_contract import validate_output as validate_work_output

ALGORITHM = 'game.former_road_movement.v1'
ACTIONS = {'west', 'east', 'farm', 'advance', 'cancel_work'}


def validate_input(data):
    if not isinstance(data, dict) or set(data) != {'actions'}:
        raise ProtocolError('Former road movement requires exactly actions')
    actions = data['actions']
    if (not isinstance(actions, list) or len(actions) > 12 or actions.count('advance') > 6
            or any(not isinstance(action, str) or action not in ACTIONS for action in actions)):
        raise ProtocolError('Former road movement accepts twelve known actions and six advances')


def validate_output(data, actions):
    if not isinstance(data, dict) or set(data) != {'trace'} or not isinstance(data['trace'], list):
        raise ProtocolError('Former road movement requires a complete trace')
    work = []
    for state in data['trace']:
        if not isinstance(state, dict) or 'position' not in state:
            raise ProtocolError('Former road movement requires relative position')
        position = state['position']
        if type(position) is not int or not -6 <= position <= 6:
            raise ProtocolError('Invalid relative Former tile position')
        work.append({key: value for key, value in state.items() if key != 'position'})
    validate_work_output({'trace': work}, actions)
