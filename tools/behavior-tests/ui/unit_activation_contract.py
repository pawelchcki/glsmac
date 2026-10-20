"""Bounded actual activation-menu observations, without behavior answers."""
from protocol import ProtocolError
from ui.unit_selection_contract import ROLES

ALGORITHM = 'ui.unit_activation_picker.v1'
ACTIONS = {'open', 'down', 'up', 'home', 'end', 'enter', 'escape', 'ok', 'cancel', 'click0', 'click1', 'click2'}
TERMINAL = {'enter', 'escape', 'ok', 'cancel'}


def validate_input(data):
    if (not isinstance(data, dict) or set(data) != {'profile', 'actions'}
            or not isinstance(data['profile'], str) or data['profile'] not in ('default', 'edited-caption')):
        raise ProtocolError('Activation picker needs a declared profile and actions')
    actions = data['actions']
    if (not isinstance(actions, list) or not 1 <= len(actions) <= 10 or actions[0] != 'open'
            or actions.count('open') != 1
            or any(not isinstance(a, str) or a not in ACTIONS for a in actions)
            or any(a in TERMINAL for a in actions[:-1])):
        raise ProtocolError('Invalid bounded activation-picker sequence')


def validate_state(state):
    if not isinstance(state, dict) or set(state) != {'year_delta', 'picker', 'selected', 'units'}:
        raise ProtocolError('Incomplete activation state')
    if type(state['year_delta']) is not int or state['year_delta'] != 0:
        raise ProtocolError('Activation contract has no turn advances')
    if state['selected'] is not None and (not isinstance(state['selected'], str) or state['selected'] not in ROLES):
        raise ProtocolError('Unknown activation unit selection')
    if not isinstance(state['units'], list) or len(state['units']) != 3:
        raise ProtocolError('Activation requires all three native units')
    for role, unit in zip(ROLES, state['units'], strict=True):
        if (not isinstance(unit, dict) or set(unit) != {'role', 'order', 'movement_spent'}
                or unit['role'] != role or unit['order'] not in ('none', 'hold')
                or type(unit['movement_spent']) is not int or not 0 <= unit['movement_spent'] <= 3):
            raise ProtocolError('Incomplete or invalid activation unit')
    picker = state['picker']
    if picker is not None:
        if (not isinstance(picker, dict) or set(picker) != {'caption', 'choices', 'selected'}
                or not isinstance(picker['caption'], str) or not picker['caption']
                or not isinstance(picker['choices'], list) or len(picker['choices']) != 3
                or any(not isinstance(v, str) or v not in ROLES for v in picker['choices'])
                or len(set(picker['choices'])) != 3
                or not isinstance(picker['selected'], str) or picker['selected'] not in picker['choices']):
            raise ProtocolError('Incomplete or invalid activation picker')


def validate_output(output, actions, *, fixture=True):
    if (not isinstance(output, dict) or set(output) != {'trace'} or not isinstance(output['trace'], list)
            or len(output['trace']) != len(actions) + 1):
        raise ProtocolError('Activation requires every checkpoint')
    for state in output['trace']: validate_state(state)
    if fixture:
        initial = output['trace'][0]
        if (initial['picker'] is not None or initial['selected'] is not None
                or any(u['order'] != 'hold' or u['movement_spent'] != 0 for u in initial['units'])):
            raise ProtocolError('Activation fixture must start with all three units held and unmoved, without selection or picker')
