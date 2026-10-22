#!/usr/bin/env python3
"""Replay archived faction startups; source-map scalar equivalence stays unsupported."""
import argparse
import os
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui import natural_first_city_headless as runner
from ui.natural_first_city_profiles_contract import (
    FACTIONS_ALGORITHM, SOURCES_ALGORITHM, diagnostic_supported, unsupported_reason,
)

SOURCE_PRELUDE = "const city_sources = #include('./_natural_first_city_sources_fixture')(city_input);\n"


def replay(cases, runtime, node='node'):
    reasons = {case['id']: unsupported_reason(case) for case in cases}
    runnable = [case for case in cases if case['algorithm'] in (FACTIONS_ALGORITHM, SOURCES_ALGORITHM)
                and diagnostic_supported(case)]
    metadata, observed = {'name': 'glsmac-natural-first-city-profiles', 'kind': 'candidate'}, []
    if runnable:
        metadata, observed = runner.headless(runnable, runtime, node, source_prelude=SOURCE_PRELUDE)
        metadata.update(name='glsmac-natural-first-city-profiles')
        metadata['mocked'][1] = 'synthetic component/resource/terraforming inputs and normalized stock base-faction bonus input tokens'
        metadata['unmodeled'] = [
            'faction bonuses beyond concrete TECH and initial SOCIAL GROWTH/INDUSTRY, including numeric free-tech choices, faction facilities, energy and population modifiers',
            'nonzero raw predefined unit Cost and its conversion',
            'original setup-size map_kind equivalence to native map type or size provenance',
        ]
    indexed = {row['id']: row for row in observed}
    # These native facts are retained as diagnostics, never returned as partial
    # strict outputs and never compared with a manufactured map_kind value.
    metadata['source_startup_diagnostics'] = [indexed[case['id']] for case in runnable
                                               if case['algorithm'] == SOURCES_ALGORITHM]
    metadata['diagnostics_are_complete_comparisons'] = False
    return metadata, [indexed[case['id']] if reasons[case['id']] is None else
                      {'id': case['id'], 'status': 'unsupported', 'reason': reasons[case['id']]}
                      for case in cases]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', runner.ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--node', default=os.environ.get('NODE', 'node'))
    args = parser.parse_args()
    metadata, rows = replay(load_request()['cases'], args.runtime.resolve(), args.node)
    write_response(metadata, rows)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native archived first-city replay failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
