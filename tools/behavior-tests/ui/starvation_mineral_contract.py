"""Bounded original first-turn mineral accumulator observations."""
from protocol import ProtocolError

ALGORITHM = 'economy.starvation_mineral_credit.v1'
INITIAL = dict(workers=0, doctors=1, worked_tiles=0, nutrients=0, minerals=9)
MODES = ('unchanged', 'starvation')


def validate_input(data):
    if (not isinstance(data, dict) or set(data) != {'mode', 'initial_base', 'project'}
            or data['mode'] not in MODES or data['initial_base'] != INITIAL
            or data['project'] != 'incomplete-Formers'
            or not all(type(value) is int for value in data['initial_base'].values())):
        raise ProtocolError('Unsupported first-turn mineral context')


def validate_output(output, mode):
    stages = ['before-turn', 'notice', 'after-turn'] if mode == 'starvation' else ['before-turn', 'after-turn']
    if not isinstance(output, dict) or set(output) != {'trace'} or not isinstance(output['trace'], list) or len(output['trace']) != len(stages):
        raise ProtocolError('Malformed mineral trace')
    roles = ['scout', 'former'] if mode == 'starvation' else ['scout', 'former', 'colony']
    for index, row in enumerate(output['trace']):
        if not isinstance(row, dict) or set(row) != {'stage', 'year_delta', 'population', 'workers', 'doctors', 'worked_tiles', 'minerals', 'units'} or row['stage'] != stages[index]:
            raise ProtocolError('Malformed mineral checkpoint')
        for key in ('year_delta', 'population', 'workers', 'doctors', 'worked_tiles', 'minerals'):
            if type(row[key]) is not int or row[key] < 0:
                raise ProtocolError('Invalid mineral checkpoint integer')
        if row['year_delta'] != (0 if index == 0 else 1) or row['workers'] + row['doctors'] != row['population']:
            raise ProtocolError('Invalid mineral checkpoint context')
        if not isinstance(row['units'], list) or len(row['units']) != len(roles):
            raise ProtocolError('Malformed mineral companion list')
        for unit, role in zip(row['units'], roles, strict=True):
            if (not isinstance(unit, dict) or set(unit) != {'role', 'order_code', 'movement_spent'}
                    or unit['role'] != role or type(unit['order_code']) is not int
                    or type(unit['movement_spent']) is not int or unit['movement_spent'] < 0):
                raise ProtocolError('Malformed mineral companion state')
