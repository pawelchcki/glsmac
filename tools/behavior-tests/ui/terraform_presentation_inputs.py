"""Public source inputs and navigation actions; no presentation answers."""
from copy import deepcopy
import json
from protocol import ProtocolError
from ui import terraform_menu_inputs as previous
from ui.terraform_presentation_contract import ALGORITHM, INITIAL, PROFILES, ACTIONS, validate_input


def declarations(profile):
    if profile not in PROFILES:
        raise ProtocolError('Unknown Terraform presentation source profile')
    sources = previous.declarations(profile if profile != 'rates-edited' else 'synthetic')
    if profile == 'rates-edited':
        lines = sources['alphax.txt'].splitlines()
        for index in range(20):
            fields = lines[index + 1].split(',')
            fields[4] = str(1 + index % 4)
            lines[index + 1] = ','.join(fields)
        sources['alphax.txt'] = '\n'.join(lines) + '\n'
    return sources


def suite():
    cases = []
    for profile in PROFILES:
        data = dict(profile='spread', initial_base=deepcopy(INITIAL), text_profile=profile,
                    actions=deepcopy(ACTIONS))
        validate_input(data)
        cases.append(dict(id='terraform-presentation-' + profile, algorithm=ALGORITHM, input=data))
    return dict(version=1, name='Terraform menu Former and Colony presentation',
                description='Complete observed labels, tones and groups across MENU/header/Escape/Tab; edited names and rates are inputs only.',
                cases=cases)


if __name__ == '__main__':
    print(json.dumps(suite(), indent=2))
