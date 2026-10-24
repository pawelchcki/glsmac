"""First-city production source controls with literal phase/display observations."""
from protocol import ProtocolError

ALGORITHM = 'ui.initial_production_controls.v2'
PROFILES = {
    ('GAIANS', 'CITIZEN', 'stock'),
    ('HIVE', 'CITIZEN', 'stock'),
    ('GAIANS', 'TALENT', 'stock'),
    ('GAIANS', 'CITIZEN', 'gaian-physics'),
    ('GAIANS', 'CITIZEN', 'gaian-formers-cost-4'),
    ('GAIANS', 'CITIZEN', 'gaian-formers-cost-8'),
    ('GAIANS', 'CITIZEN', 'gaian-mineral-rule-12'),
    ('GAIANS', 'CITIZEN', 'gaian-industry-minus-1'),
}
PHASES = ('first_city_before_panels', 'ready_before_panels', 'after_operations', 'after_panel', 'after_social')
PHASE_INTEGERS = {
    'turn', 'faction_id', 'difficulty', 'map_kind', 'map_area_sqrt',
    'raw_mineral_field', 'current_project_id', 'queue_size',
    'industry_rating', 'mineral_rule_factor',
}
CITY_FIELDS = {'population', 'workers', 'doctors', 'worked_tiles', 'nutrients'}
PANEL_INTEGERS = {'turns', 'mineral_intake', 'mineral_consumption', 'mineral_surplus', 'labs_income'}


def _object(value, fields, description):
    if not isinstance(value, dict) or set(value) != fields:
        raise ProtocolError('invalid ' + description + ' fields')


def _integers(value, fields, description):
    if any(type(value[field]) is not int for field in fields):
        raise ProtocolError('invalid ' + description + ' integer')


def _project(value, description):
    if not isinstance(value, str) or not value:
        raise ProtocolError('invalid ' + description + ' project')


def validate_input(d):
    integer_fields = {'world_width', 'world_height', 'target_id'}
    string_fields = {'faction', 'difficulty', 'text_profile', 'map_route', 'research'}
    _object(d, integer_fields | string_fields, 'first-city production control')
    _integers(d, integer_fields, 'first-city production control')
    if any(not isinstance(d[field], str) for field in string_fields):
        raise ProtocolError('invalid first-city production control string')
    if ((d['faction'], d['difficulty'], d['text_profile']) not in PROFILES
            or (d['world_width'], d['world_height'], d['target_id']) != (40, 80, 5)
            or d['map_route'] != 'load-map' or d['research'] != 'directed'):
        raise ProtocolError('unsupported first-city production control')


def validate_output(d):
    _object(d, set(PHASES) | {'operations', 'panel', 'social_after'}, 'phase production observation')
    for key in PHASES:
        phase = d[key]
        _object(phase, PHASE_INTEGERS | {'owned_ids', 'city'}, key)
        _integers(phase, PHASE_INTEGERS, key)
        _object(phase['city'], CITY_FIELDS, key + ' city')
        _integers(phase['city'], CITY_FIELDS, key + ' city')
        if (not isinstance(phase['owned_ids'], list)
                or any(type(identifier) is not int for identifier in phase['owned_ids'])):
            raise ProtocolError('invalid ' + key + ' ownership IDs')

    operations = d['operations']
    _object(operations, {'project', 'pair', 'turns'}, 'literal production report')
    _project(operations['project'], 'literal production report')
    _integers(operations, {'turns'}, 'literal production report')
    if (not isinstance(operations['pair'], list) or len(operations['pair']) != 2
            or any(type(value) is not int for value in operations['pair'])):
        raise ProtocolError('invalid literal production pair')

    panel = d['panel']
    _object(panel, PANEL_INTEGERS | {'project', 'allocation'}, 'actual resource panel')
    _project(panel['project'], 'actual resource panel')
    _integers(panel, PANEL_INTEGERS, 'actual resource panel')
    _object(panel['allocation'], {'economy', 'psych', 'labs'}, 'actual panel allocation')
    _integers(panel['allocation'], {'economy', 'psych', 'labs'}, 'actual panel allocation')

    _object(d['social_after'], {'industry'}, 'displayed industry')
    _integers(d['social_after'], {'industry'}, 'displayed industry')
