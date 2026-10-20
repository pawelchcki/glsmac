"""Synthetic road/work action sequences, without expected answers."""
import json
from pathlib import Path
from ui.former_movement_contract import ALGORITHM


def suite():
    return {'version': 1, 'name': 'Original normal Former road movement and partial-move work',
            'description': 'Fresh Gaians/Citizen/standard process on the same synthetic flat arid 40x80 map as former-work.v1. '
                           'A declared UNIT1 bonus supplies one healthy normal Former and the Scout holds. '
                           'Real Road commands pave two adjacent non-base eastward tiles before recording; each work or non-road move is followed by a real turn. '
                           'Recording begins on the eastern road with full movement and no work. Installed rates are unchanged. '
                           'Position is signed same-row tile steps east from that start, normalized for the round map. '
                           'Movement spent is in thirds; original order, work counter, year delta and current-tile flags are observed. '
                           'Research defaults and recognized turn/cancellation confirmations are accepted. No ZOC, combat, terrain variation, abilities or random partial-cost move claim.',
            'cases': [{'id': 'former-road-' + name, 'algorithm': ALGORITHM, 'input': {'actions': actions}}
                      for name, actions in (
                          ('three-moves', ['west', 'east', 'west', 'advance', 'east']),
                          ('one-move-farm', ['west', 'farm', 'cancel_work', 'farm', 'advance', 'cancel_work', 'farm']),
                          ('two-moves-farm', ['west', 'east', 'farm', 'cancel_work', 'farm', 'advance', 'cancel_work']),
                      )]}


if __name__ == '__main__':
    Path(__file__).with_name('cases').joinpath('former-movement.json').write_text(json.dumps(suite(), indent=2) + '\n')
