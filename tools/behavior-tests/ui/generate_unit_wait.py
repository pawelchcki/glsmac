"""Long input sequences to challenge selection history without supplying answers."""
import json
from pathlib import Path
from ui.unit_wait_contract import ALGORITHM


def suite():
    return {'version': 1, 'name': 'Original repeated unit waiting state',
            'description': 'Same fresh three-unit stacked Gaians/Citizen/standard fixture as game.unit_selection.v1, '
                           'with declared UNIT1/UNIT0 bonuses and actual first-base setup. '
                           'Native Console selection is cross-checked with visible unit names; native VEH state bit 0x2 is observed independently '
                           'for Scout, Former and Colony Pod after every actual W or Tab. '
                           'These long sequences observe controller history, not movement or other original state bits. '
                           'No original code or memory is patched; every case starts a new process and the entire capture repeats.',
            'cases': [{'id': 'selection-wait-state-' + name, 'algorithm': ALGORITHM,
                       'input': {'profile': 'stacked', 'actions': [action] * 12}}
                      for name, action in (('wait', 'wait'), ('tab', 'tab'))]}


if __name__ == '__main__':
    Path(__file__).with_name('cases').joinpath('unit-wait-flags.json').write_text(json.dumps(suite(), indent=2) + '\n')
