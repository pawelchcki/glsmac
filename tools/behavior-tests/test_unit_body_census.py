"""Synthetic protocol boundary tests: zero engines, zero original comparisons."""
import copy
import json
import struct
import unittest
from protocol import ProtocolError
from state_trace import unit_body_census as codec


def number(value):
    value = struct.unpack('>f', struct.pack('>f', value))[0]
    return {'value': value, 'bits': codec.f32_bits(value)}


def vec(x=0.0, y=0.0, z=-0.0):
    return dict(zip('xyz', map(number, (x, y, z))))


def fixture():
    resource = {'key': 'native/scout/morale-2', 'name': 'Scout',
                'atlas': {'x': 0, 'y': 12, 'width': 32, 'height': 48},
                'destination_offsets': {'x': number(0.125), 'y': number(-0.25)},
                'texture_filename_supported': True, 'texture_filename': 'units.pcx'}
    rows = []
    for uid, owner, state in (('8', '0', 'present'), ('9', '1', 'absent'), ('10', '6', 'unallocated')):
        row = {'manager_unit_id': uid, 'unit_available': True, 'unit_id': uid,
               'owner_supported': True, 'owner_id': owner, 'definition_id': 'Scout',
               'unit_render_coords': vec(0.5, 0.75), 'unit_shown': state == 'present',
               'resource_available': True, 'actor_visible': True,
               'resource': copy.deepcopy(resource), 'instance_state': state}
        if state != 'unallocated':
            row['instance_id'] = '1' if state == 'present' else '2'
        if state == 'present':
            row['instance_position'] = vec(0.625, 0.5)
            row['instance_angle'] = vec(0.0, 0.0, 0.0)
        rows.append(row)
    return {'schema': codec.SCHEMA, 'complete': True, 'id_encoding': 'uint64-decimal',
            'float_encoding': 'float32-value-bits', 'requested_game_matches': True,
            'scope': 'current-frontend-only', 'known_frontend_units': 3, 'reasons': [],
            'owner_counts': [{'owner_id': owner, 'units': 1} for owner in ('0', '1', '6')],
            'cache_counts_before': 1, 'cache_counts_after': 1,
            'instance_counts': [{'resource_key': resource['key'], 'before': '1', 'after': '1'}],
            'supported': dict(codec.CAPABILITIES), 'units': rows}


def world(value):
    return [{key: row[key] for key in ('unit_id', 'owner_id', 'definition_id')}
            for row in value['units']]


def encode(value):
    return json.dumps(value, separators=(',', ':'), allow_nan=False)


