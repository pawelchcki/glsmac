"""Bounded Colony Pod join protocol; structural validation, no behavior answers."""
from protocol import ProtocolError
from ui.unit_selection_contract import ROLES

ALGORITHM = 'game.colony_join_base.v1'
INITIAL = dict(workers=0, doctors=1, worked_tiles=0, nutrients=0, minerals=9)


def validate_input(data):
    if (not isinstance(data, dict) or set(data) != {'profile', 'initial_base', 'setup', 'actions'}
            or data['profile'] != 'stacked' or data['initial_base'] != INITIAL
            or not isinstance(data['initial_base'], dict)
            or any(type(v) is not int for v in data['initial_base'].values())):
        raise ProtocolError('Join requires its declared initial city')
    if (not isinstance(data['setup'], list) or len(data['setup']) != 2
            or any(not isinstance(a, str) or a not in ('wait', 'skip', 'hold', 'sleep') for a in data['setup'])
            or data['actions'] != ['join', 'wait', 'tab']):
        raise ProtocolError('Invalid bounded join commands')


def validate_state(state):
    if (not isinstance(state, dict) or set(state) != {'year_delta', 'selected', 'base', 'units'}
            or type(state['year_delta']) is not int or state['year_delta'] != 0
            or state['selected'] is not None and state['selected'] not in ROLES):
        raise ProtocolError('Invalid join checkpoint')
    base = state['base']
    if (not isinstance(base, dict) or set(base) != {'population', 'workers', 'doctors', 'worked_tiles', 'nutrients', 'minerals', 'owned_count'}
            or any(type(v) is not int or not 0 <= v <= 100000 for v in base.values())
            or not 1 <= base['population'] <= 3 or base['owned_count'] != 1
            or base['workers'] + base['doctors'] != base['population']
            or base['worked_tiles'] > base['workers']):
        raise ProtocolError('Invalid native join base counters')
    units = state['units']
    if not isinstance(units, list) or len(units) not in (2, 3):
        raise ProtocolError('Join requires both surviving companions and optional Pod')
    for role, unit in zip(ROLES, units):
        if (not isinstance(unit, dict) or set(unit) != {'role', 'order_code', 'movement_spent'}
                or unit['role'] != role or type(unit['order_code']) is not int or unit['order_code'] not in (0, 1, 2)
                or type(unit['movement_spent']) is not int or not 0 <= unit['movement_spent'] <= 3):
            raise ProtocolError('Invalid native join unit or protocol units')


def validate_output(output, actions):
    if (not isinstance(output, dict) or set(output) != {'trace'}
            or not isinstance(output['trace'], list) or len(output['trace']) != len(actions) + 1):
        raise ProtocolError('Join requires every checkpoint')
    for state in output['trace']:
        validate_state(state)
