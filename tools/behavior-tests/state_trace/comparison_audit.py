"""Exhaustive comparison accounting, separate from bounded v1 failure details.

Counts describe the supplied observations, never unobserved engine behavior.
Every aligned checkpoint and entity is visited even after diagnostic caps fill.
"""
from itertools import zip_longest
import json

from compare import iter_differences
from state_trace.schema import validate_output, validate_reference_plan

SCHEMA = 'game.state_trace.comparison_audit.v1'
ENTITY_DOMAINS = ('units', 'bases', 'players')


def state_groups(expected, actual):
    """Yield shared comparison units with exact v1 domain/identity ordering."""
    for domain in ('turn', 'map'):
        yield domain, None, (), 'shared', iter_differences(
            expected[domain], actual[domain], path=f'$.state.{domain}')
    for domain in ENTITY_DOMAINS:
        wanted = {row['id']: row for row in expected[domain]}
        got = {row['id']: row for row in actual[domain]}
        for identity in sorted(set(wanted) | set(got)):
            left, right = wanted.get(identity), got.get(identity)
            owners = ((identity,) if domain == 'players' else tuple(sorted({
                row['owner'] for row in (left, right) if row is not None})))
            location = f'$.state.{domain}[id={identity}]'
            if left is None:
                status, changes = 'extra', iter([{
                    'path': location, 'expected_missing': True, 'actual': right}])
            elif right is None:
                status, changes = 'missing', iter([{
                    'path': location, 'expected': left, 'actual_missing': True}])
            else:
                status, changes = 'shared', iter_differences(left, right, path=location)
            yield domain, identity, owners, status, changes
    roster = {row['id'] for row in expected['players'] + actual['players']}

    def domain_owners(value):
        return tuple(sorted(value)) if isinstance(value, dict) and value and set(value) <= roster else ()

    for domain in sorted((set(expected) | set(actual)) - {'turn', 'map', *ENTITY_DOMAINS}):
        location = f'$.state.{domain}'
        if domain not in expected:
            yield domain, None, domain_owners(actual[domain]), 'extra', iter([{
                'path': location, 'expected_missing': True, 'actual': actual[domain]}])
        elif domain not in actual:
            yield domain, None, domain_owners(expected[domain]), 'missing', iter([{
                'path': location, 'expected': expected[domain], 'actual_missing': True}])
        else:
            # Extensible domains retain their ordinary structural semantics.
            # Only an explicitly player-keyed domain can be attributed to owners.
            left, right = expected[domain], actual[domain]
            if isinstance(left, dict) and isinstance(right, dict) and set(left) | set(right) and (set(left) | set(right)) <= roster:
                for identity in sorted(set(left) | set(right)):
                    path = location + '[' + json.dumps(identity) + ']'
                    if identity not in left:
                        status, changes = 'extra', iter([{'path': path, 'expected_missing': True, 'actual': right[identity]}])
                    elif identity not in right:
                        status, changes = 'missing', iter([{'path': path, 'expected': left[identity], 'actual_missing': True}])
                    else:
                        status, changes = 'shared', iter_differences(left[identity], right[identity], path=path)
                    yield domain, identity, (identity,), status, changes
            else:
                yield domain, None, (), 'shared', iter_differences(left, right, path=location)


def _counter():
    return dict(shared_entities=0, missing_entities=0, extra_entities=0,
                changed_entities=0, difference_count=0)


def audit_outputs(expected, actual, case_input, detail_limit=0):
    """Audit all supplied state; retain at most detail_limit individual differences.

    Checkpoints with unlike plan identities are explicitly unpaired; their states
    are never compared as though they followed the same action. Entity counts for
    scalar/opaque domains count one comparison group. Ownership changes attribute
    the same difference to both affected owners; player totals are not additive.
    """
    if type(detail_limit) is not int or detail_limit < 0:
        raise ValueError('detail_limit must be a nonnegative integer')
    wanted = validate_reference_plan(expected, case_input)
    got = validate_output(actual, case_input)
    audit = dict(schema=SCHEMA, comparison_performed=True, state_comparison_complete=True,
                 coverage_gaps=[], difference_count=0, checkpoint_plan_differences=0,
                 checkpoints=[], details=[], detail_limit=detail_limit)
    for left, right in zip_longest(wanted, got):
        point = dict(reference_checkpoint=left['id'] if left else None,
                     candidate_checkpoint=right['id'] if right else None,
                     compared=False, domains={}, players={}, difference_count=0)
        audit['checkpoints'].append(point)
        for side, entry in (('reference', left), ('candidate', right)):
            if entry:
                audit['coverage_gaps'].extend(dict(side=side, checkpoint=entry['id'], domain=domain)
                    for domain, observed in sorted(entry['coverage'].items()) if not observed)
        if left is None or right is None or (left['id'], left['after_action']) != (right['id'], right['after_action']):
            audit['state_comparison_complete'] = False
            audit['checkpoint_plan_differences'] += 1
            point['reason'] = 'Checkpoint absent or id/after_action differs; state not paired.'
            continue
        point['domains'] = {domain: _counter() for domain in ('turn', 'map', *ENTITY_DOMAINS)}
        point['compared'] = True
        point['after_action'] = left['after_action']
        roster = sorted({row['id'] for entry in (left, right) for row in entry['state']['players']})
        point['players'] = {identity: dict(difference_count=0,
            domains={domain: _counter() for domain in ENTITY_DOMAINS}) for identity in roster}
        for domain, identity, owners, status, changes in state_groups(left['state'], right['state']):
            counter = point['domains'].setdefault(domain, _counter())
            counters = [counter]
            for owner in owners:
                player = point['players'][owner]
                counters.append(player['domains'].setdefault(domain, _counter()))
            for counts in counters:
                counts[status + '_entities'] += 1
            changed = False
            for difference in changes:
                changed = True
                audit['difference_count'] += 1
                point['difference_count'] += 1
                for counts in counters:
                    counts['difference_count'] += 1
                for owner in owners:
                    point['players'][owner]['difference_count'] += 1
                if len(audit['details']) < detail_limit:
                    audit['details'].append(dict(difference, checkpoint=left['id'],
                        domain=domain, entity_id=identity, players=list(owners)))
            if changed:
                for counts in counters:
                    counts['changed_entities'] += 1
    audit['observed_fields_exhausted'] = audit['state_comparison_complete']
    audit['declared_coverage_complete'] = not audit['coverage_gaps']
    audit['state_comparison_complete'] = audit['state_comparison_complete'] and audit['declared_coverage_complete']
    audit['details_omitted'] = audit['difference_count'] - len(audit['details'])
    return audit
