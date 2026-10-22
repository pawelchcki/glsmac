"""Public source files and real player actions; contains no observed answers."""
from copy import deepcopy
import json
from protocol import ProtocolError
from ui import ingame_menu_inputs as base_inputs
from ui.colony_found_menu_contract import ALGORITHM, INITIAL, PROFILES, SEQUENCES, validate_input

SOURCE_TEXT = {
    'synthetic': dict(caption='Name your settlement.', label='Name:', draft='Draft Grove', row='&Found Base'),
    'found-edited': dict(caption='Choose a settlement name.', label='Base:', draft='Draft Harbor', row='&Create Settlement'),
}


def declarations(profile):
    if profile not in PROFILES:
        raise ProtocolError('Unknown Colony founding source profile')
    data = SOURCE_TEXT[profile]
    sources = base_inputs.declarations('synthetic')
    lines = sources['menu.txt'].splitlines()
    index = lines.index('#ACTION') + 2
    lines[index] = data['row'] + '|' + lines[index].split('|', 1)[1]
    sources['menu.txt'] = '\n'.join(lines) + '\n'
    sources['script.txt'] = '#NEWBASE\n#x 10\n#y 40\n#xs 320\n#caption ' + data['caption'] + '\n\n' + data['label'] + '\n\n#END\n'
    sources['gaians.txt'] = '#BASES\n' + (data['draft'] + '\n') * 64 + '\n#END\n'
    return sources


def source_label(profile):
    return SOURCE_TEXT[profile]['row']


def suite():
    cases = []
    for profile in PROFILES:
        data = dict(profile='spread-distant', initial_base=deepcopy(INITIAL), text_profile=profile,
                    actions=deepcopy(SEQUENCES[profile]))
        validate_input(data)
        cases.append(dict(id='colony-found-menu-' + profile, algorithm=ALGORITHM, input=data))
    return dict(version=1, name='Colony Pod Action city naming and cancellation',
                description='Actual source0 menu, edit, cancel, reopen, edit and confirm; source name pools are inputs, never dialog answers.',
                cases=cases)


if __name__ == '__main__':
    print(json.dumps(suite(), indent=2))
