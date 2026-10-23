"""Synthetic installed text and real keyboard actions, without expected outputs."""
from copy import deepcopy
import json
from ui.unit_disband_inputs import declarations, source_label
from ui.unit_disband_shortcut_contract import ALGORITHM, INITIAL, PROFILES, SEQUENCES, validate_input


def suite():
    cases = []
    for profile in PROFILES:
        data = dict(profile='spread', initial_base=deepcopy(INITIAL), text_profile=profile,
                    actions=deepcopy(SEQUENCES[profile]))
        validate_input(data)
        cases.append(dict(id='unit-disband-shortcut-' + profile, algorithm=ALGORITHM, input=data))
    return dict(version=1, name='Ready Former Disband keyboard controls',
                description='Actual Tab and Shift+D, cancellation, reopening, draft choice navigation and ordinary confirmation; no menu-pointer substitution.',
                cases=cases)


if __name__ == '__main__':
    print(json.dumps(suite(), indent=2))
