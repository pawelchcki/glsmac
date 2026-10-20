"""Initial human social ratings and installed cost rules after first-base setup."""
from protocol import ProtocolError

ALGORITHM = 'game.faction_social_ratings.v1'
FIELDS = ('growth', 'industry', 'nutrient_rule_factor', 'mineral_rule_factor')
PROFILES = ('default', 'growth-positive', 'industry-positive', 'rules-a', 'rules-b')


def validate_input(value):
    if not isinstance(value, dict) or set(value) != {'preset', 'slot', 'profile'}:
        raise ProtocolError('social ratings require preset, slot and source profile')
    if value['preset'] not in ('base', 'expansion') or type(value['slot']) is not int or not 0 <= value['slot'] < 7:
        raise ProtocolError('social ratings require an explicit roster selection')
    if value['profile'] not in PROFILES or (value['profile'] != 'default' and (value['preset'], value['slot']) != ('expansion', 0)):
        raise ProtocolError('unknown social-rating source override')


def validate_output(value):
    if not isinstance(value, dict) or set(value) != set(FIELDS) or any(type(v) is not int for v in value.values()):
        raise ProtocolError('missing actual initialized social/rule scalars')
    if any(not -8 <= value[name] <= 10 for name in ('growth', 'industry')):
        raise ProtocolError('unsupported observed initial rating')
    if any(not 1 <= value[name] <= 100 for name in FIELDS[2:]):
        raise ProtocolError('unsupported observed cost rule')
