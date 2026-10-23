#!/usr/bin/env python3
"""Compare matching popup benchmark cohorts; no game data or expected answers."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import statistics

from PIL import Image, ImageChops


def load(paths):
    cohorts = []
    implementations = []
    for path in paths:
        report = json.loads(path.read_text())
        assert report['kind'] == 'popup-latency'
        implementations.append(report['implementation'])
        for ordinal, cohort in enumerate(report['results']):
            assert cohort['runtimeFailure'] is None
            for sample in cohort['samples']:
                assert sample['paint_ms'] is not None and sample['paint_ms'] >= 0
                assert sample['accepted_pixel_differences'] == 0
            cohorts.append((cohort['samples'], Path(report['implementation']['capture_root']) / f'session-{ordinal}'))
    return implementations, cohorts


def summary(cohorts):
    result = {}
    for name in ('faction', 'leader-name'):
        cold = [s['paint_ms'] for samples, _ in cohorts for s in samples if s['name'] == name and s['index'] == 0]
        warm = [s['paint_ms'] for samples, _ in cohorts for s in samples if s['name'] == name and s['index'] > 0]
        result[name] = {
            'cold_samples': len(cold), 'warm_samples': len(warm),
            'cold_median_ms': statistics.median(cold), 'warm_median_ms': statistics.median(warm),
            'warm_p95_ms': sorted(warm)[math.ceil(len(warm) * .95) - 1],
            'warm_cohort_medians_ms': [statistics.median(s['paint_ms'] for s in samples if s['name'] == name and s['index'] > 0) for samples, _ in cohorts],
            'handler_upper_median_ms': statistics.median(s['handler_upper_ms'] for samples, _ in cohorts for s in samples if s['name'] == name),
            'diagnostic_chrome_cpu_median_ms': statistics.median(s['cpu_ms'] for samples, _ in cohorts for s in samples if s['name'] == name),
        }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--before', type=Path, nargs='+', required=True)
    parser.add_argument('--after', type=Path, nargs='+', required=True)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    before_impl, before = load(args.before)
    after_impl, after = load(args.after)
    assert len(before) == len(after) >= 3, 'At least three paired cohorts required'
    for field in ('observer_sha256', 'scripts_sha256', 'observed_scripts_sha256', 'node', 'browser', 'fontconfig_file', 'build_profile'):
        values = [impl[field] for impl in before_impl + after_impl]
        assert values[0] is not None and all(value == values[0] for value in values), f'Mixed measurement environment: {field}'
    assert before_impl[0]['build_profile'] == 'Release', 'This benchmark comparison requires matched Release builds'
    pixels = []
    for cohort, ((old, old_dir), (new, new_dir)) in enumerate(zip(before, after)):
        assert [(s['name'], s['index']) for s in old] == [(s['name'], s['index']) for s in new]
        for ordinal, (old_sample, new_sample) in enumerate(zip(old, new)):
            name = old_sample['name']
            old_path, new_path = [directory / f'{ordinal}-{name}-final.png' for directory in (old_dir, new_dir)]
            with Image.open(old_path) as image_a, Image.open(new_path) as image_b:
                assert image_a.size == image_b.size == (1024, 768)
                a, b = image_a.convert('RGB'), image_b.convert('RGB')
                changed = sum(pixel != (0, 0, 0) for pixel in ImageChops.difference(a, b).getdata())
                pixels.append({'cohort': cohort, 'popup': name, 'ordinal': ordinal, 'changed_pixels': changed,
                               'before_rgb_sha256': hashlib.sha256(a.tobytes()).hexdigest(),
                               'after_rgb_sha256': hashlib.sha256(b.tobytes()).hexdigest()})
    old_stats, new_stats = summary(before), summary(after)
    reductions = {name: {kind: 100 * (1 - new_stats[name][kind] / old_stats[name][kind]) for kind in ('cold_median_ms', 'warm_median_ms')} for name in old_stats}
    report = {'version': 1, 'kind': 'paired-popup-latency', 'cohorts': len(before),
              'scope': 'Local keyboard setup popups; first captured exact settled-image match is an input-to-paint upper bound. No fixed timers changed. CPU deltas are aggregate diagnostics. No Original timing/full-game performance claim.',
              'before': old_stats, 'after': new_stats, 'reduction_percent': reductions,
              'terminal_frame_comparison': pixels, 'before_implementations': before_impl, 'after_implementations': after_impl}
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ('cohorts', 'before', 'after', 'reduction_percent')}, indent=2))


if __name__ == '__main__':
    main()
