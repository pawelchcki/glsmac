"""Oracle guard tests using hand-written synthetic x86, never game bytes.

These programs test the emulator boundary, not SMAC behavior. Their results
must never be captured as reference observations.
"""

import importlib.util
import struct
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

import original


def synthetic_oracle(program, extra=(), entry=original.X_DIST):
    image = bytearray(original.IMAGE_SIZE)
    for address, code in ((entry, program), *extra):
        offset = address - original.IMAGE_BASE
        image[offset:offset + len(code)] = code
    return original.OriginalOracle(bytes(image))


class FingerprintTests(unittest.TestCase):
    def test_rejects_wrong_fingerprint_before_pe_parsing(self):
        parser = mock.Mock(side_effect=AssertionError("unverified bytes reached the PE parser"))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic-not-a-game.exe"
            with path.open("wb") as stream:
                stream.truncate(original.EXECUTABLE_SIZE)
            with mock.patch.dict(sys.modules, {"pefile": types.SimpleNamespace(PE=parser)}):
                with self.assertRaisesRegex(original.ProbeError, "unsupported executable SHA-256"):
                    original.load_image(path)
        parser.assert_not_called()


class FixtureContractTests(unittest.TestCase):
    def test_basic_switch_rejects_out_of_scope_item_rules_and_bounds(self):
        valid = dict(base_id=0, faction_id=1, previous_item=0, current_item=-3, minerals=21)
        original.validate_input(original.BASIC_SWITCH_LOSS, valid)
        for update in ({"base_id": -1}, {"base_id": 8}, {"faction_id": 0}, {"faction_id": 8},
                       {"previous_item": -65}, {"current_item": 512}, {"minerals": -1},
                       {"minerals": 1_000_001}, {"minerals": True}, {"previous_item": 1.0},
                       {"human": False}, {"skunkworks": True}, {"penalty_percent": 25}):
            with self.subTest(update=update), self.assertRaises(original.ProtocolError):
                original.validate_input(original.BASIC_SWITCH_LOSS, dict(valid, **update))

    def test_rejects_out_of_scope_human_nutrient_factor_inputs(self):
        valid = dict(faction_id=1, map_size_level=2, nutrient_rule_factor=10, growth=0)
        original.validate_input(original.HUMAN_NUTRIENT_FACTOR, valid)
        for update in ({"faction_id": 0}, {"faction_id": 8}, {"faction_id": True},
                       {"map_size_level": -1}, {"map_size_level": 5},
                       {"nutrient_rule_factor": 0}, {"nutrient_rule_factor": 101},
                       {"nutrient_rule_factor": 1.0}, {"growth": -9}, {"growth": 11},
                       {"growth": False}, {"base_id": -1}, {"human": False}):
            with self.subTest(update=update), self.assertRaises(original.ProtocolError):
                original.validate_input(original.HUMAN_NUTRIENT_FACTOR, dict(valid, **update))

    def test_rejects_out_of_scope_human_mineral_factor_inputs(self):
        valid = dict(faction_id=1, map_size_level=2, mineral_rule_factor=10, industry=0)
        original.validate_input(original.HUMAN_MINERAL_FACTOR, valid)
        for update in ({"faction_id": 0}, {"faction_id": 8}, {"faction_id": True},
                       {"map_size_level": -1}, {"map_size_level": 5}, {"map_size_level": False},
                       {"mineral_rule_factor": 0}, {"mineral_rule_factor": 101},
                       {"industry": -9}, {"industry": 11}, {"industry": 1.0},
                       {"base_id": -1}, {"human": False}):
            with self.subTest(update=update), self.assertRaises(original.ProtocolError):
                original.validate_input(original.HUMAN_MINERAL_FACTOR, dict(valid, **update))

    def test_prototype_fixture_rejects_abilities_and_out_of_scope_components(self):
        valid = dict(chassis_id=0, weapon_id=8, armor_id=0, triad=0, chassis_cost=1,
                     missile=False, offense=0, weapon_mode=8, weapon_cost=8, armor_cost=1, reactor=1)
        original.validate_input(original.PROTOTYPE_BASE_COST, valid)
        for update in ({"chassis_id": 9}, {"weapon_id": 26}, {"armor_id": 14}, {"triad": 3},
                       {"chassis_cost": 0}, {"weapon_cost": 33}, {"armor_cost": 0},
                       {"reactor": 0}, {"reactor": 5}, {"offense": -2}, {"offense": 128},
                       {"weapon_mode": 15}, {"missile": 0}, {"abilities": 1},
                       {"chassis_id": True}, {"weapon_cost": 8.0}):
            with self.subTest(update=update), self.assertRaises(original.ProtocolError):
                original.validate_input(original.PROTOTYPE_BASE_COST, dict(valid, **update))

    def test_base_square_fixture_rejects_unrecorded_shapes_and_nonbooleans(self):
        valid = dict(faction_id=1, base_id=0, x=0, y=0, land=True, river=False,
                     headquarters=False, recycling_tanks=False)
        original.validate_input(original.BASE_SQUARE_RESOURCES, valid)
        for update in ({"faction_id": 0}, {"faction_id": True}, {"base_id": 2},
                       {"base_id": False}, {"x": 1}, {"y": 1}, {"x": 2},
                       {"x": False}, {"land": 1}, {"river": 0}, {"headquarters": 0},
                       {"recycling_tanks": 1}, {"land": False, "river": True}, {"extra": 0}):
            with self.subTest(update=update), self.assertRaises(original.ProtocolError):
                original.validate_input(original.BASE_SQUARE_RESOURCES, dict(valid, **update))

    def test_rejects_invalid_geometry_fixtures(self):
        valid = dict(width=80, height=40, flat=False, x1=0, y1=0, x2=1, y2=1)
        for update in ({"flat": 0}, {"width": 81}, {"x1": True}, {"y2": 40},
                       {"x2": 2}, {"height": 1}, {"extra": 1}):
            with self.subTest(update=update), self.assertRaises(original.ProtocolError):
                original.validate_input(original.VECTOR_DISTANCE, dict(valid, **update))

    def test_raw_vectors_accept_odd_parity_but_reject_overflow_and_booleans(self):
        original.validate_input(original.RAW_VECTOR_DISTANCE, {"dx": 0, "dy": 1})
        for values in ({"dx": 4096, "dy": 0}, {"dx": 0, "dy": False}):
            with self.assertRaises(original.ProtocolError):
                original.validate_input(original.RAW_VECTOR_DISTANCE, values)

    def test_rejects_ambiguous_technology_graphs(self):
        row = {"id": 0, "prerequisites": [-1, -1], "owners": 2}
        valid = dict(ancestor_id=0, tech_id=1, max_depth=5, technologies=[row])
        original.validate_input(original.TECH_PREREQUISITE, valid)
        for update in ({"max_depth": 6}, {"max_depth": True}, {"technologies": [row, row]},
                       {"technologies": [dict(row, prerequisites=[89, -1])]},
                       {"technologies": [dict(row, owners=256)]}):
            with self.subTest(update=update), self.assertRaises(original.ProtocolError):
                original.validate_input(original.TECH_PREREQUISITE, dict(valid, **update))

    def test_rejects_invalid_technology_predicate_inputs(self):
        valid = dict(tech_id=0, faction_id=1, prerequisites=[-1, -1], owners=2)
        for update in ({"tech_id": -3}, {"faction_id": 8}, {"owners": True},
                       {"prerequisites": [-1]}, {"prerequisites": [-1, -1.0]}):
            with self.subTest(update=update), self.assertRaises(original.ProtocolError):
                original.validate_input(original.HAS_TECH, dict(valid, **update))

    def test_rejects_incomplete_category_and_nonboolean_expansion_flag(self):
        for values in ({"weights": [0, 1, 2]}, {"weights": [0, 1, 2, 32768]},
                       {"weights": [False, 1, 2, 3]}):
            with self.assertRaises(original.ProtocolError):
                original.validate_input(original.TECH_CATEGORY, values)
        with self.assertRaises(original.ProtocolError):
            original.validate_input(original.TECH_AVAILABLE, dict(
                tech_id=0, faction_id=1, expansion_enabled=1, technologies=[]))


