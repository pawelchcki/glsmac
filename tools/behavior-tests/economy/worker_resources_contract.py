"""Bounded, non-base land yields; no output formulas live here."""
from protocol import ProtocolError

ALGORITHM = 'economy.land_worker_resources.v1'
PROFILES = {
    'default': {'forest': [1, 2, 1], 'farm_nutrients': 1, 'mine_without_road_limit': 1, 'mine_nutrients': -1},
    'altered': {'forest': [2, 3, 2], 'farm_nutrients': 2, 'mine_without_road_limit': 0, 'mine_nutrients': 0},
}
IMPROVEMENTS = {
    'bare': 0, 'farm': 0x8000, 'mine': 0x10, 'mine-road': 0x14,
    'farm-mine': 0x8010, 'farm-mine-road': 0x8014, 'forest': 0x200000, 'forest-road': 0x200004,
}


def validate_input(data):
    if not isinstance(data, dict) or set(data) != {'faction_id', 'x', 'y', 'rainfall', 'rockiness', 'improvement', 'cap_tech_owned', 'profile'}:
        raise ProtocolError('land-worker resource input requires exactly the bounded fixture fields')
    for name, allowed in (('faction_id', (1, 7)), ('x', (0, 2)), ('y', (0, 2)),
                          ('rainfall', range(3)), ('rockiness', range(3))):
        if type(data[name]) is not int or data[name] not in allowed:
            raise ProtocolError('invalid land-worker resource integer: ' + name)
    if (data['x'], data['y']) not in ((0, 0), (2, 2)) or type(data['cap_tech_owned']) is not bool:
        raise ProtocolError('invalid land-worker coordinate pair or technology ownership')
    if not isinstance(data['profile'], str) or data['profile'] not in PROFILES:
        raise ProtocolError('unknown land-worker resource rule profile')
    if not isinstance(data['improvement'], str) or data['improvement'] not in IMPROVEMENTS:
        raise ProtocolError('unknown land-worker improvement fixture')


def validate_output(data):
    if not isinstance(data, dict) or set(data) != {'NUTRIENTS', 'MINERALS', 'ENERGY'}:
        raise ProtocolError('land-worker output requires the three actual resource yields')
    if any(type(value) is not int or not 0 <= value <= 16 for value in data.values()):
        raise ProtocolError('land-worker yields must be bounded nonnegative integers')
