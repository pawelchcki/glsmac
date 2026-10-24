#!/usr/bin/env python3
"""Validate/reduce a candidate raw presentation artifact; never claims parity."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError
from state_trace.presentation import RawRecorder


def reduce_capture(capture):
    if capture.get('schema') != 'glsmac.presentation.raw.v1':
        raise ProtocolError('not a candidate raw presentation artifact')
    recorder = RawRecorder()
    for batch in capture['batches']:
        recorder.ingest(batch)
    snapshot = recorder.checkpoint()
    counts = {}
    for event in snapshot['events']:
        counts[event['kind']] = counts.get(event['kind'], 0) + 1
    return {'candidate_executed': True, 'original_comparison_executed': False,
            'coverage': capture['coverage'], 'capture': capture['capture'],
            'event_counts': counts, 'snapshot': snapshot}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    # Failed invocations replace any stale result.
    try:
        result = reduce_capture(json.loads(args.capture.read_text()))
    except (OSError, ValueError, KeyError, ProtocolError) as error:
        args.output.write_text(json.dumps({'error': str(error), 'original_comparison_executed': False}, indent=2)+'\n')
        return 2
    args.output.write_text(json.dumps(result, indent=2)+'\n')
    return 0


if __name__ == '__main__': sys.exit(main())
