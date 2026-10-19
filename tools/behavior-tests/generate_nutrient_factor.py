#!/usr/bin/env python3
"""Regenerate synthetic nutrient-factor inputs, never original answers."""
import argparse
import itertools
import json
from pathlib import Path
import random


SAMPLED_RULES = (1, 2, 3, 7, 10, 11, 100)


def cases(held_out=False):
    if held_out:
        rng = random.Random(2026101903)
        rules = [value for value in range(1, 101) if value not in SAMPLED_RULES]
        return [dict(id=f'nutrient-held-out-{index:04d}', algorithm='economy.human_nutrient_factor.v1',
                     input=dict(faction_id=rng.randint(1, 7), map_size_level=rng.randrange(5),
                                nutrient_rule_factor=rng.choice(rules), growth=rng.randint(-8, 10)))
                for index in range(1024)]
    return [dict(id=f'f{faction}-m{level}-g{growth}-r{rule}', algorithm='economy.human_nutrient_factor.v1',
                 input=dict(faction_id=faction, map_size_level=level, nutrient_rule_factor=rule, growth=growth))
            for faction, level, growth, rule in itertools.product(range(1, 8), range(5), range(-8, 11), SAMPLED_RULES)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--suite', choices=('matrix', 'held-out', 'all'), default='all')
    args = parser.parse_args()
    for held_out in (False, True):
        if args.suite != 'all' and held_out != (args.suite == 'held-out'):
            continue
        name = 'human-nutrient-factor-held-out' if held_out else 'human-nutrient-factor'
        path = Path(__file__).with_name('cases') / f'{name}.json'
        # Keep the published fixture's description; only generate its inputs.
        document = json.loads(path.read_text())
        document['cases'] = cases(held_out)
        path.write_text(json.dumps(document, indent=2) + '\n')
        print(f'{name}: {len(document["cases"])} input fixtures')


if __name__ == '__main__':
    main()
