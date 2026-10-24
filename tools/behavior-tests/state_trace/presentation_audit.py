#!/usr/bin/env python3
"""Audit candidate transport and projection accounting, without inferring fidelity.

An internally consistent incomplete observation is a successful diagnostic audit.
Use --require-complete to reject it as a coverage gate. Version 1 has no producer
attestation protocol for exhaustive coverage; declarations, quiet intervals and
an empty event list cannot supply that evidence.
"""
import argparse
from collections import Counter
from copy import deepcopy
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, canonical, fingerprint
from state_trace.presentation import CLOCK, DOMAINS, RawRecorder, SemanticRecorder
from state_trace.presentation_schema import validate_input

SCHEMA = 'glsmac.presentation.audit.v1'
GAPS = {
    'windows': 'No exhaustive logical window classification and cross-engine identity producer.',
    'widgets': 'No exhaustive logical widget classification, field mapping and cross-engine identity producer.',
    'focus': 'Native focus ownership does not attest complete logical focus semantics.',
    'modal': 'Native modal singleton does not observe a complete ordered logical modal stack.',
    'animation.requests': 'Scene-instance requests do not attest an exhaustive animation inventory or pre-existing baseline.',
    'animation.frames': 'Requested sprite/frame state does not observe rendered animation frames.',
    'video.requests': 'No exhaustive video playback inventory and request producer.',
    'video.frames': 'No decoded/presented video-frame producer.',
    'sfx.requests': 'Audio actor requests lack exhaustive SFX classification and already-playing baseline.',
    'sfx.controls': 'Audio actor controls lack exhaustive SFX classification and lifecycle/completion observation.',
    'music.requests': 'Audio actor requests lack exhaustive music classification and already-playing baseline.',
    'music.controls': 'Audio actor controls lack exhaustive music classification and lifecycle/completion observation.',
    'audio.mixer': 'No rendered PCM/mixer-buffer observation producer.',
    'audio.output': 'No audio device-output observation producer.',
    'timing.controlled': 'Event ordinals and drain/quiet schedules do not establish controlled playback timing.',
}


def _require(condition, message):
    if not condition:
        raise ProtocolError('presentation audit: ' + message)


def _hash(value):
    return fingerprint(value)


def _same(left, right):
    # Python equality conflates True with 1 and 1.0; evidence retains JSON types.
    return canonical(left) == canonical(right)


def _load(path):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            _require(key not in result, 'duplicate JSON field: ' + key)
            result[key] = value
        return result
    value = json.loads(path.read_text(), object_pairs_hook=unique)
    canonical(value)  # Reject non-finite values even inside unknown diagnostics.
    return value


def _counts(values):
    return dict(sorted(Counter(values).items()))


def _validate_dispositions(events, diagnostics):
    births, retirements = {}, {}
    for event in events:
        if event['kind'] in ('node.create', 'media.create'):
            births[event['target']] = event
        elif event['kind'] in ('node.destroy', 'media.destroy'):
            retirements[event['target']] = event['seq']
    dispositions = diagnostics.get('dispositions')
    _require(type(dispositions) is dict and set(dispositions) == set(births),
             'dispositions must account for every native birth, including retired transients')
    for identity, birth in births.items():
        record = dispositions[identity]
        _require(type(record) is dict and type(record.get('disposition')) is str
                 and bool(record['disposition']), 'invalid birth disposition for ' + identity)
        _require(type(record.get('birth_sequence')) is int and record['birth_sequence'] == birth['seq'],
                 'birth sequence differs for ' + identity)
        _require(record.get('retirement_sequence') == retirements.get(identity)
                 and (record.get('retirement_sequence') is None or type(record['retirement_sequence']) is int),
                 'retirement sequence differs for ' + identity)
        if birth['kind'] == 'media.create':
            _require(record.get('type') == 'media', 'media birth type missing for ' + identity)
        else:
            _require(record.get('native_parent') == birth['data']['parent']
                     and record.get('tag') == birth['data']['tag'], 'native birth fields differ for ' + identity)
    counts = _counts(record['disposition'] for record in dispositions.values())
    _require(_same(diagnostics.get('counts'), counts), 'diagnostic disposition counts disagree with births')
    unknown = {key: value for key, value in dispositions.items() if value['disposition'].startswith('unknown')}
    _require(_same(diagnostics.get('unknown_inventory'), unknown),
             'unknown inventory omits or changes an unknown birth, including retired transients')
    _require(diagnostics.get('all_births_disposed') is True, 'all_births_disposed assertion missing')
    return dispositions


