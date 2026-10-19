#!/usr/bin/env python3
"""Generate keyboard input sequences; no expected behavior is calculated."""

import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ui.discover import case_for
from ui.probe import validate_input


DIRECTORY = Path(__file__).resolve().parent


def make_suite():
    start = ['START GAME']
    random = start + ['MAKE RANDOM MAP']
    custom = start + ['CUSTOMIZE RANDOM MAP', 'STANDARD PLANET']
    # Counts are input budgets for reaching both ends, not selection answers.
    # Routes and choices were observed in the original discovery lane.
    routes = [([], 7, True), (start, 5, True), (['SCENARIO'], 4, False),
              (random, 6, True), (random + ['STANDARD PLANET'], 6, True),
              (random + ['STANDARD PLANET', 'CITIZEN'], 3, False),
              (custom, 3, True), (custom + ['50-70% OF SURFACE'], 3, True),
              (custom + ['50-70% OF SURFACE', 'AVERAGE'], 3, True),
              (custom + ['50-70% OF SURFACE', 'AVERAGE', 'AVERAGE'], 3, True)]
    existing = {row['id'] for row in json.loads((DIRECTORY / 'cases/menus.json').read_text())['cases']}
    cases = {}
    for route, count, enter_stays_in_observer in routes:
        prefix = [{'choose': label} for label in route]
        extensions = [['Home'], ['End'], ['ArrowDown'] * count + ['ArrowUp'] * count,
                      ['ArrowUp'] * count + ['ArrowDown'] * count]
        if route:
            extensions.append(['Escape'])
        if enter_stays_in_observer:
            extensions.append(['Enter'])
        for keys in extensions:
            case = case_for(prefix + [{'key': key} for key in keys])
            validate_input(case['input'])
            if case['id'] not in existing:
                cases[case['id']] = case
    return {'version': 1, 'name': 'original-menu-keyboard-boundaries',
            'description': 'New Home/End, both full navigation cycles, Enter and Escape paths on ten observed menu screens. Inputs only; record original results independently.',
            'cases': list(cases.values())}


if __name__ == '__main__':
    suite = make_suite()
    destination = DIRECTORY / 'cases/navigation.json'
    destination.write_text(json.dumps(suite, indent=2) + '\n')
    print(f"Generated {len(suite['cases'])} keyboard paths without expected outputs")
