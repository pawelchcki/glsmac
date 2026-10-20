#!/usr/bin/env python3
"""Execute original cost_factor paths with UI-calibrated resource/rating names."""
import argparse
import hashlib
from pathlib import Path
import sys

import original
from factors_v2 import ALGORITHMS, NUTRIENT, MINERAL, CUSTOM_NUTRIENT, CUSTOM_MINERAL, validate_input
from protocol import ProtocolError, load_request, write_response


def fixture(algorithm, values):
    validate_input(algorithm, values)
    # Preserve the historical adapter and records verbatim. Its v1 symbolic
    # names were reversed: physical mode0/c44/750 are nutrient/GROWTH, and
    # mode1/c50/754 are mineral/INDUSTRY. This maps fixture labels only; all
    # answers still execute the fingerprinted original instructions.
    nutrient = algorithm in (NUTRIENT, CUSTOM_NUTRIENT)
    custom = algorithm in (CUSTOM_NUTRIENT, CUSTOM_MINERAL)
    if nutrient:
        old = original.CUSTOM_MINERAL_FACTOR if custom else original.HUMAN_MINERAL_FACTOR
        data = {'faction_id': values['faction_id'], 'mineral_rule_factor': values['nutrient_rule_factor'], 'industry': values['growth']}
    else:
        old = original.CUSTOM_NUTRIENT_FACTOR if custom else original.HUMAN_NUTRIENT_FACTOR
        data = {'faction_id': values['faction_id'], 'nutrient_rule_factor': values['mineral_rule_factor'], 'growth': values['industry']}
    if not custom:
        data['map_size_level'] = values['map_size_level']
    original.validate_input(old, data)
    return old, data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe', type=Path, required=True)
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] in ALGORITHMS]
    prepared = [fixture(case['algorithm'], case['input']) for case in supported]
    oracle = original.OriginalOracle(original.load_image(args.exe))
    observed = [oracle.probe(algorithm, values) for algorithm, values in prepared]
    digest = hashlib.sha256()
    for name in ('factors_v2_original.py', 'factors_v2.py', 'original.py'):
        digest.update(Path(__file__).with_name(name).read_bytes())
    metadata = oracle.metadata(algorithm for algorithm, values in prepared)
    metadata.update(adapter_version=4, adapter_sha256=digest.hexdigest(),
                    calibration_contract='game.faction_social_ratings.v1',
                    semantic_correction='v1 resource/rating labels were reversed; v1 observations remain unchanged',
                    functions=[{'algorithm': algorithm, 'function': 'cost_factor (human, no base)', 'address': '0x004E4430',
                                'resource_mode': 0 if algorithm in (NUTRIENT, CUSTOM_NUTRIENT) else 1,
                                'rating_address': '0x0096CC44' if algorithm in (NUTRIENT, CUSTOM_NUTRIENT) else '0x0096CC50',
                                'rule_address': '0x00949750' if algorithm in (NUTRIENT, CUSTOM_NUTRIENT) else '0x00949754'}
                               for algorithm in sorted({case['algorithm'] for case in supported})])
    iterator = iter(observed)
    write_response(metadata, [{'id': case['id'], 'status': 'ok', 'output': next(iterator)} if case['algorithm'] in ALGORITHMS else
                             {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown calibrated factor contract'} for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, original.ProbeError, ProtocolError) as error:
        print(f'Calibrated original factors failed: {error}', file=sys.stderr); sys.exit(1)
