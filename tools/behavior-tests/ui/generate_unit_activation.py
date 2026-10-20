"""Input-only activation-picker keyboard/mouse and source-profile challenges."""
import json
from pathlib import Path
from ui.unit_activation_contract import ALGORITHM


def suite():
    specs = [
        ('default-cancel', 'default', ['open', 'escape']),
        ('default-enter', 'default', ['open', 'enter']),
        ('navigation', 'default', ['open', 'down', 'down', 'down', 'up', 'home', 'end', 'enter']),
        ('row-click', 'default', ['open', 'click2']),
        ('mouse-ok', 'default', ['open', 'ok']),
        ('mouse-cancel', 'default', ['open', 'cancel']),
        ('caption-source', 'edited-caption', ['open', 'escape']),
    ]
    return {'version': 1, 'name': 'Original three-unit activation picker',
            'description': 'Fresh stacked three-unit fixture from game.unit_selection.v1, actual Hold on Scout/Former/Pod then A. Observe visible caption, ordered unit roles, selection frame, buttons and actual selected identity/orders/movement. Input-only keyboard/mouse sequences plus one paired installed PICKUNIT caption edit; no supplied answers.',
            'cases': [{'id': 'activate-' + name, 'algorithm': ALGORITHM,
                       'input': {'profile': profile, 'actions': actions}} for name, profile, actions in specs]}


if __name__ == '__main__':
    Path(__file__).with_name('cases').joinpath('unit-activation.json').write_text(json.dumps(suite(), indent=2) + '\n')