class CensusProtocolTests(unittest.TestCase):
    def validate(self, value):
        return codec.validate(encode(value), world(value))

    def test_complete_foreign_present_absent_unallocated_rows_survive(self):
        value = fixture()
        self.assertEqual(self.validate(value), value)
        self.assertEqual(len(value['units']), 3)
        self.assertFalse(value['supported']['gpu_frame'])
        self.assertFalse(value['supported']['gameplay_facing'])

    def test_native_nine_digit_text_roundtrips_float32_without_double_equality(self):
        value = fixture()
        row = value['units'][0]
        row['unit_render_coords']['x'] = number(1.0 / 3.0)
        row['instance_position']['x'] = number(codec.float32(row['unit_render_coords']['x']) + 0.125)
        wire = encode(value).replace('0.3333333432674408', '0.333333343')
        self.assertNotEqual(json.loads(wire)['units'][0]['unit_render_coords']['x']['value'],
                            value['units'][0]['unit_render_coords']['x']['value'])
        codec.validate(wire, world(value))

    def test_signed_zero_native_z_is_preserved(self):
        value = fixture()
        self.validate(value)
        value['units'][0]['instance_position']['z'] = number(0.0)
        with self.assertRaisesRegex(ProtocolError, 'normalization'):
            self.validate(value)

    def test_wrong_bits_zero_sign_and_float_type_are_rejected(self):
        for bad in ({'value': 0.0, 'bits': 2147483648}, {'value': 0, 'bits': 0},
                    {'value': 1.0, 'bits': True}, {'value': 1.0, 'bits': 2**32},
                    {'value': 1e100, 'bits': 0}):
            with self.subTest(bad=bad):
                value = fixture(); value['units'][0]['unit_render_coords']['x'] = bad
                with self.assertRaises(ProtocolError): self.validate(value)

    def test_rounded_double_arithmetic_is_not_used_for_normalization(self):
        value = fixture(); row = value['units'][0]
        row['unit_render_coords']['x'] = number(16777216.0)
        for unit in value['units']:
            unit['resource']['destination_offsets']['x'] = number(1.0)
        row['instance_position']['x'] = number(16777216.0)  # Native binary32 tie rounds to even.
        self.validate(value)
        row['instance_position']['x'] = number(16777218.0)
        with self.assertRaisesRegex(ProtocolError, 'normalization'): self.validate(value)

    def test_incomplete_or_no_live_is_unavailable_never_success(self):
        for reason in ('frontend-unavailable', 'wrong-owner-thread', 'different-current-game',
                       'too-many-known-units', 'observation-copy-unavailable'):
            value = {'schema': codec.SCHEMA, 'complete': False, 'reason': reason}
            with self.subTest(reason=reason), self.assertRaises(codec.CensusUnavailable):
                codec.validate(encode(value))
        value = fixture(); value['complete'] = False; value['reasons'] = ['cached-sprite-unavailable']
        with self.assertRaises(codec.CensusUnavailable): codec.validate(encode(value))

    def test_missing_duplicate_unknown_fields_and_nonfinite_json_fail(self):
        raw = encode(fixture())
        cases = [raw.replace('"schema":', '"extra":0,"schema":', 1),
                 raw.replace('"complete":true', '"complete":true,"complete":true', 1),
                 raw.replace('"value":0.5', '"value":NaN', 1)]
        value = fixture(); del value['supported']; cases.append(encode(value))
        for wire in cases:
            with self.subTest(wire=wire[:80]), self.assertRaises(ProtocolError): codec.validate(wire)

    def test_invented_capabilities_and_fake_quiescence_or_session_scope_fail(self):
        for field in ('animation_frame', 'gpu_frame', 'dispatch_quiescence', 'cross_session_lifetime'):
            value = fixture(); value['supported'][field] = True
            with self.subTest(field=field), self.assertRaises(ProtocolError): self.validate(value)
        value = fixture(); value['scope'] = 'all-sessions'
        with self.assertRaises(ProtocolError): self.validate(value)
        value = fixture(); value['requested_game_matches'] = 1
        with self.assertRaises(ProtocolError): self.validate(value)

    def test_owner_and_definition_world_projection_must_cover_every_unit(self):
        value = fixture(); projection = world(value)
        for replacement in (projection[:1], [{**row, 'owner_id': '0'} for row in projection],
                            [{**row, 'definition_id': 'Former'} for row in projection]):
            with self.subTest(replacement=replacement), self.assertRaises(ProtocolError):
                codec.validate(encode(value), replacement)
        value['owner_counts'][2]['units'] = 0
        with self.assertRaises(ProtocolError): codec.validate(encode(value))

    def test_uint64_boundaries_are_lossless_and_invalid_ids_fail(self):
        value = fixture()
        row = value['units'][-1]
        row['unit_id'] = row['manager_unit_id'] = str(2**64-1)
        self.validate(value)
        for bad in ('01', '-1', str(2**64), '1e2', 10, True):
            broken = copy.deepcopy(value); broken['units'][-1]['unit_id'] = bad
            with self.subTest(bad=bad), self.assertRaises(ProtocolError): codec.validate(encode(broken))

    def test_duplicate_unit_ids_and_manager_mismatch_fail(self):
        value = fixture(); value['units'][1]['unit_id'] = '8'
        with self.assertRaises(ProtocolError): self.validate(value)
        value = fixture(); value['units'][0]['manager_unit_id'] = '9'
        with self.assertRaises(ProtocolError): self.validate(value)

    def test_duplicate_present_resource_instance_pair_fails(self):
        value = fixture(); row = value['units'][1]; source = value['units'][0]
        row['instance_state'] = 'present'; row['instance_id'] = source['instance_id']
        row['instance_position'] = copy.deepcopy(source['instance_position'])
        row['instance_angle'] = copy.deepcopy(source['instance_angle'])
        with self.assertRaisesRegex(ProtocolError, 'duplicate present'): self.validate(value)

    def test_instance_id_is_resource_scoped_not_global(self):
        value = fixture(); row = value['units'][1]
        row['resource']['key'] = 'native/another'; row['resource']['name'] = 'another'
        row['instance_id'] = '1'; row['instance_state'] = 'present'
        row['instance_position'] = vec(0.625, 0.5); row['instance_angle'] = vec(0.0, 0.0, 0.0)
        value['instance_counts'].append({'resource_key': 'native/another', 'before': '1', 'after': '1'})
        value['cache_counts_before'] = value['cache_counts_after'] = 2
        self.validate(value)

    def test_wrong_resource_relation_descriptor_or_count_fails(self):
        for kind in ('descriptor', 'key', 'count', 'mapgrowth', 'spritegrowth'):
            value = fixture()
            if kind == 'descriptor': value['units'][1]['resource']['atlas']['x'] = 3
            if kind == 'key': value['instance_counts'][0]['resource_key'] = 'foreign'
            if kind == 'count': value['instance_counts'][0]['before'] = value['instance_counts'][0]['after'] = '0'
            if kind == 'mapgrowth': value['instance_counts'][0]['after'] = '2'
            if kind == 'spritegrowth': value['cache_counts_after'] = 2
            with self.subTest(kind=kind), self.assertRaises(ProtocolError): self.validate(value)

    def test_absent_and_unallocated_never_supply_invented_native_positions(self):
        for idx, field, item in ((1, 'instance_position', vec()), (2, 'instance_id', '0'),
                                 (0, 'instance_id', '0')):
            value = fixture(); value['units'][idx][field] = item
            with self.subTest(idx=idx, field=field), self.assertRaises(ProtocolError): self.validate(value)
        value = fixture(); del value['units'][0]['instance_angle']
        with self.assertRaises(ProtocolError): self.validate(value)

    def test_optional_texture_filename_absent_is_honest(self):
        value = fixture()
        for row in value['units']:
            row['resource']['texture_filename_supported'] = False
            del row['resource']['texture_filename']
        self.validate(value)
        value['units'][0]['resource']['texture_filename'] = 'guessed.pcx'
        with self.assertRaises(ProtocolError): self.validate(value)

    def test_count_size_and_order_bounds_reject_partial_or_reordered_inventory(self):
        for kind in ('count', 'limit', 'order', 'bytes'):
            value = fixture()
            if kind == 'count': value['known_frontend_units'] = 2
            if kind == 'limit': value['known_frontend_units'] = 1025
            if kind == 'order': value['units'].reverse()
            if kind == 'bytes': value['units'][0]['resource']['name'] = 'x' * codec.MAX_BYTES
            with self.subTest(kind=kind), self.assertRaises(ProtocolError): self.validate(value)

    def test_empty_inventory_validates_only_as_an_empty_inventory(self):
        value = fixture()
        value.update(known_frontend_units=0, owner_counts=[], instance_counts=[], units=[])
        self.assertEqual(codec.validate(encode(value), [])['units'], [])
        with self.assertRaises(ProtocolError): codec.validate(encode(value), world(fixture()))


if __name__ == '__main__':
    unittest.main()
