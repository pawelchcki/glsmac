#!/usr/bin/env python3
"""Generate synthetic no-ability prototype component fixtures, never answers."""
import itertools
import argparse
import json
from pathlib import Path
import random


def suite():
    profiles = {}
    def add(chassis, weapon, armor, triad, reactor, mode=0, missile=False, offense=0):
        data = dict(triad=triad, chassis_cost=chassis, missile=missile, offense=offense,
                    weapon_mode=mode, weapon_cost=weapon, armor_cost=armor, reactor=reactor)
        profiles.setdefault(json.dumps(data, sort_keys=True), data)
    for chassis, weapon, armor, triad, reactor in itertools.product((1, 2, 3, 5, 8), (1, 2, 3, 5, 8), (1, 2, 3, 5, 8), range(3), range(1, 5)):
        add(chassis, weapon, armor, triad, reactor)
    components = ((1, 1, 1), (1, 8, 1), (2, 3, 5), (8, 2, 3), (16, 32, 8), (32, 16, 32))
    for (chassis, weapon, armor), triad, reactor, mode in itertools.product(components, range(3), range(1, 5), (0, 2, 8, 11, 14)):
        add(chassis, weapon, armor, triad, reactor, mode)
    for (chassis, weapon, armor), triad, reactor, offense in itertools.product(components, range(3), range(1, 5), (-1, 0, 98, 99, 100, 127)):
        add(chassis, weapon, armor, triad, reactor, missile=True, offense=offense)
    for axis, value, triad, reactor in itertools.product(range(3), (16, 32), range(3), range(1, 5)):
        costs = [1, 1, 1]
        costs[axis] = value
        add(*costs, triad, reactor)
    rng = random.Random(20261019)
    for _ in range(128):
        add(*(rng.randint(1, 32) for _ in range(3)), rng.randrange(3), rng.randint(1, 4),
            rng.randrange(15), bool(rng.randrange(2)), rng.choice((-1, 0, 98, 99, 100, 127)))
    rows = []
    for index, data in enumerate(profiles.values()):
        values = dict(chassis_id=(0, 4, 8)[index % 3], weapon_id=(0, 8, 25)[index // 3 % 3], armor_id=(0, 6, 13)[index // 9 % 3], **data)
        rows.append(dict(id=f'prototype-{index:04d}', algorithm='unit.prototype_base_cost.v1', input=values))
    for sample, data in enumerate(list(profiles.values())[:4]):
        for chassis, weapon, armor in ((0, 0, 0), (4, 8, 6), (8, 25, 13)):
            rows.append(dict(id=f'slot-reset-{sample}-{chassis}-{weapon}-{armor}', algorithm='unit.prototype_base_cost.v1',
                             input=dict(chassis_id=chassis, weapon_id=weapon, armor_id=armor, **data)))
    return dict(version=1, name='Prototype mineral-row base costs without abilities', description=(
        'Synthetic component records; cost bytes 1..32, triad 0..2, missile flag, signed offense -1..127, '
        'weapon mode 0..14 and reactor 1..4. Original component table slots chassis0..8/weapon0..25/armor0..13. '
        'Ability mask is fixed zero. Output is mineral rows, not final minerals: excludes faction/map factors, '
        'prototype surcharges, unit availability/design validation, production and UI. Matrices and boundary samples '
        'do not exhaust every valid input. No original rules database or code is embedded.'), cases=rows)


def supplemental(name):
    rows = []
    def add(case_id, **values):
        rows.append(dict(id=case_id, algorithm='unit.prototype_base_cost.v1', input=dict(
            chassis_id=0, weapon_id=0, armor_id=0, triad=0, chassis_cost=1,
            missile=False, offense=0, weapon_mode=0, weapon_cost=1, armor_cost=1, reactor=1) | values))
    if name == 'prototype-cost-chassis-sweep':
        for chassis, triad, reactor, (weapon, armor) in itertools.product(range(1, 33), range(3), range(1, 5), ((1, 1), (8, 1), (1, 8), (8, 8))):
            add(f'chassis-{chassis}-t{triad}-r{reactor}-w{weapon}-a{armor}', chassis_cost=chassis,
                triad=triad, reactor=reactor, weapon_cost=weapon, armor_cost=armor)
    elif name == 'prototype-cost-sea-mode11':
        for chassis, weapon, reactor in itertools.product(range(1, 17), range(1, 9), range(1, 5)):
            add(f'sea-mode11-c{chassis}-w{weapon}-r{reactor}', chassis_cost=chassis, triad=1,
                weapon_mode=11, weapon_cost=weapon, armor_cost=5, reactor=reactor)
    else:
        rng = random.Random(2026101902)
        for index in range(1024):
            add(f'held-out-{index:04d}', chassis_id=rng.randrange(9), weapon_id=rng.randrange(26),
                armor_id=rng.randrange(14), triad=rng.randrange(3), chassis_cost=rng.randint(1, 32),
                missile=bool(rng.randrange(2)), offense=rng.randint(-1, 127), weapon_mode=rng.randrange(15),
                weapon_cost=rng.randint(1, 32), armor_cost=rng.randint(1, 32), reactor=rng.randint(1, 4))
    return rows


if __name__ == '__main__':
    names = ('prototype-base-cost', 'prototype-cost-chassis-sweep', 'prototype-cost-sea-mode11', 'prototype-cost-held-out')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--suite', choices=(*names, 'all'), default=names[0])
    args = parser.parse_args()
    for name in names if args.suite == 'all' else (args.suite,):
        path = Path(__file__).with_name('cases') / f'{name}.json'
        value = suite() if name == names[0] else json.loads(path.read_text())
        if name != names[0]:
            value['cases'] = supplemental(name)
        path.write_text(json.dumps(value, indent=2) + '\n')
        print(f'{name}: {len(value["cases"])} input fixtures')
