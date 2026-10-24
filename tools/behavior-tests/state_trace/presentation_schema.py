"""Standalone pre-world presentation trace validation/comparison.

The frozen game.state_trace.v1 validator is unchanged. This profile never
fabricates a world for menus, intro videos or other pre-world checkpoints.
"""
from copy import deepcopy

from compare import differences
from protocol import ProtocolError, canonical
from state_trace.schema import validate_input as validate_action_plan, expected_plan, _id
from state_trace.presentation import CLOCK, DOMAINS, SemanticRecorder

ALGORITHM = 'presentation.trace.v1'
FIELDS = {'schema', 'clock', 'objects', 'media', 'focus', 'modal_stack', 'events'}


def validate_input(value):
    actions = validate_action_plan(value)
    fixture = value['fixture']
    requested = fixture.get('requested_coverage')
    if type(requested) is not list or not requested or any(type(name) is not str or name not in DOMAINS for name in requested) or len(requested) != len(set(requested)):
        raise ProtocolError('presentation fixture requires unique declared requested_coverage channels')
    return actions


def validate_output(output, case_input, reference=False):
    actions = validate_input(case_input)
    if type(output) is not dict or set(output) - {'checkpoints', 'diagnostics'} or 'checkpoints' not in output:
        raise ProtocolError('presentation output requires checkpoints, optional diagnostics')
    if 'diagnostics' in output and type(output['diagnostics']) is not dict:
        raise ProtocolError('presentation diagnostics must be an object')
    points = output['checkpoints']
    if type(points) is not list or not 1 <= len(points) <= 1024:
        raise ProtocolError('presentation checkpoint count outside 1..1024')
    action_order = {'initial': -1, **{action['id']: index for index, action in enumerate(actions)}}
    requested = {'presentation.' + name for name in case_input['fixture']['requested_coverage']}
    seen = set()
    reducer = SemanticRecorder()
    previous_checkpoint = previous_event = -1
    for point in points:
        if type(point) is not dict or set(point) != {'id', 'after_action', 'state', 'coverage'}:
            raise ProtocolError('presentation checkpoint requires id/after_action/state/coverage')
        point_id = _id(point['id'], 'presentation checkpoint')
        if point_id in seen: raise ProtocolError('duplicate presentation checkpoint')
        seen.add(point_id)
        if type(point['after_action']) is not str or point['after_action'] not in action_order:
            raise ProtocolError('presentation checkpoint follows unknown action')
        checkpoint_position = action_order[point['after_action']]
        if checkpoint_position < previous_checkpoint:
            raise ProtocolError('presentation checkpoint breaks action order')
        coverage = point['coverage']
        if type(coverage) is not dict or not requested <= set(coverage) or any(type(key) is not str or type(value) is not bool for key, value in coverage.items()):
            raise ProtocolError('presentation checkpoint must declare every requested coverage channel')
        if type(point['state']) is not dict or set(point['state']) != {'presentation'}:
            raise ProtocolError('standalone checkpoint requires only state.presentation')
        state = point['state']['presentation']
        if type(state) is not dict or set(state) != FIELDS or state['schema'] != ALGORITHM or state['clock'] != CLOCK:
            raise ProtocolError('invalid semantic presentation state/clock')
        if type(state['events']) is not list:
            raise ProtocolError('presentation events must be an array')
        for event in state['events']:
            if type(event) is not dict or type(event.get('after_input')) is not str or event['after_input'] not in action_order:
                raise ProtocolError('presentation event follows unknown input')
            event_position = action_order[event['after_input']]
            if not previous_checkpoint <= event_position <= checkpoint_position:
                raise ProtocolError('presentation event lies outside its checkpoint action interval')
            if event_position < previous_event:
                raise ProtocolError('presentation events break action order')
            reducer.record(event)
            previous_event = event_position
            if event['domain'] == 'unknown' and not any(value is False for value in coverage.values()):
                raise ProtocolError('unknown semantic event requires incomplete coverage')
        # A silently dropped event cannot be replaced by an unexplained snapshot.
        reconstructed = reducer.checkpoint()
        if canonical(reconstructed) != canonical(state):
            raise ProtocolError('presentation inventory/focus/modal state disagrees with its event history')
        if reference and any(value is False for value in coverage.values()):
            raise ProtocolError('reference presentation coverage incomplete')
        previous_checkpoint = checkpoint_position
    if reference:
        plan = expected_plan(case_input)
        if len(points) != len(plan) or any((wanted_id is not None and point['id'] != wanted_id) or point['after_action'] != after for point, (wanted_id, after) in zip(points, plan)):
            raise ProtocolError('reference presentation checkpoint plan differs')
    return points


def compare_outputs(expected, actual, case_input):
    wanted = validate_output(expected, case_input, reference=True)
    got = validate_output(actual, case_input)
    found = []
    incomplete = []
    first = None
    for left, right in zip(wanted, got):
        if (left['id'], left['after_action']) != (right['id'], right['after_action']):
            mismatch = [{'path':'$.checkpoints', 'expected':left['id'], 'actual':right['id']}]
        else:
            mismatch = differences(left['state'], right['state'], path='$.state', limit=20)
        if mismatch and first is None: first = left['id']
        found.extend(dict(item, checkpoint=left['id']) for item in mismatch)
        incomplete.extend(key for key, observed in right['coverage'].items() if not observed)
    if len(wanted) != len(got):
        first = first or (wanted[min(len(wanted), len(got))]['id'] if len(wanted) > len(got) else got[len(wanted)]['id'])
        found.append({'path':'$.checkpoints.length', 'expected':len(wanted), 'actual':len(got), 'checkpoint':first})
    if found:
        return {'status':'mismatched', 'first_divergent_checkpoint':first, 'differences':found[:50]}
    if incomplete:
        return {'status':'unsupported', 'reason':'unobserved presentation channels: ' + ', '.join(sorted(set(incomplete)))}
    return {'status':'matched'}
