"""Bounded visible resource/allocation observations, without game answers."""
import re

from protocol import ProtocolError
from ui.base_open_contract import validate_input

ALGORITHM = 'ui.base_resource_hud.v1'
RESOURCES = ('nutrients', 'minerals', 'energy')
ALLOCATIONS = ('economy', 'labs', 'psych')


def integer(value, low, high):
    if type(value) is not int or not low <= value <= high:
        raise ProtocolError('Invalid resource HUD integer')


def validate_checkpoint(state):
    if not isinstance(state, dict) or set(state) != {'after_action', 'population', 'rows', 'status', 'allocation'}:
        raise ProtocolError('Invalid resource HUD checkpoint fields')
    integer(state['after_action'], 0, 4)
    integer(state['population'], 1, 2)
    if not isinstance(state['status'], str) or not re.fullmatch(r'[A-Z]+', state['status']):
        raise ProtocolError('Invalid resource HUD status')
    rows = state['rows']
    if not isinstance(rows, dict) or set(rows) != set(RESOURCES):
        raise ProtocolError('Incomplete resource HUD rows')
    for row in rows.values():
        if not isinstance(row, dict) or set(row) != {'intake', 'consumption', 'net', 'visible_left', 'visible_right'}:
            raise ProtocolError('Invalid resource HUD row fields')
        integer(row['intake'], 0, 999)
        integer(row['consumption'], 0, 999)
        integer(row['net'], -999, 999)
        if not isinstance(row['visible_left'], str) or not re.fullmatch(r'[0-9]{3} - [0-9]{3}', row['visible_left']):
            raise ProtocolError('Invalid visible resource intake/consumption')
        # Preserve the reproduction's observed missing '=' and zero sign as
        # actual differences. Structural validation must not supply them.
        if not isinstance(row['visible_right'], str) or not re.fullmatch(r'(?:= )?[+-]?[0-9]{3}', row['visible_right']):
            raise ProtocolError('Invalid visible resource result')
        left = row['visible_left'].split(' - ')
        right = row['visible_right'].removeprefix('= ')
        if (row['intake'], row['consumption'], row['net']) != (int(left[0]), int(left[1]), int(right)):
            raise ProtocolError('Resource HUD transport changed visible numbers')
    allocation = state['allocation']
    if not isinstance(allocation, dict) or set(allocation) != set(ALLOCATIONS):
        raise ProtocolError('Incomplete energy allocation HUD')
    for row in allocation.values():
        if not isinstance(row, dict) or set(row) != {'percent', 'energy', 'bonus', 'total'}:
            raise ProtocolError('Invalid energy allocation HUD fields')
        integer(row['percent'], 0, 100)
        for name in ('energy', 'bonus', 'total'):
            integer(row[name], 0, 999)


def validate_output(output, actions):
    if not isinstance(output, dict) or set(output) != {'trace'} or not isinstance(output['trace'], list):
        raise ProtocolError('Invalid resource HUD output')
    checkpoints = [i for i, action in enumerate(actions) if action == 'open']
    if len(output['trace']) != len(checkpoints):
        raise ProtocolError('Missing resource HUD opening')
    for state, index in zip(output['trace'], checkpoints, strict=True):
        validate_checkpoint(state)
        if state['after_action'] != index:
            raise ProtocolError('Reordered resource HUD opening')
