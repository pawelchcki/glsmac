#!/usr/bin/env python3
"""Generate only original-game identity input sequences, never expected outputs."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ui.faction_identity_contract import ALGORITHM, validate_input


def make_suite():
    cases = []

    def add(name, actions, profile='default'):
        value = {'profile': profile, 'actions': actions}
        validate_input(value)
        cases.append({'id': name, 'algorithm': ALGORITHM, 'input': value})

    for preset in ('base', 'expansion'):
        for slot in range(7):
            add(f'identity-{preset}-{slot}', [{'preset': preset}, {'slot': slot}, {'key': 'Enter'}])
    edits = [{'edit': {'field': index, 'text': text}} for index, text in enumerate(
        ['Orion Vale', 'Orbit Guild', 'Orbiters', 'Orbital', 'Navigator', 'brisk'])]
    for name, end in (
        ('confirmed', [{'button': 'OK'}]), ('canceled', [{'button': 'CANCEL'}]),
        ('restored', [{'button': 'RESTORE DEFAULTS'}, {'button': 'OK'}]),
    ):
        add('identity-custom-' + name, [{'button': 'CHANGE NAME'}, *edits, *end, {'key': 'Enter'}])
    for text in ('Nova Pilot', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' * 2, '  Nova Pilot  ', ''):
        add('identity-name-' + str(len(cases)), [{'key': 'Enter'}, {'edit': {'field': 0, 'text': text}}])
    add('identity-source-both', [{'key': 'Enter'}], 'both')
    return {'version': 1, 'name': 'original-selected-faction-identity-handoff',
            'description': 'Selected preset factions, confirmed/canceled/restored customization, name edits and conflicting source profiles at the actual original post-generation opening dialog. Opponent AI and identity gender semantics are excluded.',
            'cases': cases}


if __name__ == '__main__':
    print(json.dumps(make_suite(), indent=2))
