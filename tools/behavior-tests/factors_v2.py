"""Cost-factor contracts calibrated against named original social/rule fields."""
from protocol import ProtocolError

NUTRIENT = 'economy.human_nutrient_factor.v2'
MINERAL = 'economy.human_mineral_factor.v2'
CUSTOM_NUTRIENT = 'economy.custom_map_nutrient_factor.v2'
CUSTOM_MINERAL = 'economy.custom_map_mineral_factor.v2'
ALGORITHMS = (NUTRIENT, MINERAL, CUSTOM_NUTRIENT, CUSTOM_MINERAL)


def validate_input(algorithm, value):
    nutrient = algorithm in (NUTRIENT, CUSTOM_NUTRIENT)
    custom = algorithm in (CUSTOM_NUTRIENT, CUSTOM_MINERAL)
    if algorithm not in ALGORITHMS:
        raise ProtocolError('unknown calibrated cost-factor contract')
    rule, rating = ('nutrient_rule_factor', 'growth') if nutrient else ('mineral_rule_factor', 'industry')
    fields = {'faction_id', rule, rating} | (set() if custom else {'map_size_level'})
    if not isinstance(value, dict) or set(value) != fields:
        raise ProtocolError('missing calibrated factor input fields')
    bounds = {'faction_id': (1, 7), rule: (1, 100), rating: (-8, 10), 'map_size_level': (0, 4)}
    for key, scalar in value.items():
        low, high = bounds[key]
        if type(scalar) is not int or not low <= scalar <= high:
            raise ProtocolError('invalid calibrated factor scalar: ' + key)
