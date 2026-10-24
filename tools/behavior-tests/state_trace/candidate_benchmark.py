#!/usr/bin/env python3
"""Measure exact native GSE trajectory batching against fresh prefix replays."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, canonical
from state_trace.candidate import ROOT, replay_case


def benchmark(runtime, iterations=3, size=16, node='node'):
    if not 1 <= iterations <= 10 or type(size) is not int or not 4 <= size <= 256 or size % 2:
        raise ProtocolError('Benchmark requires 1..10 iterations and even size 4..256')
    case = dict(id='benchmark-native', algorithm='game.state_trace.v1', input=dict(
        fixture=dict(kind='natural-startup', width=size, height=size, terrain='flat-arid',
                     faction='GAIANS', difficulty='Citizen', rng_state='1:2:3:4'),
        actions=[dict(id='start', kind='snapshot'), dict(id='held', kind='hold-all-ready-human-units'),
                 dict(id='next', kind='end-turn'), dict(id='settled', kind='snapshot')]))
    rows, fingerprints = [], None
    for iteration in range(iterations):
        outputs, times, launches, metadata = {}, {}, {}, []
        order = ['batched', 'prefix-replays'] if iteration % 2 == 0 else ['prefix-replays', 'batched']
        for method in order:
            start = time.perf_counter(); checkpoints, diagnostics = [], []
            if method == 'batched':
                meta, output = replay_case(copy.deepcopy(case), runtime, node=node)
                metadata.append(meta); checkpoints = output['checkpoints']; diagnostics = output['diagnostics']['checkpoints']
                launches[method] = 1
            else:
                for index, action in enumerate(case['input']['actions']):
                    prefix = copy.deepcopy(case)
                    prefix['input']['actions'] = prefix['input']['actions'][:index + 1]
                    prefix['input']['checkpoints'] = [dict(id=action['id'], after_action=action['id'])]
                    meta, output = replay_case(prefix, runtime, node=node)
                    metadata.append(meta); checkpoints.extend(output['checkpoints']); diagnostics.extend(output['diagnostics']['checkpoints'])
                launches[method] = len(case['input']['actions'])
            times[method] = round(time.perf_counter() - start, 6)
            outputs[method] = dict(checkpoints=checkpoints, native_diagnostics=diagnostics)
        if outputs['batched'] != outputs['prefix-replays']:
            raise ProtocolError('Benchmark rejected: corresponding observations differ')
        keys = ('runtime_js_sha256', 'runtime_wasm_sha256', 'production_scripts_sha256',
                'native_source_sha256', 'adapter_sha256', 'template_sha256', 'worker_sha256', 'source_sha256')
        current = {key: metadata[0][key] for key in keys}
        if any({key: meta[key] for key in keys} != current for meta in metadata) or (fingerprints is not None and fingerprints != current):
            raise ProtocolError('Benchmark rejected: source/runtime artifacts changed')
        fingerprints = current
        rows.append(dict(iteration=iteration + 1, order=order, wall_seconds=times, launches=launches,
                         observations_exactly_equal=True, observations_sha256=hashlib.sha256(canonical(outputs['batched']).encode()).hexdigest()))
    return dict(version=1,
        scope='Local asset-free candidate-only natural startup; all actual native entities. One launch with four checkpoints versus four fresh same-RNG prefix trajectory launches. No original, renderer, browser or general CI speed claim.',
        case=case, fingerprints=fingerprints, iterations=rows)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--iterations', type=int, default=3)
    parser.add_argument('--size', type=int, default=16)
    parser.add_argument('--node', default=os.environ.get('NODE', 'node'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    report = benchmark(args.runtime.resolve(), args.iterations, args.size, args.node)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(canonical(report))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError) as error:
        print('Candidate benchmark failed: ' + str(error), file=sys.stderr); sys.exit(2)
