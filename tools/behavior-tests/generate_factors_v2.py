#!/usr/bin/env python3
"""Reproduce input coverage under corrected labels; never read old answers."""
import json
from pathlib import Path
from factors_v2 import NUTRIENT, MINERAL, CUSTOM_NUTRIENT, CUSTOM_MINERAL, validate_input

DIRECTORY = Path(__file__).resolve().parent
SOURCES = (
    ('human-mineral-factor', 'human-growth-nutrient-factor-v2'),
    ('human-nutrient-factor', 'human-industry-mineral-factor-v2'),
    ('human-nutrient-factor-held-out', 'human-industry-mineral-held-out-v2'),
    ('custom-map-human-factors', 'custom-map-human-factors-v2'),
)


def make_suites():
    results = {}
    for source, target in SOURCES:
        previous = json.loads((DIRECTORY / 'cases' / (source + '.json')).read_text())
        cases = []
        for case in previous['cases']:
            data = case['input']; nutrient = 'mineral' in case['algorithm']; custom = 'custom_map' in case['algorithm']
            values = {'faction_id': data['faction_id']}
            if nutrient:
                algorithm = CUSTOM_NUTRIENT if custom else NUTRIENT
                values.update(nutrient_rule_factor=data['mineral_rule_factor'], growth=data['industry'])
            else:
                algorithm = CUSTOM_MINERAL if custom else MINERAL
                values.update(mineral_rule_factor=data['nutrient_rule_factor'], industry=data['growth'])
            if not custom:
                values['map_size_level'] = data['map_size_level']
            validate_input(algorithm, values)
            cases.append({'id': 'v2-' + case['id'], 'algorithm': algorithm, 'input': values})
        results[target] = {'version': 1, 'name': target,
                           'description': 'Fresh original execution required. Input coverage follows historical numeric fields with resource/rating labels calibrated against actual Social Engineering and controlled rule-source observations.',
                           'cases': cases}
    witnesses = []
    for level in range(5):
        for rule in (11, 13):
            for algorithm, rule_key, rating in ((NUTRIENT, 'nutrient_rule_factor', 'growth'), (MINERAL, 'mineral_rule_factor', 'industry')):
                value = {'faction_id': 1, 'map_size_level': level, rule_key: rule, rating: 0}
                validate_input(algorithm, value)
                witnesses.append({'id': f'zero-{rating}-level{level}-rule{rule}', 'algorithm': algorithm, 'input': value})
    results['human-calibrated-zero-witnesses-v2'] = {'version': 1, 'name': 'human-calibrated-zero-witnesses-v2',
        'description': 'Explicit calibrated original witnesses for source-rule application browser tests; no social rating modifiers.', 'cases': witnesses}
    return results


if __name__ == '__main__':
    for name, suite in make_suites().items():
        path = DIRECTORY / 'cases' / (name + '.json')
        if path.exists():
            raise SystemExit('refusing to overwrite ' + str(path))
        path.write_text(json.dumps(suite, indent=2) + '\n')
        print(name, len(suite['cases']))
