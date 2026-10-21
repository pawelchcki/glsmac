"""Counts of actual first-city owners, excluding roster identities and AI play."""
import re
from protocol import ProtocolError

ALGORITHM = 'game.world_base_ownership.v1'
FIELDS = {'human_factions', 'human_bases', 'owners_with_bases', 'total_bases', 'other_owner_base_counts'}


def validate_input(value):
    if (not isinstance(value, dict) or set(value) != {'profile', 'world_width', 'world_height', 'initial_human_base'}
            or value['profile'] != 'gaian-citizen-standard-flat-stacked'
            or type(value['world_width']) is not int or value['world_width'] != 40
            or type(value['world_height']) is not int or value['world_height'] != 80):
        raise ProtocolError('ownership contract requires the declared Gaian/Citizen actual 40x80 grid')
    base = value['initial_human_base']
    expected = {'workers': 0, 'doctors': 1, 'worked_tiles': 0, 'nutrients': 0, 'minerals': 9}
    if not isinstance(base, dict) or base != expected or any(type(item) is not int for item in base.values()):
        raise ProtocolError('ownership contract requires the declared first-city population and stores')


def validate_output(value):
    if not isinstance(value, dict) or set(value) != FIELDS:
        raise ProtocolError('ownership output requires all actual ownership counts')
    for key in FIELDS - {'other_owner_base_counts'}:
        if type(value[key]) is not int or not 0 <= value[key] <= 10000:
            raise ProtocolError('ownership counts must be bounded nonnegative integers')
    counts = value['other_owner_base_counts']
    if (not isinstance(counts, list) or any(type(count) is not int or not 1 <= count <= 10000 for count in counts)
            or counts != sorted(counts)):
        raise ProtocolError('other ownership counts must be sorted positive integers')
    if (value['human_bases'] + sum(counts) != value['total_bases']
            or value['owners_with_bases'] < len(counts)
            or value['owners_with_bases'] - len(counts) > value['human_factions']
            or value['owners_with_bases'] > value['total_bases']
            or (value['human_bases'] == 0) != (value['owners_with_bases'] == len(counts))):
        raise ProtocolError('ownership counts disagree with actual base membership')


def parse_candidate(text, case):
    if (not re.search(r'^All tests passed\.$', text, re.MULTILINE)
            or re.search(r'TEST FAILED|Unhandled exception|Event rejected:|Event result listener failed:', text)):
        raise ProtocolError('ownership startup worker did not complete: ' + text[-2500:])
    players, bases, started, done = {}, {}, False, False
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(WORLD_[A-Z]+(?:\|.*)?)$', line)
        if not match:
            continue
        parts = match[1].split('|')
        if done:
            raise ProtocolError('late ownership marker')
        if parts == ['WORLD_CASE', case['id']] and not started:
            started = True
        elif started and parts[0] in ('WORLD_PLAYER', 'WORLD_BASE') and len(parts) == 3:
            if not re.fullmatch(r'0|[1-9][0-9]*', parts[1]):
                raise ProtocolError('invalid native ownership identity')
            identity = int(parts[1])
            target = players if parts[0] == 'WORLD_PLAYER' else bases
            if identity in target:
                raise ProtocolError('duplicate native ownership identity')
            if parts[0] == 'WORLD_PLAYER':
                if parts[2] not in ('human', 'computer'):
                    raise ProtocolError('unknown native player type')
                target[identity] = parts[2]
            else:
                if not re.fullmatch(r'0|[1-9][0-9]*', parts[2]):
                    raise ProtocolError('invalid native base owner')
                target[identity] = int(parts[2])
        elif started and parts == ['WORLD_END']:
            done = True
        else:
            raise ProtocolError('unknown, duplicate or reordered ownership marker')
    if not done or any(owner not in players for owner in bases.values()):
        raise ProtocolError('missing ownership completion or unknown actual base owner')
    owners = {}
    for owner in bases.values():
        owners[owner] = owners.get(owner, 0) + 1
    output = {'human_factions': sum(kind == 'human' for kind in players.values()),
              'human_bases': sum(count for owner, count in owners.items() if players[owner] == 'human'),
              'owners_with_bases': len(owners), 'total_bases': len(bases),
              'other_owner_base_counts': sorted(count for owner, count in owners.items() if players[owner] != 'human')}
    validate_output(output)
    return {'id': case['id'], 'status': 'ok', 'output': output}
