"""Observed wait-state flags, independent of their reproduction representation."""
from protocol import ProtocolError
from ui.unit_selection_contract import ROLES, validate_input

ALGORITHM = 'game.unit_wait_state.v1'


def validate_output(data, actions):
    if (not isinstance(data, dict) or set(data) != {'trace'} or not isinstance(data['trace'], list)
            or len(data['trace']) != len(actions) + 1):
        raise ProtocolError('Unit wait state requires every checkpoint')
    for state in data['trace']:
        if not isinstance(state, dict) or set(state) != {'year_delta', 'selected', 'deferred'}:
            raise ProtocolError('Incomplete unit wait state')
        if type(state['year_delta']) is not int or not 0 <= state['year_delta'] <= 1:
            raise ProtocolError('Invalid wait-state year delta')
        if state['selected'] is not None and (not isinstance(state['selected'], str) or state['selected'] not in ROLES):
            raise ProtocolError('Invalid wait-state selection')
        if (not isinstance(state['deferred'], dict) or set(state['deferred']) != set(ROLES)
                or any(type(v) is not bool for v in state['deferred'].values())):
            raise ProtocolError('Invalid unit deferred-state flags')
