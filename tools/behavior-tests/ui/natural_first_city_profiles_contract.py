"""Archived first-city profiles, separate from the six-difficulty Gaian contract.

The source-controls output contains an original setup-size scalar for which no
candidate equivalence is established. Native source replay is diagnostic only.
"""
from protocol import ProtocolError
from ui.natural_first_city_contract import INPUT, validate_input as gaian_input, validate_output as city_output

FACTIONS_ALGORITHM = 'game.natural_first_city.v1'
SOURCES_ALGORITHM = 'game.natural_first_city_source_controls.v1'
FACTIONS = ('GAIANS', 'HIVE', 'UNIV', 'MORGAN', 'SPARTANS', 'BELIEVE', 'PEACE')
SOURCE_PROFILES = {
    'GAIANS': ('stock', 'gaian-physics', 'gaian-formers-cost-4', 'gaian-formers-cost-8'),
    'UNIV': ('stock', 'univ-ecology'),
}
COST_REASON = 'production unit_rules parser rejects nonzero raw UNITS cost; no cost conversion is modeled'
MAP_REASON = 'original setup-size map_kind has no established native equivalent; source startup diagnostics are not a complete strict comparison'


def validate_input(value, algorithm):
    if algorithm not in (FACTIONS_ALGORITHM, SOURCES_ALGORITHM):
        raise ProtocolError('unknown archived first-city profile contract')
    if not isinstance(value, dict) or set(value) != set(INPUT):
        raise ProtocolError('archived first-city input requires exact declared startup fields; no city-state overrides')
    # Reuse strict scalar/type and preference checks without widening v1.
    gaian_input(dict(value, faction='GAIANS', text_profile='stock'))
    if value['difficulty'] != 'CITIZEN':
        raise ProtocolError('archived faction and source profiles require Citizen')
    faction, profile = value['faction'], value['text_profile']
    if not isinstance(faction, str) or not isinstance(profile, str):
        raise ProtocolError('faction and source profile must be strings')
    if algorithm == FACTIONS_ALGORITHM:
        if faction not in FACTIONS or profile != 'stock':
            raise ProtocolError('faction profiles require one of seven stock base factions')
    elif faction not in SOURCE_PROFILES or profile not in SOURCE_PROFILES[faction]:
        raise ProtocolError('unsupported faction/source profile pair')


def diagnostic_supported(case):
    validate_input(case['input'], case['algorithm'])
    return case['input']['text_profile'] not in ('gaian-formers-cost-4', 'gaian-formers-cost-8')


def unsupported_reason(case):
    if case['algorithm'] not in (FACTIONS_ALGORITHM, SOURCES_ALGORITHM):
        return 'unknown archived first-city profile contract'
    validate_input(case['input'], case['algorithm'])
    if case['algorithm'] == SOURCES_ALGORITHM:
        return MAP_REASON if diagnostic_supported(case) else COST_REASON + '; ' + MAP_REASON
    return None


def validate_output(value, algorithm):
    if algorithm == FACTIONS_ALGORITHM:
        city_output(value)
    elif algorithm == SOURCES_ALGORITHM:
        if not isinstance(value, dict) or 'map_kind' not in value:
            raise ProtocolError('source-controls output requires the original setup-size scalar')
        city_output({key: item for key, item in value.items() if key != 'map_kind'})
        if type(value['map_kind']) is not int or not -(2**31) <= value['map_kind'] < 2**31:
            raise ProtocolError('map_kind must be a bounded integer')
    else:
        raise ProtocolError('unknown archived first-city profile contract')
