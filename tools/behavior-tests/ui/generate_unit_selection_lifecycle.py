"""Input-only held-unit subsets and deferred-history lifecycle challenges."""
import json
from pathlib import Path
from ui.unit_selection_contract import ALGORITHM
from ui.unit_wait_contract import ALGORITHM as WAITING


def suites():
    def case(name, actions, algorithm=ALGORITHM):
        return {'id': 'selection-' + name, 'algorithm': algorithm,
                'input': {'profile': 'stacked', 'actions': actions}}
    return {
        'unit-selection-held-turn': {
            'version': 1, 'name': 'Original held orders across turn boundary',
            'description': 'Fresh stacked fixture from game.unit_selection.v1; actual Hold/Skip and one turn, no new world overrides or expected answers.',
            'cases': [case('all-held-next-turn', ['hold'] * 3 + ['advance', 'wait', 'tab']),
                      case('one-held-next-turn', ['hold', 'skip', 'skip', 'advance', 'wait', 'tab'])],
        },
        'unit-selection-held-subsets': {
            'version': 1, 'name': 'Original remaining held-unit subsets across next turn',
            'description': 'Fresh stacked fixture from game.unit_selection.v1. Bit positions scout/former/colony choose actual Hold versus Skip, then one real turn, W and Tab. Only input actions are generated; no expected outputs. Complements separately frozen all-skipped, all-held and Scout-only-held traces.',
            'cases': [case(f'held-mask-{mask}-next-turn', ['hold' if mask & (1 << index) else 'skip' for index in range(3)] + ['advance', 'wait', 'tab']) for mask in (2, 3, 4, 5, 6)],
        },
        'unit-wait-lifecycle': {
            'version': 1, 'name': 'Original deferred flags through Hold Skip and turn advancement',
            'description': 'Fresh stacked three-unit fixture from game.unit_wait_state.v1. Real W/Tab, Hold, Skip and one turn. Native original deferred flags and selection are read after every action; input-only sequences supply no expected outputs.',
            'cases': [case('wait-state-hold-history-reset', ['wait', 'wait', 'hold', 'wait', 'skip', 'skip', 'advance', 'wait', 'tab'], WAITING),
                      case('wait-state-skip-history-reset', ['wait', 'wait', 'wait', 'skip', 'tab', 'hold', 'skip', 'advance', 'wait', 'tab'], WAITING)],
        },
    }


if __name__ == '__main__':
    for name, data in suites().items():
        Path(__file__).with_name('cases').joinpath(name + '.json').write_text(json.dumps(data, indent=2) + '\n')
