"""Bounded real initial directed-research controls, independent of candidate code."""
from protocol import ProtocolError
ALGORITHM = 'ui.initial_directed_research.v1'

def validate_input(data):
    if not isinstance(data, dict) or set(data) != {'actions'} or not isinstance(data['actions'], list):
        raise ProtocolError('directed research requires actions')
    if not 1 <= len(data['actions']) <= 8:
        raise ProtocolError('bounded research action count')
    for action in data['actions']:
        if action in ('Escape', 'open'):
            continue
        if isinstance(action, dict) and set(action) == {'choose'} and type(action['choose']) is int and 0 <= action['choose'] <= 6:
            continue
        raise ProtocolError('unknown bounded research action')

def validate_output(data):
    if not isinstance(data, dict) or set(data) != {'trace'} or not isinstance(data['trace'], list):
        raise ProtocolError('invalid research trace')
    for state in data['trace']:
        if state['screen'] == 'research':
            if set(state) != {'screen','caption','choices','goal_id'} or len(state['choices']) != 7:
                raise ProtocolError('research choice page differs from bounded seven-card scope')
            for row in state['choices']:
                if set(row) != {'name','category'} or not all(isinstance(x,str) and x for x in row.values()):
                    raise ProtocolError('invalid observed research card')
        elif state['screen'] == 'map':
            if set(state) != {'screen','goal_id'} or type(state['goal_id']) is not int or not -1 <= state['goal_id'] <= 88:
                raise ProtocolError('missing actual research goal')
        else:
            raise ProtocolError('unknown research screen')