def _native_attribution(capture, events, points):
    """Bind every raw source ordinal to the independently validated input plan."""
    plan = capture.get('input_plan')
    _require(type(plan) is dict, 'missing bound input_plan')
    actions = validate_input(plan)
    wanted_points = plan.get('checkpoints')
    _require(type(wanted_points) is list, 'input_plan requires named checkpoint declarations')
    _require(len(points) <= len(wanted_points), 'capture has undeclared checkpoints')
    after_inputs, fences = [], {}
    action, checkpoint, nonce, protocol = 0, 0, 0, 0
    opened = False
    for event in events:
        kind, data = event['kind'], event['data']
        if kind == 'trace.protocol':
            protocol += 1
            _require(protocol == 1 and _same(data, {'version': 1, 'physical_os_complete': False}),
                     'missing/duplicate/invalid native input protocol')
        if kind in ('trace.action', 'trace.checkpoint'):
            _require(protocol == 1 and set(data) == {'op', 'action', 'checkpoint', 'nonce'}
                     and all(type(value) is int for value in data.values()), 'invalid native action/checkpoint fence')
            _require(data['nonce'] == nonce, 'native action/checkpoint nonce order differs')
            nonce += 1
            if kind == 'trace.action':
                _require(data['checkpoint'] == 0, 'native action carries a checkpoint index')
                if data['op'] == 1:
                    _require(not opened and data['action'] == action + 1 and data['action'] <= len(actions),
                             'native action begin is unknown, skipped or out of order')
                    action, opened = data['action'], True
                else:
                    _require(data['op'] == 2 and opened and data['action'] == action,
                             'native action end differs from its open action')
                    opened = False
            else:
                checkpoint += 1
                _require(data['op'] == 3 and not opened and data['action'] == action
                         and action > 0 and data['checkpoint'] == checkpoint,
                         'native checkpoint action/index/order differs')
                _require(checkpoint <= len(points), 'native checkpoint omitted from capture plan')
                wanted, observed = wanted_points[checkpoint - 1], points[checkpoint - 1]
                _require(observed['checkpoint'] == checkpoint and observed['id'] == wanted['id']
                         and observed.get('after_action') == wanted['after_action'] == actions[action - 1]['id'],
                         'native checkpoint name/action differs from bound input_plan')
                fences[checkpoint] = event['seq']
        after_inputs.append(actions[action - 1]['id'] if action else 'initial')
    _require(protocol == 1, 'native input protocol absent')
    _require(checkpoint == len(points), 'declared capture checkpoint lacks a native fence')
    _require(type(capture.get('capture', {})) is dict, 'invalid capture metadata')
    if capture.get('capture', {}).get('terminal_drain_observed') is True:
        _require(not opened and action == len(actions) and checkpoint == len(wanted_points),
                 'sealed capture omits declared actions/checkpoints or leaves an action open')
    return after_inputs, fences


