#!/usr/bin/env python3
"""Generate declared synthetic terrain inputs; never compute resource answers."""
import itertools
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from economy.worker_resources_contract import ALGORITHM, PROFILES, IMPROVEMENTS


def suite():
    cases = []
    for profile, faction, rainfall, rockiness, improvement, owned in itertools.product(
            PROFILES, (1, 7), range(3), range(3), IMPROVEMENTS, (False, True)):
        coordinate = 0 if faction == 1 else 2
        cases.append({'id': f'{profile}-f{faction}-rain{rainfall}-rock{rockiness}-{improvement}-tech{int(owned)}',
                      'algorithm': ALGORITHM, 'input': dict(profile=profile, faction_id=faction, x=coordinate, y=coordinate,
                                                          rainfall=rainfall, rockiness=rockiness,
                                                          improvement=improvement, cap_tech_owned=owned)})
    return {'version': 1, 'name': 'Bounded land worker improvements and resource caps',
            'description': 'Non-base land queries on a synthetic 4x4 map, no bonuses/fungus/river/facilities/events. '
                           'All rainfall/rockiness pairs; bare, farm, mine, road combinations and forest; two source-rule profiles and owned/unowned synthetic cap technology. '
                           'Some rocky improvement states are editor-style inputs, not a claim they can be constructed directly. Solar, sea, fungus, special terrain and complete economy are outside this contract.',
            'cases': cases}


if __name__ == '__main__':
    Path(__file__).with_name('cases').joinpath('land-worker-resources.json').write_text(json.dumps(suite(), indent=2) + '\n')
