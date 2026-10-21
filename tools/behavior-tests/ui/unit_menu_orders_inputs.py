"""Synthetic Action-menu declarations and input-only command sequences."""
from copy import deepcopy
import json
from protocol import ProtocolError
from ui import ingame_menu_inputs as base_inputs
from ui.unit_menu_orders_contract import ALGORITHM, INITIAL, PROFILES, SEQUENCES, validate_input


def declarations(profile):
    if profile not in PROFILES:
        raise ProtocolError('Unknown unit-menu source profile')
    sources = base_inputs.declarations('synthetic')
    if profile == 'action-edited':
        lines = sources['menu.txt'].splitlines()
        start = lines.index('#ACTION')
        lines[start + 1] = '&Orders'
        for slot, label in ((26, '&Watch Here'), (29, '&Stay Here'), (30, '&Pause Now')):
            old = lines[start + 2 + slot]
            lines[start + 2 + slot] = label + '|' + old.split('|', 1)[1]
        sources['menu.txt'] = '\n'.join(lines) + '\n'
    return sources


def source_label(profile, slot):
    """Declared interaction target; this is not an observed display answer."""
    if type(slot) is not int or not 0 <= slot < 31:
        raise ProtocolError('Invalid Action source slot')
    lines = declarations(profile)['menu.txt'].splitlines()
    return lines[lines.index('#ACTION') + 2 + slot].split('|', 1)[0]


def suite():
    cases = []
    for identifier, profile, actions in SEQUENCES:
        data = dict(profile='stacked', initial_base=deepcopy(INITIAL), text_profile=profile,
                    actions=deepcopy(actions))
        validate_input(data)
        cases.append(dict(id=identifier, algorithm=ALGORITHM, input=data))
    return dict(version=1, name='Bounded Action-menu source-slot commands',
                description='Input-only source-slot clicks and Tab with identical declared source profiles; no supplied effects.',
                cases=cases)


if __name__ == '__main__':
    print(json.dumps(suite(), indent=2))
