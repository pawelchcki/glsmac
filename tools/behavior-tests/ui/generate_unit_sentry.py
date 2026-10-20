#!/usr/bin/env python3
"""Generate bounded original Sentry input sequences, never answers."""
import json


def suite():
    cases = []
    for mask in range(1, 8):
        actions = ['sleep' if mask & (1 << index) else 'skip' for index in range(3)]
        cases.append({'id': f'sentry-skip-mask-{mask}-turn', 'algorithm': 'game.unit_sentry_lifecycle.v1',
                      'input': {'profile': 'stacked', 'actions': actions + ['advance', 'wait', 'tab']}})
    cases.append({'id': 'sentry-scout-held-turn', 'algorithm': 'game.unit_sentry_lifecycle.v1',
                  'input': {'profile': 'stacked', 'actions': ['sleep', 'hold', 'hold', 'advance', 'wait', 'tab']}})
    return {'version': 1, 'name': 'Original three-unit Sentry lifecycle',
            'description': 'Input-only real L/H/Space/W/Tab and one paused turn; every nonempty sentry subset alongside skipped units, plus sentry Scout and held companions. No supplied answers.',
            'cases': cases}


if __name__ == '__main__': print(json.dumps(suite(), indent=2))