def _animation_sources(events):
    """Bounded typed scene-animation contract, independently bound to raw events."""
    identities, transitions = set(), {}
    for event in events:
        kind, target, data = event['kind'], event['target'], event['data']
        identity = 'candidate-birth:' + target
        if kind == 'media.create' and data['type'] == 'animation':
            identities.add(identity)
            operation = 'create'
            fields = {'role': 'scene-animation', 'source': data['source'],
                      'duration_ms': data['duration_ms'], 'frame_count': data['frame_count'],
                      'coordinates': {key: data[key] for key in ('x', 'y', 'z')},
                      'history': data['history'], 'evidence': data['evidence'],
                      'lifecycle': 'registered', 'frame_index': None, 'scene_instance_id': None,
                      'evidence_scope': 'native scene instance submission; rendered pixels unobserved'}
        elif identity in identities and kind.startswith('media.'):
            operation = 'destroy' if kind == 'media.destroy' else 'update'
            fields = {} if operation == 'destroy' else deepcopy(data)
            if kind == 'media.frame':
                fields['lifecycle'] = 'frame-submitted' if data['present'] else 'frame-removed'
                if not data['present']:
                    fields.update(frame_index=None, scene_instance_id=None)
            elif operation == 'update':
                fields['lifecycle'] = {'media.start': 'started', 'media.end': 'completed', 'media.stop': 'cancelled'}[kind]
        else:
            continue
        transitions[event['seq']] = {'domain': 'animation', 'kind': operation,
                                      'object_id': identity, 'fields': fields}
    return identities, transitions