@unittest.skipUnless(importlib.util.find_spec("unicorn"), "optional Unicorn dependency is absent")
class EmulatorGuardTests(unittest.TestCase):
    values = {"width": 80, "x1": 0, "x2": 2, "y": 0}

    def test_basic_switch_fixture_resets_selected_base_fields_and_default_rules(self):
        entry = original.FUNCTIONS[original.BASIC_SWITCH_LOSS][1]
        for base_id in (0, 7):
            address = 0x0097D040 + 308 * base_id + 68
            oracle = synthetic_oracle(b"\xA1" + struct.pack("<I", address) + b"\xC3", entry=entry)
            for previous in (-64, 511, 0):
                data = dict(base_id=base_id, faction_id=7, previous_item=previous,
                            current_item=-3, minerals=21)
                self.assertEqual(oracle.probe(original.BASIC_SWITCH_LOSS, data), {"lost": previous})
        data = dict(base_id=0, faction_id=1, previous_item=0, current_item=-3, minerals=21)
        for address, value in ((0x00949828, 2), (0x0094982C, 50), (0x00949830, 10)):
            oracle = synthetic_oracle(b"\xA1" + struct.pack("<I", address) + b"\xC3", entry=entry)
            self.assertEqual(oracle.probe(original.BASIC_SWITCH_LOSS, data), {"lost": value})

    def test_basic_switch_rejects_neighbor_reads_fixture_writes_and_dependency_escape(self):
        entry = original.FUNCTIONS[original.BASIC_SWITCH_LOSS][1]
        data = dict(base_id=0, faction_id=1, previous_item=0, current_item=-3, minerals=21)
        programs = (b"\xA1" + struct.pack("<I", 0x0097D040 + 72) + b"\xC3",
                    b"\xC7\x05" + struct.pack("<II", 0x0097D040 + 156, 0) + b"\xC3",
                    b"\xE9" + struct.pack("<i", 0x0050BA27 - entry - 5))
        for program in programs:
            with self.subTest(program=program.hex()), self.assertRaises(original.ProbeError):
                synthetic_oracle(program, entry=entry).probe(original.BASIC_SWITCH_LOSS, data)

    def test_human_mineral_fixture_supplies_actual_faction_slot_and_fresh_values(self):
        entry = original.FUNCTIONS[original.HUMAN_MINERAL_FACTOR][1]
        for faction in (1, 7):
            address = original.FACTION_INDUSTRY + faction * original.FACTION_STRIDE
            # mov eax,[industry]; ret -- fixture isolation, not game behavior.
            oracle = synthetic_oracle(b"\xA1" + struct.pack("<I", address) + b"\xC3", entry=entry)
            for industry in (-8, 10, 0):
                values = dict(faction_id=faction, map_size_level=2, mineral_rule_factor=10,
                              industry=industry)
                self.assertEqual(oracle.probe(original.HUMAN_MINERAL_FACTOR, values),
                                 {"factor": industry})

    def test_human_mineral_fixture_marks_only_requested_faction_as_human(self):
        entry = original.FUNCTIONS[original.HUMAN_MINERAL_FACTOR][1]
        oracle = synthetic_oracle(b"\xA1" + struct.pack("<I", original.HUMAN_FACTIONS) + b"\xC3",
                                  entry=entry)
        for faction in (1, 4, 7):
            result = oracle.probe(original.HUMAN_MINERAL_FACTOR, dict(
                faction_id=faction, map_size_level=2, mineral_rule_factor=10, industry=0))
            self.assertEqual(result, {"factor": 1 << faction})

    def test_human_mineral_fixture_does_not_allow_neighboring_or_ai_global_reads(self):
        entry = original.FUNCTIONS[original.HUMAN_MINERAL_FACTOR][1]
        for address in (original.MINERAL_RULE_FACTOR + 4, original.FACTION_INDUSTRY,
                        0x009A64C4):
            oracle = synthetic_oracle(b"\xA1" + struct.pack("<I", address) + b"\xC3", entry=entry)
            with self.subTest(address=address), self.assertRaises(original.ProbeError):
                oracle.probe(original.HUMAN_MINERAL_FACTOR, dict(
                    faction_id=1, map_size_level=2, mineral_rule_factor=10, industry=0))

    def test_explicit_scratch_writes_are_fresh_and_neighbor_writes_are_rejected(self):
        address = original.BASE_RESOURCE_CACHE
        fixture = ((address, struct.pack("<ii", 0, 99)),)
        scratch = struct.pack("<I", address)
        # Read/increment/store fixture scratch. This is hand-written guard code.
        oracle = synthetic_oracle(b"\xA1" + scratch + b"\x40\xA3" + scratch + b"\xC3")
        for _ in range(2):
            self.assertEqual(oracle.execute(original.ALGORITHM, (), fixture,
                                           mutable=((address, address + 4),)), 1)
        for target in (address - 1, address + 1, address + 4):
            bad = synthetic_oracle(b"\xA3" + struct.pack("<I", target) + b"\xC3")
            with self.subTest(target=target), self.assertRaisesRegex(original.ProbeError, "wrote outside"):
                bad.execute(original.ALGORITHM, (), fixture, mutable=((address, address + 4),))

    def test_mutable_ranges_must_be_initialized_and_separate_from_code(self):
        oracle = synthetic_oracle(b"\xC3")
        with self.assertRaisesRegex(original.ProbeError, "fully initialized"):
            oracle.execute(original.ALGORITHM, (), mutable=((original.BASE_RESOURCE_CACHE,
                                                            original.BASE_RESOURCE_CACHE + 4),))
        fixture = ((original.X_DIST + 128, bytes(4)),)
        with self.assertRaisesRegex(original.ProbeError, "share a code page"):
            oracle.execute(original.ALGORITHM, (), fixture,
                           mutable=((original.X_DIST + 128, original.X_DIST + 132),))

    def test_argument_scratch_is_opt_in_and_return_address_remains_guarded(self):
        # mov dword [esp+4],9; mov eax,3; ret
        oracle = synthetic_oracle(b"\xC7\x44\x24\x04\x09\x00\x00\x00\xB8\x03\x00\x00\x00\xC3")
        with self.assertRaisesRegex(original.ProbeError, "changed its return address or arguments"):
            oracle.execute(original.ALGORITHM, (1,))
        self.assertEqual(oracle.execute(original.ALGORITHM, (1,), allow_argument_writes=True), 3)
        # pop ecx; overwrite saved return slot; jmp ecx -- return succeeds but slot changed.
        oracle = synthetic_oracle(b"\x59\xC7\x44\x24\xFC\x00\x00\x00\x00\xFF\xE1")
        with self.assertRaisesRegex(original.ProbeError, "changed its return address or arguments"):
            oracle.execute(original.ALGORITHM, (1,), allow_argument_writes=True)

    def test_only_explicit_original_dependencies_can_execute(self):
        target = original.X_DIST + 0x100
        program = b"\xE9" + struct.pack("<i", target - original.X_DIST - 5)
        oracle = synthetic_oracle(program, ((target, b"\xB8\x03\x00\x00\x00\xC3"),))
        with self.assertRaises(original.ProbeError):
            oracle.execute(original.ALGORITHM, ())
        self.assertEqual(oracle.execute(original.ALGORITHM, (), dependencies=((target, target + 6),)), 3)

    def test_base_resource_fixture_uses_requested_base_and_faction_and_zero_cache(self):
        values = dict(faction_id=7, base_id=7, x=2, y=2, land=True, river=True,
                      headquarters=True, recycling_tanks=True)
        fixture = dict(original.OriginalOracle.base_square_fixture(values))
        self.assertEqual(fixture[original.BASE_RESOURCE_CACHE], bytes(4))
        bases = fixture[0x0097D040]
        self.assertEqual(bases[:308 * 7], bytes(308 * 7))
        self.assertEqual(struct.unpack_from("<hh", bases, 308 * 7), (2, 2))
        self.assertEqual(bases[308 * 7 + 4], 7)
        self.assertEqual(bases[308 * 7 + 140], 10)
        tiles = fixture[0x009F0000]
        self.assertEqual(tiles[(2 * 2 + 1) * 44 + 2], 7)
        self.assertEqual(struct.unpack_from("<I", tiles, (2 * 2 + 1) * 44 + 8)[0], 0x81)

    def test_nutrient_fixture_preserves_local_image_table_and_resets_rule_input(self):
        entry = original.FUNCTIONS[original.HUMAN_NUTRIENT_FACTOR][1]
        values = dict(faction_id=1, map_size_level=2, nutrient_rule_factor=10, growth=0)
        table = 0x004E46C4
        oracle = synthetic_oracle(b"\xA1" + struct.pack("<I", table) + b"\xC3",
                                  ((table, struct.pack("<I", 47)),), entry=entry)
        for rule in (1, 100, 10):
            self.assertEqual(oracle.probe(original.HUMAN_NUTRIENT_FACTOR, dict(values, nutrient_rule_factor=rule)), {"factor": 47})
        oracle = synthetic_oracle(b"\xA1" + struct.pack("<I", 0x00949754) + b"\xC3", entry=entry)
        for rule in (1, 100, 10):
            self.assertEqual(oracle.probe(original.HUMAN_NUTRIENT_FACTOR, dict(values, nutrient_rule_factor=rule)), {"factor": rule})

    def test_nutrient_fixture_rejects_neighbor_reads_and_original_table_writes(self):
        entry = original.FUNCTIONS[original.HUMAN_NUTRIENT_FACTOR][1]
        values = dict(faction_id=1, map_size_level=2, nutrient_rule_factor=10, growth=0)
        neighbor = 0x0096CC54 + original.FACTION_STRIDE
        programs = (b"\xA1" + struct.pack("<I", neighbor) + b"\xC3",
                    b"\xC7\x05" + struct.pack("<II", 0x004E46C4, 0) + b"\xC3")
        for program in programs:
            with self.subTest(program=program.hex()), self.assertRaises(original.ProbeError):
                synthetic_oracle(program, entry=entry).probe(original.HUMAN_NUTRIENT_FACTOR, values)

    def test_prototype_fixture_supplies_selected_record_and_resets_costs(self):
        entry = original.FUNCTIONS[original.PROTOTYPE_BASE_COST][1]
        for chassis, weapon, armor in ((0, 0, 0), (4, 8, 6), (8, 25, 13)):
            address = 0x0094AE60 + weapon * 16 + 11
            # movzx eax,byte [weapon.cost]; ret: synthetic fixture guard only.
            oracle = synthetic_oracle(b"\x0F\xB6\x05" + struct.pack("<I", address) + b"\xC3", entry=entry)
            for cost in (1, 32, 8):
                values = dict(chassis_id=chassis, weapon_id=weapon, armor_id=armor, triad=0,
                              chassis_cost=1, missile=False, offense=0, weapon_mode=8,
                              weapon_cost=cost, armor_cost=1, reactor=1)
                self.assertEqual(oracle.probe(original.PROTOTYPE_BASE_COST, values), {"rows": cost})

    def test_prototype_fixture_rejects_uninitialized_neighbor_and_global_reads(self):
        entry = original.FUNCTIONS[original.PROTOTYPE_BASE_COST][1]
        values = dict(chassis_id=0, weapon_id=8, armor_id=0, triad=0, chassis_cost=1,
                      missile=False, offense=0, weapon_mode=8, weapon_cost=8, armor_cost=1, reactor=1)
        for address in (0x0094AE60 + 8 * 16 + 12, 0x00949750, 0x009AB538):
            oracle = synthetic_oracle(b"\xA1" + struct.pack("<I", address) + b"\xC3", entry=entry)
            with self.subTest(address=address), self.assertRaises(original.ProbeError):
                oracle.probe(original.PROTOTYPE_BASE_COST, values)

    def test_fresh_memory_for_every_case(self):
        scratch = struct.pack("<I", original.STACK_BASE + 16)
        # mov eax,[scratch]; inc eax; inc eax; mov [scratch],eax; ret
        # Reusing the emulator would return two on its second invocation.
        oracle = synthetic_oracle(b"\xA1" + scratch + b"\x40\x40\xA3" + scratch + b"\xC3")
        self.assertEqual(oracle.distance(self.values), 1)
        self.assertEqual(oracle.distance(self.values), 1)

    def test_rejects_execution_outside_allowed_functions(self):
        target = original.X_DIST + 0x80  # Executable page, outside the function boundary.
        # jmp target; target: mov eax,2; ret
        program = b"\xE9" + struct.pack("<i", target - original.X_DIST - 5)
        oracle = synthetic_oracle(program, ((target, b"\xB8\x02\x00\x00\x00\xC3"),))
        with self.assertRaisesRegex(original.ProbeError, "left the permitted functions"):
            oracle.distance(self.values)

    def test_rejects_invalid_memory_and_image_writes(self):
        for label, program in (
            ("unmapped read", b"\xA1" + struct.pack("<I", 0x03000000) + b"\xC3"),
            ("read-only image write", b"\xA3" + struct.pack("<I", original.MAP_WIDTH) + b"\xC3"),
        ):
            with self.subTest(label=label):
                with self.assertRaisesRegex(original.ProbeError, "unavailable memory"):
                    synthetic_oracle(program).distance(self.values)

    def test_rejects_wrong_cdecl_stack(self):
        # mov eax,2; ret 8 -- a callee-cleanup return violates this cdecl boundary.
        oracle = synthetic_oracle(b"\xB8\x02\x00\x00\x00\xC2\x08\x00")
        with self.assertRaisesRegex(original.ProbeError, "invalid cdecl stack"):
            oracle.distance(self.values)

    def test_rejects_changed_arguments_and_preserved_registers(self):
        for label, program, reason in (
            # mov dword [esp+4],0; mov eax,2; ret
            ("argument", b"\xC7\x44\x24\x04\x00\x00\x00\x00\xB8\x02\x00\x00\x00\xC3",
             "changed its return address or arguments"),
            # xor ebx,ebx; mov eax,2; ret
            ("callee-preserved register", b"\x31\xDB\xB8\x02\x00\x00\x00\xC3",
             "callee-preserved register"),
        ):
            with self.subTest(label=label):
                values = dict(self.values, x1=2)
                with self.assertRaisesRegex(original.ProbeError, reason):
                    synthetic_oracle(program).distance(values)

    def test_instruction_limit_stops_an_infinite_loop(self):
        # jmp $ -- keep execution inside the permitted function forever.
        with mock.patch.object(original, "MAX_INSTRUCTIONS", 20):
            with self.assertRaisesRegex(original.ProbeError, "instruction/time limit"):
                synthetic_oracle(b"\xEB\xFE").distance(self.values)

    def test_time_limit_stops_an_infinite_loop(self):
        with (mock.patch.object(original, "MAX_INSTRUCTIONS", 100_000_000),
              mock.patch.object(original, "TIMEOUT_MICROSECONDS", 1_000)):
            with self.assertRaisesRegex(original.ProbeError, "instruction/time limit"):
                synthetic_oracle(b"\xEB\xFE").distance(self.values)

    def test_rejects_interrupts(self):
        # int 0x80 -- even a synthetic request for a host-like syscall must fail.
        with self.assertRaisesRegex(original.ProbeError, "attempted interrupt"):
            synthetic_oracle(b"\xCD\x80").distance(self.values)

    def test_rejects_reads_of_mapped_but_uninitialized_fixture_bytes(self):
        # The byte next to MAP_FLAGS is mapped but is outside the public fixture.
        program = b"\xA1" + struct.pack("<I", original.MAP_FLAGS + 1) + b"\xC3"
        with self.assertRaisesRegex(original.ProbeError, "read outside its fixture"):
            synthetic_oracle(program).distance(self.values)

    def test_sparse_technology_fixture_resets_omitted_rows(self):
        entry = original.FUNCTIONS[original.HAS_TECH][1]
        # movzx eax,byte [owners]; ret -- tests fixture isolation, not game rules.
        program = b"\x0F\xB6\x05" + struct.pack("<I", original.TECH_OWNERS) + b"\xC3"
        oracle = synthetic_oracle(program, entry=entry)
        row = {"id": 0, "prerequisites": [-1, -1], "owners": 64}
        for rows, expected in (([row], 64), ([], 0), ([row], 64)):
            self.assertEqual(oracle.execute(original.HAS_TECH, (0, 1),
                                            oracle.technology_fixture(rows)), expected)

    def test_original_only_metadata_names_every_requested_function(self):
        oracle = synthetic_oracle(b"\xC3")
        self.assertEqual(oracle.metadata(), oracle.metadata(iter([original.ALGORITHM])))
        algorithms = [original.ALGORITHM, original.HAS_TECH, original.TECH_CATEGORY]
        metadata = oracle.metadata(iter(algorithms))
        self.assertEqual([item["algorithm"] for item in metadata["functions"]], sorted(algorithms))
        self.assertEqual(metadata["adapter_version"], 2)

    def test_verified_function_can_cross_an_executable_page_boundary(self):
        entry = original.FUNCTIONS[original.TECH_CATEGORY][1]
        target = (entry & ~(original.PAGE_SIZE - 1)) + original.PAGE_SIZE
        program = b"\xE9" + struct.pack("<i", target - entry - 5)
        oracle = synthetic_oracle(program, ((target, b"\xB8\x02\x00\x00\x00\xC3"),), entry=entry)
        self.assertEqual(oracle.execute(original.TECH_CATEGORY, (0,)), 2)


if __name__ == "__main__":
    unittest.main()
