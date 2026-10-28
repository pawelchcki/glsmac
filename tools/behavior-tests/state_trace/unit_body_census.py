"""Strict cached-body wire validation only; never executes or authenticates a game.

Float text may use native max_digits10. Its exact binary32 bits are authoritative.
A caller still owes immediate all-owner native worlds, exit, logs and raw seal.
"""
import collections
import math
import re
import struct
from protocol import ProtocolError, decode_json

SCHEMA = 'application.unit-body-census.v1'
MAX_BYTES = 4 * 1024 * 1024
MAX_UNITS = 1024
CAPABILITIES = {
    **dict.fromkeys(('frontend_inventory', 'owner_slot_lookup', 'cached_sprite_lookup',
                     'native_instance_map', 'float32_bits', 'renderer_angle'), True),
    **dict.fromkeys(('gpu_frame', 'camera', 'screen_bounds', 'world_copies', 'occlusion',
                     'gameplay_facing', 'animation_frame', 'action_clip', 'limb_pose',
                     'movement_timing', 'backend_completion', 'audio',
                     'cross_session_lifetime', 'dispatch_quiescence'), False),
}


class CensusUnavailable(ProtocolError):
    """Unsupported/incomplete observation, distinct from a complete invariant match."""


def require(condition, message):
    if not condition:
        raise ProtocolError(message)


def fields(value, required, optional=()):
    require(type(value) is dict, 'expected object')
    require(set(required) <= value.keys() and value.keys() <= set(required) | set(optional),
            'missing or unknown fields')


def integer(value, maximum=2**64-1):
    require(type(value) is int and 0 <= value <= maximum, 'invalid unsigned integer')
    return value


def identity(value):
    require(type(value) is str and re.fullmatch(r'0|[1-9][0-9]{0,19}', value) is not None,
            'invalid canonical uint64 string')
    require(int(value) <= 2**64-1, 'uint64 overflow')
    return value


def text(value, nonempty=False):
    require(type(value) is str and (not nonempty or bool(value)), 'invalid string')
    return value


def boolean(value):
    require(type(value) is bool, 'invalid Boolean')
    return value


def f32_bits(value):
    try:
        return struct.unpack('>I', struct.pack('>f', value))[0]
    except (OverflowError, struct.error) as error:
        raise ProtocolError('Float32 overflow') from error


def float32(value):
    fields(value, {'value', 'bits'})
    require(type(value['value']) is float and math.isfinite(value['value']),
            'expected finite Float text')
    bits = integer(value['bits'], 2**32-1)
    require(f32_bits(value['value']) == bits, 'Float32 value/bit disagreement')
    # Recover the exact stored value, rather than doing arithmetic on rounded wire text.
    return struct.unpack('>f', struct.pack('>I', bits))[0]


def vector(value, axes='xyz'):
    fields(value, set(axes))
    return {axis: float32(value[axis]) for axis in axes}


def _resource(value):
    fields(value, {'key', 'name', 'atlas', 'destination_offsets', 'texture_filename_supported'},
           {'texture_filename'})
    key = text(value['key'], True)
    text(value['name'])
    fields(value['atlas'], {'x', 'y', 'width', 'height'})
    for coordinate in value['atlas'].values():
        integer(coordinate, 2**32-1)
    offsets = vector(value['destination_offsets'], 'xy')
    supported = boolean(value['texture_filename_supported'])
    require(('texture_filename' in value) == supported, 'filename support/presence disagreement')
    if supported:
        text(value['texture_filename'], True)
    return key, offsets


