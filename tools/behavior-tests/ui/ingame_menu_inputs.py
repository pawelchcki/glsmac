"""Generate synthetic installed menu sources and action cases, never answers."""
import json
from copy import deepcopy

from protocol import ProtocolError
from ui.ingame_menu_contract import ALGORITHM, INITIAL, MENU_SPECS, PROFILES, SEQUENCES, validate_input

WORDS = (
    'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen', 'Twenty', 'Twenty One', 'Twenty Two', 'Twenty Three',
    'Twenty Four', 'Twenty Five', 'Twenty Six', 'Twenty Seven', 'Twenty Eight',
    'Twenty Nine', 'Thirty', 'Thirty One',
)


def declarations(profile):
    """Identical declared menu.txt inputs for both applications, in ASCII."""
    if profile not in PROFILES:
        raise ProtocolError('Unknown in-game menu source profile')
    blocks = []
    for block_id, title, count in MENU_SPECS:
        lines = ['#' + block_id, '&Core' if profile == 'game-edited' and block_id == 'GAME' else title]
        for index in range(count):
            label = title + ' Entry ' + WORDS[index]
            if profile == 'game-edited' and block_id == 'GAME':
                if index == 1:
                    label = '&Compact Choices'
                elif index == 12:
                    label = '&Depart'
            lines.append(label + '|Key ' + WORDS[index])
        blocks.append('\n'.join(lines))
    # A complete synthetic TERRAIN block makes dynamic menu labels public
    # inputs too. All twenty land/sea prerequisites are deliberately None;
    # these are fixture declarations, not claims about original technology.
    terrain = ['#TERRAIN']
    for word in WORDS[:20]:
        terrain.append(f'Site {word},None,Water {word},None,4,Shape $STR0,q,Q')
    return {'menu.txt': '\n\n'.join(blocks) + '\n#END\n',
            'alphax.txt': '\n'.join(terrain) + '\n#END\n'}


def suite():
    cases = []
    for identifier, profile, actions in SEQUENCES:
        data = dict(profile='stacked', initial_base=deepcopy(INITIAL), text_profile=profile, actions=deepcopy(actions))
        validate_input(data)
        cases.append(dict(id=identifier, algorithm=ALGORITHM, input=data))
    return dict(version=1, name='Bounded in-game menu presentation and navigation',
                description='Input-only nine-header, root-toggle, header-switch and synthetic-source traces. No row actions or supplied answers.',
                cases=cases)


if __name__ == '__main__':
    print(json.dumps(suite(), indent=2))
