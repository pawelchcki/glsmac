#!/usr/bin/env python3
"""Declare original input sequences, never calculate work or terrain answers."""
import json
from pathlib import Path


def suite():
    cases = []
    for name, profile, actions in (
        ('road', 'normal', ['road', 'advance']),
        ('farm', 'normal', ['farm', 'advance', 'advance', 'advance', 'advance']),
        ('road-source', 'edited', ['road', 'advance', 'advance', 'advance']),
        ('farm-source', 'edited', ['farm', 'advance', 'advance']),
        ('mine-source', 'edited', ['mine', 'advance', 'advance', 'advance']),
        ('forest-source', 'edited', ['forest', 'advance', 'advance']),
        ('farm-cancel-resume', 'normal', ['farm', 'advance', 'cancel_work', 'farm', 'advance', 'advance']),
        ('cancel-switch', 'edited', ['mine', 'advance', 'cancel_work', 'farm', 'advance']),
        ('farm-then-forest', 'edited', ['farm', 'advance', 'advance', 'forest', 'advance']),
        ('farm-cancel-same-turn', 'normal', ['farm', 'cancel_work', 'farm', 'advance', 'advance', 'advance']),
        ('road-repeat', 'normal', ['road', 'road', 'advance', 'road']),
    ):
        cases.append({'id': 'former-' + name, 'algorithm': 'game.former_work.v1',
                      'input': {'profile': profile, 'actions': actions}})
    return {'version': 1, 'name': 'Original normal Former work and cancellation on flat arid land',
            'description': 'Fresh Gaians/Citizen/standard game on a synthetic 40x80 arid land map. A controlled UNIT1 bonus supplies one normal Former. '
                           'Scout held; Former moves one east tile and waits for MY2102 before recording. Pause at end enabled, tutorials disabled, research defaults accepted and contact offers declined when interrupted. Terrain replacement and end-turn confirmations are explicitly accepted. '
                           'Native unit order/work counter/movement-spent and four actual terrain flags are observed. Edited profile changes only four TERRAIN work rates. '
                           'No graphics, label-timing, complete research, AI, terrain variation, multiple Formers or advanced abilities claim.', 'cases': cases}


if __name__ == '__main__':
    declared = suite()
    directory = Path(__file__).with_name('cases')
    directory.joinpath('former-work.json').write_text(json.dumps(declared, indent=2) + '\n')
    core = dict(declared, name='Original Former mine completion and farm cancellation/resume',
                cases=[case for case in declared['cases'] if case['id'] in ('former-mine-source', 'former-farm-cancel-resume')])
    directory.joinpath('former-work-core.json').write_text(json.dumps(core, indent=2) + '\n')