def validate(text_payload, world_units=None):
    """Validate a complete wire snapshot; optionally compare exact unit identity sets.

    world_units is a caller-supplied list of {unit_id,owner_id,definition_id}, with
    canonical decimal IDs. This function provides no native provenance or game credit.
    """
    require(type(text_payload) is str, 'expected Native String payload')
    try:
        require(len(text_payload.encode('utf-8')) <= MAX_BYTES, 'census exceeds 4 MiB')
    except UnicodeError as error:
        raise ProtocolError('invalid UTF-8 text') from error
    result = decode_json(text_payload)
    require(type(result) is dict and result.get('schema') == SCHEMA, 'wrong census schema')
    require(type(result.get('complete')) is bool, 'missing Boolean completeness')
    if result['complete'] is False:
        # A partial inventory can be retained for diagnosis, but can never pass this gate.
        raise CensusUnavailable('incomplete census: ' + str(result.get('reason', result.get('reasons'))))
    fields(result, {'schema', 'complete', 'id_encoding', 'float_encoding', 'requested_game_matches',
                    'scope', 'known_frontend_units', 'reasons', 'owner_counts',
                    'cache_counts_before', 'cache_counts_after', 'instance_counts', 'supported', 'units'})
    require(result['id_encoding'] == 'uint64-decimal' and
            result['float_encoding'] == 'float32-value-bits', 'unsupported encoding')
    require(result['requested_game_matches'] is True and result['scope'] == 'current-frontend-only',
            'unbound current frontend')
    require(result['reasons'] == [] and type(result['reasons']) is list, 'complete snapshot has reasons')
    fields(result['supported'], set(CAPABILITIES))
    require(all(type(result['supported'][key]) is bool and result['supported'][key] == supported
                for key, supported in CAPABILITIES.items()), 'unsupported capability assertion')
    count = integer(result['known_frontend_units'], MAX_UNITS)
    rows = result['units']
    require(type(rows) is list and len(rows) == count, 'inventory count mismatch')
    cache_before = integer(result['cache_counts_before'], 65536)
    require(integer(result['cache_counts_after'], 65536) == cache_before, 'sprite cache changed')
    owners = collections.Counter()
    projection, resources, claims = {}, {}, collections.Counter()
    ordering = []
    present = set()
    for row in rows:
        fields(row, {'manager_unit_id', 'unit_available', 'unit_id', 'owner_supported', 'owner_id',
                     'definition_id', 'unit_render_coords', 'unit_shown', 'resource_available',
                     'actor_visible', 'resource', 'instance_state'},
               {'instance_id', 'instance_position', 'instance_angle'})
        uid = identity(row['unit_id'])
        require(identity(row['manager_unit_id']) == uid and uid not in projection,
                'duplicate/mismatched unit identity')
        require(row['unit_available'] is True and row['owner_supported'] is True and
                row['resource_available'] is True, 'complete snapshot has unavailable unit fields')
        owner = identity(row['owner_id'])
        definition = text(row['definition_id'], True)
        projection[uid] = (owner, definition)
        ordering.append(int(uid)); owners[owner] += 1
        logical = vector(row['unit_render_coords'])
        boolean(row['unit_shown']); boolean(row['actor_visible'])
        key, offsets = _resource(row['resource'])
        if key in resources:
            require(row['resource'] == resources[key], 'ambiguous resource descriptor')
        resources[key] = row['resource']
        state = row['instance_state']
        require(type(state) is str and state in ('unallocated', 'absent', 'present'), 'invalid instance state')
        require(('instance_id' in row) == (state != 'unallocated'), 'instance allocation disagreement')
        for field in ('instance_position', 'instance_angle'):
            require((field in row) == (state == 'present'), 'invented/missing instance field')
        if state != 'unallocated':
            iid = identity(row['instance_id'])
            require(iid != '0', 'allocated instance has zero ID')
        if state == 'present':
            require((key, iid) not in present, 'duplicate present resource/instance claim')
            present.add((key, iid)); claims[key] += 1
            position = vector(row['instance_position'])
            vector(row['instance_angle'])  # Native renderer data; not an inferred gameplay facing.
            for axis in 'xyz':
                expected = logical[axis] + offsets[axis] if axis in 'xy' else logical[axis]
                require(f32_bits(expected) == row['instance_position'][axis]['bits'],
                        'stored position disagrees with native normalization')
    require(ordering == sorted(ordering), 'unsorted native inventory')
    require(len(resources) <= cache_before, 'resource inventory exceeds cached entries')
    require(type(result['owner_counts']) is list, 'invalid owner counts')
    counted_owners = {}
    for entry in result['owner_counts']:
        fields(entry, {'owner_id', 'units'})
        owner = identity(entry['owner_id'])
        require(owner not in counted_owners, 'duplicate owner count')
        counted_owners[owner] = integer(entry['units'], MAX_UNITS)
    require(dict(owners) == counted_owners, 'owner coverage/count mismatch')
    require(type(result['instance_counts']) is list, 'invalid instance counts')
    counted_resources = set()
    for entry in result['instance_counts']:
        fields(entry, {'resource_key', 'before', 'after'})
        key = text(entry['resource_key'], True)
        require(key not in counted_resources and key in resources, 'wrong/duplicate resource count')
        counted_resources.add(key)
        before = int(identity(entry['before']))
        require(identity(entry['after']) == entry['before'], 'native instance map changed')
        require(before >= claims[key], 'present claims exceed actual instance count')
    require(counted_resources == resources.keys(), 'missing resource counts')
    if world_units is not None:
        require(type(world_units) is list, 'invalid native world identity projection')
        expected = {}
        for row in world_units:
            fields(row, {'unit_id', 'owner_id', 'definition_id'})
            uid = identity(row['unit_id'])
            require(uid not in expected, 'duplicate world unit')
            expected[uid] = identity(row['owner_id']), text(row['definition_id'], True)
        require(expected == projection, 'native world identity/owner/definition mismatch')
    return result
