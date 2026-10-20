"""Declared road inputs without expected original movement outcomes."""
import json
from pathlib import Path
import struct
from ui.former_work_sources import arid_map
from ui.road_network_contract import ALGORITHM, PROFILES


def map_input(profile):
    moisture, rockiness, forest = PROFILES[profile]
    data = bytearray(arid_map())
    for index in range(40 * 80 // 2):
        at = 15 + 0xaa4 + index * 44
        data[at] = 3 * 32 + (moisture - 1) * 8
        data[at + 5] = (rockiness - 1) * 64
        flags = 0 if profile == 'base-road' else 4 | (0x200000 if forest else 0)
        struct.pack_into('<I', data, at + 8, flags)
    return bytes(data)


def suite():
    return {'version': 1, 'name': 'Original road network terrain and base entry',
            'description': 'Fresh healthy Gaian ordinary Former and held Scout on declared 40x80 synthetic land; '
                           'Citizen/standard, unchanged installed RULES and UNIT1 input. The all-road arid forest profile '
                           'starts east of the base at MY2102 after a real move and turn. The flat arid base profile instead builds the adjacent road '
                           'through a real Road command and turn before recording at MY2103. Current-tile terrain and base flags are observed, '
                           'never used as supplied outputs. Relative same-row position is tile steps; spent movement is thirds. '
                           'No fungus, combat, ZOC, other units or changed movement rates.',
            'cases': [{'id': 'road-network-' + profile, 'algorithm': ALGORITHM,
                       'input': {'profile': profile, 'actions': ['west', 'east', 'west', 'advance', 'east']
                                 if profile == 'base-road' else ['east', 'west', 'east']}}
                      for profile in PROFILES]}


if __name__ == '__main__':
    Path(__file__).with_name('cases').joinpath('road-network.json').write_text(json.dumps(suite(), indent=2) + '\n')
