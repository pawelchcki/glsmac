#!/usr/bin/env python3
"""Generate initial faction/rule inputs without expected answers."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ui.faction_ratings_contract import ALGORITHM, PROFILES, validate_input


def make_suite():
    cases = []
    for preset in ('base', 'expansion'):
        for slot in range(7):
            cases.append({'id': f'ratings-{preset}-{slot}', 'algorithm': ALGORITHM,
                          'input': {'preset': preset, 'slot': slot, 'profile': 'default'}})
    for profile in PROFILES[1:]:
        cases.append({'id': 'ratings-' + profile, 'algorithm': ALGORITHM,
                      'input': {'preset': 'expansion', 'slot': 0, 'profile': profile}})
    for case in cases:
        validate_input(case['input'])
    return {'version': 1, 'name': 'original-initial-faction-social-ratings',
            'description': 'Initial selected human ratings after first-base setup, independently checked against actual Social Engineering labels. No social policy changes, AI or other faction bonuses.',
            'cases': cases}


if __name__ == '__main__':
    print(json.dumps(make_suite(), indent=2))
