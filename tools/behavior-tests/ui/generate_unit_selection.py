"""Input-only three-unit control sequences for independent original capture."""
import json
from pathlib import Path
from ui.unit_selection_contract import ALGORITHM


def suites():
    description = ('Fresh Gaians/Citizen/standard original process on synthetic 40x80 flat arid land; '
                   'declared UNIT1 and UNIT0 bonuses leave exactly one Scout, Former and Colony Pod after actual first-base construction. '
                   'Pause-at-end enabled, tutorials disabled. Stacked starts MY2101 on the base, Scout selected, all ready. '
                   'Spread uses real southeast/southwest moves, Skip and a turn, then starts MY2102 with Scout selected on the base, '
                   'Former at (+1,+1) and Pod at (-1,+1), all ready. Positions are original coordinate units relative to the base, '
                   'horizontal differences normalized for the round map. Native active-unit mode/identity, orders, movement spent in thirds '
                   'and relative positions are observed. No combat, enemies, other orders, arbitrary topology, mouse selection or activation-picker claim.')
    groups = {
        'unit-selection-core': (
            ('wait-wrap', 'stacked', ['wait'] * 6),
            ('tab-direction', 'stacked', ['tab'] * 4 + ['wait', 'tab']),
            ('held-and-spent', 'stacked', ['wait', 'wait', 'hold', 'tab', 'wait', 'skip', 'wait', 'tab']),
        ),
        'unit-selection-lifecycle': (
            ('none-ready', 'stacked', ['hold', 'hold', 'hold', 'wait', 'tab']),
            ('fresh-turn', 'stacked', ['skip', 'skip', 'skip', 'advance', 'wait', 'tab']),
        ),
        'unit-selection-spread': (
            ('spread-hold-skip', 'spread', ['wait', 'hold', 'wait', 'skip', 'wait', 'tab']),
        ),
    }
    return {name: {'version': 1, 'name': 'Original three-unit selection: ' + name,
                   'description': description,
                   'cases': [{'id': 'selection-' + ident, 'algorithm': ALGORITHM,
                              'input': {'profile': profile, 'actions': actions}} for ident, profile, actions in cases]}
            for name, cases in groups.items()}


if __name__ == '__main__':
    for name, data in suites().items():
        Path(__file__).with_name('cases').joinpath(name + '.json').write_text(json.dumps(data, indent=2) + '\n')
