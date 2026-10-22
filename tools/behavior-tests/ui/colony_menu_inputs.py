"""Input-only owned-city Colony menu actions and public text declarations."""
from copy import deepcopy
import json
from protocol import ProtocolError
from ui import ingame_menu_inputs as base_inputs
from ui.colony_menu_contract import ALGORITHM, INITIAL, PROFILES, validate_input


def declarations(profile):
    if profile not in PROFILES:
        raise ProtocolError('Unknown Colony menu source profile')
    sources = base_inputs.declarations('synthetic')
    if profile == 'join-edited':
        lines = sources['menu.txt'].splitlines()
        index = lines.index('#ACTION') + 3
        lines[index] = '&Add Citizens|' + lines[index].split('|', 1)[1]
        sources['menu.txt'] = '\n'.join(lines) + '\n'
    return sources


def source_label(profile):
    lines = declarations(profile)['menu.txt'].splitlines()
    return lines[lines.index('#ACTION') + 3].split('|', 1)[0]


def suite():
    cases = []
    for profile in PROFILES:
        data = dict(profile='stacked', initial_base=deepcopy(INITIAL), text_profile=profile,
                    actions=['tab', 'tab', 'menu', {'header': 4}, {'row_source': 1}, 'tab'])
        validate_input(data)
        cases.append(dict(id='colony-menu-join-' + profile, algorithm=ALGORITHM, input=data))
    return dict(version=1, name='Colony Pod owned-base Action menu join',
                description='Actual Tab/Action menu source1/Tab; no result data or commands supplied by fixture.',
                cases=cases)


if __name__ == '__main__':
    print(json.dumps(suite(), indent=2))
