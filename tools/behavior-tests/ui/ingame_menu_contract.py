"""Bounded in-game menu presentation and navigation, without row actions."""
from protocol import ProtocolError

ALGORITHM = 'ui.ingame_menu_trace.v1'
INITIAL = dict(name="Gaia's Landing", workers=0, doctors=1, worked_tiles=0, nutrients=0, minerals=9)
PROFILES = ('synthetic', 'game-edited')
# Installed-source block order and row counts are fixture inputs, not outputs.
MENU_SPECS = (
    ('GAME', '&Game', 13),
    ('HQ', '&HQ', 17),
    ('NETWORK', '&Network', 9),
    ('MAP', '&Map', 21),
    ('ACTION', '&Action', 31),
    ('TERRAFORM', '&Terraform', 10),
    ('SCENARIO', '&Scenario', 28),
    ('EDITOR', '&Edit Map', 29),
    ('HELP', '&Help', 22),
)
SEQUENCES = [
    (f'ingame-menu-header-{index}', 'synthetic', ['menu', {'header': index}, 'escape', 'menu'])
    for index in range(len(MENU_SPECS))
] + [
    ('ingame-menu-root-toggle', 'synthetic', ['menu', 'menu', 'menu', 'menu']),
    ('ingame-menu-header-switch', 'synthetic',
     ['menu', {'header': 0}, {'header': 1}, {'header': 3}, {'header': 8}, 'escape', 'menu']),
    ('ingame-menu-source-game', 'game-edited', ['menu', {'header': 0}, 'escape', 'menu']),
]


def validate_input(data):
    if (not isinstance(data, dict) or set(data) != {'profile', 'initial_base', 'text_profile', 'actions'}
            or data['profile'] != 'stacked' or not isinstance(data['initial_base'], dict)
            or data['initial_base'] != INITIAL
            or any(type(data['initial_base'][key]) is not int for key in INITIAL if key != 'name')
            or data['text_profile'] not in PROFILES or not isinstance(data['actions'], list)
            or not 1 <= len(data['actions']) <= 7):
        raise ProtocolError('Unsupported bounded in-game menu input')
    for action in data['actions']:
        if isinstance(action, str) and action in ('menu', 'escape'):
            continue
        if (isinstance(action, dict) and set(action) == {'header'}
                and type(action['header']) is int and 0 <= action['header'] < len(MENU_SPECS)):
            continue
        raise ProtocolError('Invalid in-game menu action')
    if not any(data['text_profile'] == profile and data['actions'] == actions for _, profile, actions in SEQUENCES):
        raise ProtocolError('Unrecorded in-game menu input sequence')


def normalize(value):
    """Shared display-text comparison; native city names remain raw."""
    return ' '.join(value.replace('’', "'").split()).upper()


def text(value, blank=False):
    return isinstance(value, str) and (blank or bool(value)) and len(value) <= 256 and all(32 <= ord(c) < 127 for c in value)


def validate_output(output, actions):
    """Validate observed shapes only; never derive outcomes from actions."""
    if (not isinstance(output, dict) or set(output) != {'trace'} or not isinstance(output['trace'], list)
            or len(output['trace']) != len(actions) + 1):
        raise ProtocolError('Incomplete in-game menu trace')
    for index, state in enumerate(output['trace']):
        if (not isinstance(state, dict)
                or set(state) != {'after_action', 'screen', 'year_delta', 'selected', 'base', 'units', 'menu'}
                or type(state['after_action']) is not int or state['after_action'] != index - 1
                or type(state['year_delta']) is not int or state['year_delta'] != 0
                or state['screen'] not in ('map', 'menu')
                or state['selected'] not in (None, 'scout', 'former', 'colony')):
            raise ProtocolError('Invalid in-game menu checkpoint context')
        base = state['base']
        if (not isinstance(base, dict) or set(base) != {'name', 'population', 'workers', 'doctors', 'worked_tiles', 'owned_count'}
                or not text(base['name'], blank=True)
                or any(type(base[key]) is not int or not 0 <= base[key] <= 3 for key in base if key != 'name')
                or base['owned_count'] != 1 or base['population'] != base['workers'] + base['doctors']
                or base['worked_tiles'] > base['workers']):
            raise ProtocolError('Invalid in-game menu native city')
        units = state['units']
        if not isinstance(units, list) or len(units) != 3:
            raise ProtocolError('Incomplete in-game menu companions')
        for unit, role in zip(units, ('scout', 'former', 'colony'), strict=True):
            if (not isinstance(unit, dict) or set(unit) != {'role', 'order_code', 'movement_spent'} or unit['role'] != role
                    or type(unit['order_code']) is not int or not 0 <= unit['order_code'] <= 2
                    or type(unit['movement_spent']) is not int or not 0 <= unit['movement_spent'] <= 3):
                raise ProtocolError('Invalid in-game menu native unit')
        menu = state['menu']
        if state['screen'] == 'map':
            if menu is not None:
                raise ProtocolError('In-game menu controls outside actual menu')
            continue
        if (not isinstance(menu, dict) or set(menu) != {'headers', 'child'}
                or not isinstance(menu['headers'], list) or len(menu['headers']) != len(MENU_SPECS)):
            raise ProtocolError('Incomplete actual in-game menu headers')
        for header in menu['headers']:
            if (not isinstance(header, dict) or set(header) != {'label', 'active'}
                    or not text(header['label']) or type(header['active']) is not bool):
                raise ProtocolError('Invalid actual in-game menu header')
        child = menu['child']
        if child is None:
            continue
        if (not isinstance(child, dict) or set(child) != {'header_index', 'rows'}
                or type(child['header_index']) is not int or not 0 <= child['header_index'] < len(MENU_SPECS)
                or not isinstance(child['rows'], list) or not 1 <= len(child['rows']) <= 128):
            raise ProtocolError('Invalid actual in-game child menu')
        for row in child['rows']:
            if isinstance(row, dict) and set(row) == {'separator'} and row['separator'] is True:
                continue
            if (isinstance(row, dict) and set(row) == {'label', 'tone'}
                    and text(row['label']) and row['tone'] in ('light', 'dark')):
                continue
            raise ProtocolError('Invalid actual in-game menu row')
