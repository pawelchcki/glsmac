#!/usr/bin/env python3
"""Generate faction-control input sequences only, never reference answers."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ui.faction_setup_contract import ALGORITHM, validate_input


def make_suite():
    cases = []

    def add(name, actions=(), profile='default'):
        value = {'profile': profile, 'actions': list(actions)}
        validate_input(value)
        cases.append({'id': name, 'algorithm': ALGORITHM, 'input': value})

    focus_all = [{'focus': index} for index in range(7)]
    add('faction-initial')
    add('faction-arrows-clamps', [{'key': key} for key in ['ArrowUp'] + ['ArrowDown'] * 8 + ['ArrowUp'] * 8])
    add('faction-home-end-middle', [{'slot': 3}, {'key': 'Home'}, {'key': 'End'}, {'key': 'ArrowUp'}])
    add('faction-random-preview-restore', [{'slot': 2}, {'mode': 'random'}, {'slot': 6}, {'mode': 'selected'}, {'mode': 'random'}, {'mode': 'selected'}])
    add('faction-presets-retain-selection', [{'slot': 4}, {'preset': 'base'}, {'preset': 'expansion'}])
    add('faction-random-mode-presets', [{'mode': 'random'}, {'preset': 'base'}, {'preset': 'expansion'}, {'mode': 'selected'}])
    add('faction-random-change-name', [{'mode': 'random'}, {'button': 'CHANGE NAME'}])
    for close in ({'key': 'Escape'}, {'button': 'CANCEL'}):
        add('faction-return-' + ('escape' if 'key' in close else 'cancel'),
            [{'preset': 'base'}, {'slot': 4}, close, {'key': 'Enter'}, {'key': 'Enter'}])
    for preset in ('base', 'expansion'):
        for index in range(7):
            add(f'faction-{preset}-{index}-editors', [{'preset': preset}, {'slot': index}, {'key': 'Enter'},
                {'focus': 0}, {'key': 'Escape'}, {'button': 'CHANGE NAME'}, *focus_all, {'key': 'Escape'}])
    for slot in (0, 6):
        for option in range(15):
            add(f'faction-roster-{slot}-{option}', [{'slot': 3}, {'roster': {'slot': slot, 'option': option}}])
    add('faction-roster-mixed', [{'roster': {'slot': slot, 'option': slot}} for slot in (0, 2, 4, 6)] + [{'slot': 4}, {'key': 'Enter'}, {'key': 'Escape'}])
    add('faction-random-roster-edit', [{'slot': 2}, {'mode': 'random'}, {'roster': {'slot': 6, 'option': 0}}, {'mode': 'selected'}])
    replacements = ['Orion Vale', 'Orbit Guild', 'Orbiters', 'Orbital', 'Navigator', 'brisk', 'Male']
    edits = [{'edit': {'field': index, 'text': text}} for index, text in enumerate(replacements)]
    add('faction-customize-cancel', [{'button': 'CHANGE NAME'}, *edits, *focus_all, {'button': 'CANCEL'},
                                   {'button': 'CHANGE NAME'}, *focus_all, {'key': 'Escape'}])
    add('faction-customize-confirm', [{'button': 'CHANGE NAME'}, *edits, *focus_all, {'button': 'OK'},
                                    {'key': 'Enter'}, {'key': 'Escape'}])
    add('faction-customize-restore', [{'button': 'CHANGE NAME'}, *edits[:2], edits[-1], {'button': 'RESTORE DEFAULTS'},
                                    *focus_all, {'button': 'OK'}, {'key': 'Enter'}, {'key': 'Escape'}])
    add('faction-name-change-gender-confirm', [{'key': 'Enter'}, {'button': 'CHANGE GENDER'}, edits[-1],
                                            {'button': 'OK'}, {'key': 'Enter'}, {'key': 'Escape'}])
    add('faction-name-change-gender-cancel', [{'key': 'Enter'}, {'button': 'CHANGE GENDER'}, edits[0],
                                           {'key': 'Escape'}, {'key': 'Enter'}, {'key': 'Escape'}])
    for length in (0, 23, 24, 31, 32, 64):
        text = ('ABCDEFGHIJKLMNOPQRSTUVWXYZ' * 3)[:length]
        add(f'faction-name-length-{length}', [{'key': 'Enter'}, {'edit': {'field': 0, 'text': text}},
                                             {'key': 'Escape'}, {'key': 'Enter'}, {'key': 'Escape'}])
    add('faction-name-case-spaces', [{'key': 'Enter'}, {'edit': {'field': 0, 'text': '  Nova Pilot  '}},
                                    {'key': 'Escape'}, {'key': 'Enter'}, {'key': 'Escape'}])
    for index in range(7):
        add(f'faction-custom-field-length-{index}', [{'button': 'CHANGE NAME'},
            {'edit': {'field': index, 'text': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' * 2 + 'ABCDEFGHIJKL'}},
            {'focus': index}, {'button': 'CANCEL'}])
    for profile in ('common', 'expansion', 'both'):
        add('faction-source-' + profile, [{'key': 'Enter'}, {'key': 'Escape'}, {'button': 'CHANGE NAME'},
            *focus_all, {'button': 'RESTORE DEFAULTS'}, {'button': 'OK'}, {'key': 'Enter'}, {'key': 'Escape'}], profile)
        add('faction-source-alien-' + profile, [{'slot': 6}, {'key': 'Enter'}, {'key': 'Escape'}], profile)
    if len({case['id'] for case in cases}) != len(cases):
        raise ValueError('duplicate faction input id')
    return {'version': 1, 'name': 'original-faction-roster-and-leader-editors',
            'description': 'Public original setup inputs. Roster ordinal edits open/choose the actual dropdown; editor focus is explicit. Name confirmation and generated-world outcomes are outside this bounded contract.',
            'cases': cases}


def make_random_suite():
    """Additive observations resolve the random-mode customization target."""
    cases = []
    for name, prefix in (
        ('no-preview', [{'mode': 'random'}]),
        ('explicit-preview', [{'slot': 2}, {'mode': 'random'}, {'slot': 6}]),
    ):
        value = {'profile': 'default', 'actions': [*prefix, {'button': 'CHANGE NAME'},
                 *[{'focus': index} for index in range(7)], {'button': 'CANCEL'}, {'mode': 'selected'}]}
        validate_input(value)
        cases.append({'id': 'faction-random-customize-' + name, 'algorithm': ALGORITHM, 'input': value})
    return {'version': 1, 'name': 'original-random-faction-customization-target',
            'description': 'Additional input sequences; recorded separately without changing the original 80-case evidence.',
            'cases': cases}


if __name__ == '__main__':
    print(json.dumps(make_suite(), indent=2))
