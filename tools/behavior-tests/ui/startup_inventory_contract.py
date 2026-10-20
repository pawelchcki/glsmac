"""First-base unit inventory, before issuing orders or advancing a turn."""
from protocol import ProtocolError

ALGORITHM = 'game.startup_inventory.v1'


def validate_input(value):
    if (not isinstance(value, dict) or set(value) != {'preset', 'slot'}
            or (value['preset'], value['slot']) not in (('base', 0), ('expansion', 0))
            or type(value['slot']) is not int):
        raise ProtocolError('startup inventory currently supports explicit Gaian/Consciousness starts only')


def validate_output(value):
    if not isinstance(value, dict) or set(value) != {'units'} or not isinstance(value['units'], list):
        raise ProtocolError('startup inventory requires actual unit rows')
    if not 1 <= len(value['units']) <= 8:
        raise ProtocolError('startup inventory exceeds the visible first-page scope')
    names = set()
    for row in value['units']:
        if not isinstance(row, dict) or set(row) != {'name', 'active', 'production', 'lost'}:
            raise ProtocolError('incomplete startup inventory row')
        if (not isinstance(row['name'], str) or not row['name'] or row['name'] != row['name'].upper()
                or '|' in row['name'] or '\n' in row['name'] or row['name'] in names):
            raise ProtocolError('ambiguous or duplicate actual unit name')
        names.add(row['name'])
        if any(type(row[key]) is not int or not 0 <= row[key] <= 99 for key in ('active', 'production', 'lost')):
            raise ProtocolError('startup counts require bounded actual decimal numerals')
    if [row['name'] for row in value['units']] != sorted(names):
        raise ProtocolError('startup inventory rows must be sorted by actual name')
