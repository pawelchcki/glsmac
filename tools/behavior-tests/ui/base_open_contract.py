"""Structural base-opening protocol. No expected behavior is computed here."""
from protocol import ProtocolError
from ui.colony_join_contract import INITIAL, ROLES

ALGORITHM = 'ui.base_open_city_recalc.v1'
CITIZENS_ALGORITHM = 'ui.base_open_citizens.v1'
SEQUENCES = (['open', 'close', 'open', 'close'],
             ['join', 'open', 'close', 'open', 'close'])


def validate_input(data):
    if (not isinstance(data, dict)
            or set(data) != {'profile', 'initial_base', 'setup', 'actions'}
            or data['profile'] != 'stacked'
            or not isinstance(data['initial_base'], dict)
            or data['initial_base'] != INITIAL
            or any(type(v) is not int for v in data['initial_base'].values())
            or data['setup'] != ['wait', 'wait']
            or data['actions'] not in SEQUENCES):
        raise ProtocolError('Unsupported declared city or bounded base-opening sequence')


def validate_state(state, *, include_nutrients=True):
    if (not isinstance(state, dict)
            or set(state) != {'screen', 'title_matches_base', 'year_delta', 'selected', 'base', 'units'}
            or state['screen'] not in ('map', 'base')
            or type(state['title_matches_base']) is not bool
            or type(state['year_delta']) is not int or state['year_delta'] != 0
            or state['selected'] is not None and state['selected'] not in ROLES):
        raise ProtocolError('Invalid base-opening checkpoint')
    base = state['base']
    keys = {'population', 'workers', 'doctors', 'worked_tiles', 'nutrients', 'minerals', 'owned_count'}
    if not include_nutrients:
        keys.remove('nutrients')
    if (not isinstance(base, dict) or set(base) != keys
            or any(type(v) is not int for v in base.values())
            or any(not 0 <= v <= 100000 for k, v in base.items() if k != 'nutrients')
            or include_nutrients and not -100000 <= base['nutrients'] <= 100000
            or not 1 <= base['population'] <= 3 or base['owned_count'] != 1
            or base['workers'] + base['doctors'] != base['population']
            or base['worked_tiles'] > base['workers']):
        raise ProtocolError('Invalid base-opening native counters')
    units = state['units']
    if not isinstance(units, list) or len(units) not in (2, 3):
        raise ProtocolError('Expected surviving companions and optional Pod')
    for role, unit in zip(ROLES, units):
        if (not isinstance(unit, dict) or set(unit) != {'role', 'order_code', 'movement_spent'}
                or unit['role'] != role
                or type(unit['order_code']) is not int or unit['order_code'] not in (0, 1, 2)
                or type(unit['movement_spent']) is not int or not 0 <= unit['movement_spent'] <= 3):
            raise ProtocolError('Invalid base-opening unit protocol')


def validate_output(output, actions, *, include_nutrients=True):
    if (not isinstance(output, dict) or set(output) != {'trace'}
            or not isinstance(output['trace'], list) or len(output['trace']) != len(actions) + 1):
        raise ProtocolError('Base opening requires every checkpoint')
    for state in output['trace']:
        validate_state(state, include_nutrients=include_nutrients)
