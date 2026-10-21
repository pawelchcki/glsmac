"""Synthetic declarations and requested controls, without output answers."""
from copy import deepcopy
import json
from ui.unit_menu_orders_inputs import declarations, source_label
from ui import unit_menu_context_contract as contract


def suite():
    cases = []
    for identifier, profile, actions in contract.SEQUENCES:
        data = dict(profile='stacked', initial_base=deepcopy(contract.INITIAL),
                    text_profile=profile, actions=deepcopy(actions))
        contract.validate_input(data)
        cases.append(dict(id=identifier, algorithm=contract.ALGORITHM, input=data))
    return dict(version=1, name='Action-menu orders after native unit navigation',
                description='Input-only initial Tab navigation, source-slot clicks and subsequent Tab; no supplied effects.',
                cases=cases)


if __name__ == '__main__':
    print(json.dumps(suite(), indent=2))
