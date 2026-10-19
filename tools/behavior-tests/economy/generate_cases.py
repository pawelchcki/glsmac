#!/usr/bin/env python3
"""Synthetic base-square fixtures; this generator contains no resource answers."""
import itertools
import json
from pathlib import Path


def suite():
    cases = []
    for faction, base, (x, y), (land, river), headquarters, tanks in itertools.product(
        range(1, 8), (0, 1, 7), ((0, 0), (2, 2)),
        ((True, False), (True, True), (False, False)), (False, True), (False, True),
    ):
        cases.append({
            'id': f'f{faction}-b{base}-x{x}-y{y}-land{int(land)}-river{int(river)}-hq{int(headquarters)}-tanks{int(tanks)}',
            'algorithm': 'economy.base_square_resources.v1',
            'input': dict(faction_id=faction, base_id=base, x=x, y=y, land=land,
                          river=river, headquarters=headquarters, recycling_tanks=tanks),
        })
    return dict(version=1, name='Bounded base-square resources', description=(
        'Per-turn base-square NUTRIENTS/MINERALS/ENERGY on a synthetic 4x4 staggered map. '
        'Factions 1..7; base record 0,1,7; positions (0,0)/(2,2); bare land, land river or sea; '
        'independent Headquarters and Recycling Tanks flags. Rules: base square (2,1,1), '
        'resource bonus (2,2,2), tank (1,1,1). No special terrain, resource bonuses, '
        'terraforming, economy rating, events, projects, other facilities or upkeep overrides. '
        'This contract excludes worker-tile yields, full base output, item costs and construction.'
    ), cases=cases)


if __name__ == '__main__':
    Path(__file__).with_name('cases').joinpath('base-square-resources.json').write_text(
        json.dumps(suite(), indent=2) + '\n')
