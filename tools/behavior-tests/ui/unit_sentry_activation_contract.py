"""Bounded Sentry activation schema and units; no behavioral answers."""
from protocol import ProtocolError
from ui.unit_sentry_contract import ROLES, validate_state as validate_units

ALGORITHM = 'ui.unit_sentry_activation.v1'


def validate_input(data):
    if not isinstance(data, dict) or set(data) != {'profile', 'setup', 'actions'} or data['profile'] != 'stacked':
        raise ProtocolError('Sentry activation requires the declared stack')
    if (not isinstance(data['setup'], list) or len(data['setup']) != 3
            or any(not isinstance(a, str) or a not in {'sleep', 'hold', 'skip'} for a in data['setup'])):
        raise ProtocolError('Sentry activation needs three actual preparation commands')
    actions = data['actions']
    if (not isinstance(actions, list) or not 1 <= len(actions) <= 10 or actions[0] != 'open' or actions.count('open') != 1
            or any(not isinstance(a, str) or a not in {'open', 'up', 'down', 'enter', 'escape', 'wait', 'tab'} for a in actions)):
        raise ProtocolError('Invalid Sentry activation actions')
    closed = False
    for action in actions:
        if (closed and action not in {'wait', 'tab'}) or (not closed and action in {'wait', 'tab'}):
            raise ProtocolError('Sentry activation needs separate popup and post-close actions')
        if action in {'enter', 'escape'}: closed = True


def validate_state(state):
    if not isinstance(state, dict) or set(state) != {'year_delta', 'picker', 'selected', 'units'}:
        raise ProtocolError('Incomplete Sentry activation state')
    validate_units({key: value for key, value in state.items() if key != 'picker'})
    if state['year_delta'] != 0: raise ProtocolError('Sentry activation has no turn advances')
    picker = state['picker']
    if picker is not None and (
            not isinstance(picker, dict) or set(picker) != {'caption', 'choices', 'selected'}
            or not isinstance(picker['caption'], str) or not picker['caption']
            or not isinstance(picker['choices'], list) or len(picker['choices']) != 3
            or any(not isinstance(role, str) or role not in ROLES for role in picker['choices'])
            or len(set(picker['choices'])) != 3 or not isinstance(picker['selected'], str)
            or picker['selected'] not in picker['choices']):
        raise ProtocolError('Invalid Sentry activation picker')


def validate_output(output, actions):
    if (not isinstance(output, dict) or set(output) != {'trace'} or not isinstance(output['trace'], list)
            or len(output['trace']) != len(actions) + 1):
        raise ProtocolError('Sentry activation requires every checkpoint')
    for state in output['trace']: validate_state(state)
    if output['trace'][0]['selected'] is not None or output['trace'][0]['picker'] is not None:
        raise ProtocolError('Sentry activation preparation must finish without selection or picker')
