"""Public synthetic source inputs and pointer actions, without result data."""
from copy import deepcopy
import json
from protocol import ProtocolError
from ui import ingame_menu_inputs as base_inputs
from ui.terraform_menu_contract import ALGORITHM, INITIAL, PROFILES, TERRAIN_ROWS, validate_input


def declarations(profile):
    if profile not in PROFILES:
        raise ProtocolError('Unknown Terraform source profile')
    sources = base_inputs.declarations('synthetic')
    if profile == 'terrain-edited':
        lines = sources['alphax.txt'].splitlines()
        for row, label in ((0, 'Cultivate'), (2, 'Extract'), (4, 'Plant Trees'), (5, 'Lay Route')):
            fields = lines[1 + row].split(',')
            fields[0] = label
            lines[1 + row] = ','.join(fields)
        sources['alphax.txt'] = '\n'.join(lines) + '\n'
    return sources


def source_label(profile, row):
    if type(row) is not int or row not in TERRAIN_ROWS:
        raise ProtocolError('Invalid declared Terraform target')
    fields = declarations(profile)['alphax.txt'].splitlines()[1 + row].split(',')
    return fields[5].replace('$STR0', fields[0])


def suite():
    cases = []
    for profile in PROFILES:
        for row in TERRAIN_ROWS:
            data = dict(profile='spread', initial_base=deepcopy(INITIAL), text_profile=profile,
                        actions=['menu', {'header': 5}, {'terrain_index': row}, 'tab'])
            validate_input(data)
            cases.append(dict(id=f'terraform-menu-{row}-{profile}', algorithm=ALGORITHM, input=data))
    return dict(version=1, name='Terraform menu work controls',
                description='Actual row clicks and Tab on native healthy arid Former; source inputs only.',
                cases=cases)


if __name__ == '__main__':
    print(json.dumps(suite(), indent=2))
