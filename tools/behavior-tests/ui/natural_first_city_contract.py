"""Bounded natural first-city observation; inputs never contain city state."""
import re
from protocol import ProtocolError

ALGORITHM = 'game.natural_first_city.v1'
DIFFICULTIES = ('CITIZEN', 'SPECIALIST', 'TALENT', 'LIBRARIAN', 'THINKER', 'TRANSCEND')
BASE_FIELDS = ('population', 'workers', 'specialists', 'worked_tiles', 'raw_nutrients', 'raw_minerals')
INPUT = {'faction': 'GAIANS', 'difficulty': 'CITIZEN', 'rules': 'standard', 'text_profile': 'stock',
         'world_width': 40, 'world_height': 80, 'terrain': 'flat-arid', 'checkpoint': 'first-city-initialized',
         'preferences': {'pause_at_end': True, 'tutorials': False}}


def validate_input(value):
    if (not isinstance(value, dict) or set(value) != set(INPUT)
            or value['difficulty'] not in DIFFICULTIES or value != dict(INPUT, difficulty=value['difficulty'])
            or type(value['world_width']) is not int or type(value['world_height']) is not int
            or not isinstance(value['preferences'], dict)
            or any(type(item) is not bool for item in value['preferences'].values())):
        raise ProtocolError('natural first-city v1 requires the exact stock Gaian flat-arid input at one of six accepted difficulties; no city-state overrides')


def validate_output(value):
    if not isinstance(value, dict) or set(value) != {'base', 'human_base_count', 'year_delta'}:
        raise ProtocolError('natural first-city output requires base, human base count and year delta')
    base = value['base']
    if not isinstance(base, dict) or set(base) != set(BASE_FIELDS):
        raise ProtocolError('natural first-city output requires all six raw city fields')
    for name, item in list(base.items()) + [(key, value[key]) for key in ('human_base_count', 'year_delta')]:
        low = -(2**31) if name in ('raw_nutrients', 'raw_minerals', 'year_delta') else 0
        if type(item) is not int or not low <= item < 2**31:
            raise ProtocolError('natural first-city values must be bounded integers')
    if base['population'] != base['workers'] + base['specialists'] or base['worked_tiles'] > base['workers']:
        raise ProtocolError('natural city population and worked-tile membership disagree')


def parse_candidate(text, case):
    if (not re.search(r'^All tests passed\.$', text, re.MULTILINE)
            or re.search(r'TEST FAILED|Unhandled exception|Event rejected:|Event result listener failed:', text)):
        raise ProtocolError('natural startup worker did not complete: ' + text[-2500:])
    markers = []
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(NATURAL_[A-Z]+(?:\|.*)?)$', line)
        if match:
            markers.append(match[1].split('|'))
    if (len(markers) != 3 or markers[0] != ['NATURAL_CASE', case['id']]
            or markers[2] != ['NATURAL_END'] or len(markers[1]) != 9 or markers[1][0] != 'NATURAL_CITY'
            or any(not re.fullmatch(r'0|-?[1-9][0-9]*', token) for token in markers[1][1:])):
        raise ProtocolError('missing, duplicate, malformed or reordered natural-city markers')
    values = list(map(int, markers[1][1:]))
    output = {'base': dict(zip(BASE_FIELDS, values[:6])), 'human_base_count': values[6], 'year_delta': values[7]}
    validate_output(output)
    return {'id': case['id'], 'status': 'ok', 'output': output}
