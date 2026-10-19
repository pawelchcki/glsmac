#!/usr/bin/env python3
"""Generate basic production-switch inputs, never expected answers."""
import itertools
import json
from pathlib import Path

PAIRS = ((0, 0), (0, 17), (17, 0), (0, -3), (-3, 0), (-3, -3), (-3, -4), (-64, 511), (511, -1))
MINERALS = (0, 1, 9, 10, 11, 12, 13, 19, 20, 21, 30, 31, 99, 100, 999_999, 1_000_000)


def cases():
    return [dict(id=f'switch-{index:04d}', algorithm='economy.basic_production_switch_loss.v1',
                 input=dict(base_id=base, faction_id=faction, previous_item=previous,
                            current_item=current, minerals=minerals))
            for index, (base, faction, (previous, current), minerals) in enumerate(
                itertools.product((0, 7), range(1, 8), PAIRS, MINERALS))]


def main():
    document = dict(version=1, name='Human basic production-switch mineral loss',
                    description='Synthetic base records with human owner, default strictness2/penalty50/exemption10, no installed facilities or Skunkworks. Item codes -64..-1 are basic facilities and 0..511 are unit slots. Output is mineral loss only; excludes availability, complete switching, UI, AI, projects, orbitals, stockpile and modified rules. Mineral inputs bounded to 0..1000000 to avoid original signed multiplication overflow.',
                    cases=cases())
    path = Path(__file__).with_name('cases') / 'basic-production-switch-loss.json'
    path.write_text(json.dumps(document, indent=2) + '\n')
    print(f'{len(document["cases"])} synthetic input cases')


if __name__ == '__main__':
    main()