def audit_capture(capture, projection):
    """Return a deterministic accounting report, or raise ProtocolError on loss/omission.

    Transport completeness is scoped to the observer epoch and a terminal seal.
    A prefix is valid diagnostic evidence but cannot be transport-complete.
    Every checkpoint and the final tail are reconstructed independently.
    """
    _require(type(capture) is dict and capture.get('schema') == 'glsmac.presentation.raw.v1',
             'not a candidate raw capture')
    _require(capture.get('clock', CLOCK) == CLOCK, 'unexpected raw clock')
    batches = capture.get('batches')
    _require(type(batches) is list and bool(batches), 'missing native drain batches')
    raw = RawRecorder(max_events=1000000)
    for batch in batches:
        raw.ingest(batch)
    raw_final = raw.checkpoint()
    events = raw_final['events']
    _require(type(projection) is dict and type(projection.get('diagnostics')) is dict,
             'missing projection diagnostics')
    diagnostics = projection['diagnostics']
    _require(diagnostics.get('schema') == 'glsmac.presentation.projection.v1', 'unknown projection diagnostic schema')
    _require(type(diagnostics.get('source_final_sequence')) is int
             and diagnostics['source_final_sequence'] == len(events), 'projection final source watermark differs')
    _require(type(diagnostics.get('observed_events')) is int and diagnostics['observed_events'] == len(events),
             'projection observed-event count differs')
    dispositions = _validate_dispositions(events, diagnostics)
    points, checkpoints = capture.get('input_checkpoints'), projection.get('checkpoints')
    _require(type(points) is list and bool(points) and type(checkpoints) is list
             and len(points) == len(checkpoints), 'checkpoint plan omitted or changed')
    _require(all(type(point) is dict and type(point.get('checkpoint')) is int
                 and type(point.get('id')) is str and bool(point['id']) for point in points),
             'invalid checkpoint plan entry')
    after_inputs, native_fences = _native_attribution(capture, events, points)
    animation_ids, animation_sources = _animation_sources(events)
    animation_counts = Counter()
    raw_replay, semantic = RawRecorder(max_events=1000000), SemanticRecorder()
    cursor, previous_boundary, reports, observations = 0, 0, [], []
    semantic_births, semantic_retirements = {}, {}
    declared = {}
    unavailable = []

    def unavailable_fields(fields, identity, label, **source):
        availability = fields.get('field_availability', {})
        _require(type(availability) is dict, 'field availability must be an object')
        for field, evidence in availability.items():
            if any(word in str(evidence).lower() for word in ('unavailable', 'unclassified', 'unimplemented')):
                unavailable.append({'checkpoint': label, 'identity': identity,
                                    'field': field, 'reason': evidence, **source})

    def interval(state, boundary, label):
        nonlocal cursor
        _require(type(state) is dict and type(state.get('events')) is list,
                 'missing semantic state/events at ' + label)
        seen = []
        for event in state['events']:
            _require(cursor < boundary, 'semantic event has no raw source event at ' + label)
            _require(type(event) is dict and event.get('after_input') == after_inputs[cursor],
                     'semantic after_input differs from native source action at sequence ' + str(cursor + 1))
            semantic.record(event)
            if event['domain'] in ('windows', 'widgets', 'animation', 'video', 'sfx', 'music'):
                identity = event['object_id']
                if event['domain'] == 'animation' or identity in animation_ids:
                    transition = {key: event[key] for key in ('domain', 'kind', 'object_id', 'fields')}
                    _require(_same(transition, animation_sources.get(cursor + 1)),
                             'animation canonical transition differs from raw source at sequence ' + str(cursor + 1))
                    animation_counts[cursor + 1] += 1
                if event['kind'] in ('create', 'update'):
                    unavailable_fields(event['fields'], identity, label,
                                       semantic_event_sequence=event['seq'], raw_sequence=cursor + 1)
                _require(identity.startswith('candidate-birth:') and identity[16:] in dispositions,
                         'semantic identity has no native birth: ' + identity)
                native = dispositions[identity[16:]]
                _require((native.get('type') == 'media') == (event['domain'] not in ('windows', 'widgets')),
                         'semantic/native inventory category differs: ' + identity)
                _require(native['birth_sequence'] <= cursor + 1
                         and (native['retirement_sequence'] is None or cursor + 1 <= native['retirement_sequence']),
                         'semantic operation lies outside native lifetime: ' + identity)
                if event['kind'] == 'create':
                    semantic_births[identity] = event['seq']
                elif event['kind'] == 'destroy':
                    _require(native['retirement_sequence'] == cursor + 1,
                             'semantic retirement differs from native source event: ' + identity)
                    semantic_retirements[identity] = event['seq']
            if event['kind'] == 'observed':
                fields = event['fields']
                _require(cursor < boundary and type(fields.get('raw_sequence')) is int
                         and fields['raw_sequence'] == cursor + 1, 'raw disposition omitted, duplicated or reordered at ' + label)
                source = events[cursor]
                _require(set(fields) == {'raw_sequence', 'kind', 'target', 'disposition', 'data'}
                         and fields['kind'] == source['kind'] and fields['target'] == source['target']
                         and _same(fields['data'], source['data']), 'observed raw payload differs at sequence ' + str(cursor + 1))
                disposition = fields['disposition']
                _require(type(disposition) is str and bool(disposition), 'missing event disposition')
                if cursor + 1 in animation_sources:
                    _require(animation_counts[cursor + 1] == 1 and disposition == 'animation',
                             'animation raw source requires exactly one canonical transition and typed disposition at sequence ' + str(cursor + 1))
                expected_domain = ('unknown' if disposition.startswith('unknown') else
                                   disposition if disposition in ('input', 'action') else 'diagnostic')
                _require(event['domain'] == expected_domain
                         and event['object_id'] == 'candidate-birth:' + source['target'],
                         'event disposition domain/identity differs at sequence ' + str(cursor + 1))
                observations.append(deepcopy(fields))
                seen.append(source)
                cursor += 1
        _require(cursor == boundary, 'raw observations omitted at ' + label)
        _require(_same(semantic.checkpoint(), state), 'semantic snapshot differs from ordered event history at ' + label)
        for source in seen:
            raw_replay.record(source)
        prefix = raw_replay.checkpoint()
        live = set(prefix['nodes']) | set(prefix['media'])
        semantic_live = set(state['objects']) | set(state['media'])
        _require(all(identity.startswith('candidate-birth:') and identity[16:] in live for identity in semantic_live),
                 'semantic live inventory contains an unborn/retired native identity at ' + label)
        prefix_births = {key: record for key, record in dispositions.items() if record['birth_sequence'] <= boundary}
        retired = {key for key, record in prefix_births.items()
                   if record['retirement_sequence'] is not None and record['retirement_sequence'] <= boundary}
        _require(set(prefix_births) - retired == live, 'native live/birth/retirement accounting differs at ' + label)
        for identity, record in prefix_births.items():
            if record['disposition'] != 'logical' or identity in retired:
                continue
            refinements = [change['sequence'] for change in record.get('classification_history', [])
                           if change.get('current') == 'logical']
            logical_at = min(refinements) if refinements else record['birth_sequence']
            _require(logical_at > boundary or 'candidate-birth:' + identity in semantic_live,
                     'live logical birth missing from semantic checkpoint at ' + label)
        return {'id': label, 'raw_watermark': boundary,
                'raw_prefix_event_count': boundary, 'raw_interval_event_count': len(seen),
                'raw_prefix_event_kinds': _counts(e['kind'] for e in events[:boundary]),
                'raw_interval_event_kinds': _counts(e['kind'] for e in seen),
                'native_birth_count': len(prefix_births), 'native_retired_count': len(retired),
                'native_live_nodes': len(prefix['nodes']), 'native_live_media': len(prefix['media']),
                'semantic_birth_count': len(semantic_births), 'semantic_retired_count': len(semantic_retirements),
                'semantic_live_objects': len(state['objects']), 'semantic_live_media': len(state['media']),
                'event_dispositions': _counts(o['disposition'] for o in observations),
                'raw_observations_exactly_once': True}

    seen_ids = set()
    for point, checkpoint in zip(points, checkpoints):
        _require(type(point) is dict and type(checkpoint) is dict
                 and point.get('id') == checkpoint.get('id') and point.get('id') not in seen_ids
                 and point.get('after_action') == checkpoint.get('after_action'), 'checkpoint identity/action differs')
        seen_ids.add(point['id'])
        boundary = native_fences[point['checkpoint']]
        _require(boundary > previous_boundary, 'nonmonotone checkpoint watermark')
        if 'watermark' in point:
            _require(type(point['watermark']) is int and point['watermark'] == boundary,
                     'declared checkpoint watermark differs')
        _require(type(checkpoint.get('state')) is dict and set(checkpoint['state']) == {'presentation'},
                 'checkpoint presentation state missing')
        coverage = checkpoint.get('coverage')
        _require(type(coverage) is dict and set(coverage) == {'presentation.' + name for name in DOMAINS}
                 and all(type(value) is bool for value in coverage.values()),
                 'checkpoint coverage requires exactly all 15 known presentation channels with boolean declarations')
        declared[point['id']] = deepcopy(coverage)
        reports.append(interval(checkpoint['state']['presentation'], boundary, point['id']))
        previous_boundary = boundary
    _require(_same(diagnostics.get('raw_tail'), events[previous_boundary:]), 'raw tail omitted or changed')
    tail = interval(diagnostics.get('tail_presentation'), len(events), 'terminal-tail')
    for identity in semantic_births:
        native = dispositions[identity[16:]]
        _require((identity in semantic_retirements) == (native['retirement_sequence'] is not None),
                 'semantic/native retirement correspondence differs for ' + identity)
    _require(all('candidate-birth:' + identity in semantic_births
                 for identity, record in dispositions.items() if record['disposition'] == 'logical'),
             'logical birth disposition has no semantic birth')

    metadata = capture.get('capture', {})
    _require(type(metadata) is dict, 'invalid capture metadata')
    if 'final_event_sequence' in metadata:
        _require(type(metadata['final_event_sequence']) is int and metadata['final_event_sequence'] == len(events),
                 'capture final watermark differs')
    prefix = capture.get('checkpoint')
    if prefix is not None:
        _require(type(prefix) is dict and set(prefix) == {'id', 'after_action', 'watermark'}
                 and prefix['id'] == points[-1]['id'] and prefix['after_action'] == points[-1]['after_action']
                 and type(prefix['watermark']) is int and prefix['watermark'] == previous_boundary == len(events),
                 'checkpoint prefix identity/watermark differs from its final native fence')
    sealed = metadata.get('terminal_drain_observed') is True
    if sealed:
        _require(metadata.get('ended_at') == 'atomic-native-seal'
                 and metadata.get('final_event_sequence') == len(events), 'terminal seal metadata incomplete')
    transport_complete = bool(events) and sealed
    unknown_events = [o for o in observations if o['disposition'].startswith('unknown')]
    unknown_objects = {key: deepcopy(record) for key, record in dispositions.items()
                       if record['disposition'].startswith('unknown')}
    unmapped_fields = [o for o in observations if o['disposition'] == 'unknown-field'
                       or o['kind'] in ('node.unset', 'semantic.forward')]
    availability_states = [(checkpoint['id'], checkpoint['state']['presentation']) for checkpoint in checkpoints]
    availability_states.append(('terminal-tail', diagnostics['tail_presentation']))
    for checkpoint_id, state in availability_states:
        for inventory in ('objects', 'media'):
            for identity, fields in state[inventory].items():
                unavailable_fields(fields, identity, checkpoint_id)
    semantic_understood = not (unknown_events or unknown_objects or unmapped_fields or unavailable)
    reasons = [] if transport_complete else ['A nonempty observer epoch and an acknowledged atomic terminal seal are required.']
    channels = {name: {'complete': False, 'missing_capability_reasons': [GAPS[name],
                 'No exhaustive producer attestation is defined by audit v1.']} for name in DOMAINS}
    return {'schema': SCHEMA, 'status': 'incomplete', 'valid': True,
            'candidate_executed': True, 'original_comparison_executed': False,
            'evidence_sha256': {'capture_canonical_json': _hash(capture), 'projection_canonical_json': _hash(projection)},
            'transport_complete': transport_complete, 'transport_gaps': reasons,
            'checkpoint_prefix': deepcopy(prefix),
            'semantic_understood': semantic_understood, 'exhaustive_coverage_complete': False,
            'rendered_output_observed': False,
            'rendered_output_gaps': ['No rendered pixels, decoded video frames, rendered PCM or device output are certified by this audit.'],
            'coverage': channels, 'declared_checkpoint_coverage': declared,
            'capture_producer_declarations': deepcopy(capture.get('coverage', {})),
            'checkpoints': reports, 'tail': tail,
            'raw_event_kinds': _counts(event['kind'] for event in events),
            'event_dispositions': _counts(o['disposition'] for o in observations),
            'native_dispositions': deepcopy(dispositions), 'unknown_objects': unknown_objects,
            'unknown_events': unknown_events, 'unmapped_fields': unmapped_fields,
            'unavailable_fields': unavailable,
            'limits': ['Completeness is scoped to the armed observer epoch; prelaunch history is unobserved.',
                       'Quiet intervals and zero channel events never prove absence or producer coverage.',
                       'Candidate birth identities do not establish cross-engine object correspondence.']}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', type=Path, required=True)
    parser.add_argument('--projection', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--require-complete', action='store_true')
    args = parser.parse_args(argv)
    try:
        report = audit_capture(_load(args.capture), _load(args.projection))
    except (OSError, ValueError, KeyError, TypeError, ProtocolError) as error:
        args.output.write_text(json.dumps({'schema': SCHEMA, 'status': 'invalid', 'valid': False,
            'error': str(error), 'original_comparison_executed': False}, indent=2) + '\n')
        return 2
    args.output.write_text(json.dumps(report, indent=2, sort_keys=True) + '\n')
    return 1 if args.require_complete and report['status'] != 'complete' else 0


if __name__ == '__main__':
    sys.exit(main())
