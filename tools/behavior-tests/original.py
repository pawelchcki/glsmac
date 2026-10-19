#!/usr/bin/env python3
"""Run narrow behavior probes against a caller-supplied original SMACX binary.

This does not start Windows or the game's entry point. Each case executes the
original x86 function in a fresh, bounded Unicorn instance. No game bytes are
stored by this adapter, and no translated implementation supplies its answers.

Address/build provenance (checked against the pinned executable's disassembly):
https://github.com/induktio/thinker/blob/c633f0b801bdf065a0a81450c685f66e97962c16/Technical.md
https://github.com/induktio/thinker/blob/c633f0b801bdf065a0a81450c685f66e97962c16/src/engine.cpp
https://github.com/b-casey/OpenSMACX/blob/2f7f4e24faddbaa5b97ee76d5e3dccfd855e4a8c/src/map.cpp

Public fixture contracts are specified in contracts.md. Only the legacy
same-row contract converts original x_dist coordinate units to tile steps.
The vector helpers return their original integer scores, and the technology
helpers return their original categories or predicates.
"""

import argparse
import hashlib
import struct
import sys
from pathlib import Path

from protocol import ProtocolError, load_request, validate_distance_input, write_response


EXECUTABLE_SHA256 = "01901cbf7196b0c5d0df9540a029520f5df8fd9a6b343deef8b5663872805fcf"
EXECUTABLE_SIZE = 3_084_288
IMAGE_BASE = 0x00400000
IMAGE_SIZE = 0x0060C000
X_DIST = 0x00579790
ABS = 0x00644F3A
ALLOWED_CODE = ((X_DIST, 0x005797C7), (ABS, 0x00644F45))
MAP_WIDTH = 0x00949870
MAP_HALF_WIDTH = 0x0068FAF0
MAP_FLAGS = 0x0094988C
STACK_BASE = 0x01000000
STACK_SIZE = 0x00010000
RETURN_ADDRESS = 0x02000000
PAGE_SIZE = 0x1000
MAX_INSTRUCTIONS = 1_000
TIMEOUT_MICROSECONDS = 50_000
ALGORITHM = "map.same_row_distance.v1"
VECTOR_DISTANCE = "map.vector_distance.v1"
RAW_VECTOR_DISTANCE = "map.raw_vector_distance.v1"
HAS_TECH = "technology.has_tech.v1"
TECH_CATEGORY = "technology.category.v1"
TECH_AVAILABLE = "technology.available.v1"
TECH_PREREQUISITE = "technology.prerequisite.v1"
HUMAN_MINERAL_FACTOR = "economy.human_mineral_factor.v1"
HUMAN_FACTIONS = 0x009A64E8
MINERAL_RULE_FACTOR = 0x00949750
MAP_SIZE_LEVEL = 0x0094A2A0
FACTION_INDUSTRY = 0x0096CC44
FACTION_STRIDE = 0x20CC
TECH_TABLE = 0x0094F358
TECH_STRIDE = 44
TECH_OWNERS = 0x009A6670
EXPANSION_ENABLED = 0x009A6488
FUNCTIONS = {
    ALGORITHM: ("x_dist", X_DIST, 0x005797C7),
    VECTOR_DISTANCE: ("vector_dist_2", 0x005A5910, 0x005A5987),
    RAW_VECTOR_DISTANCE: ("vector_dist", 0x004F8090, 0x004F80CB),
    HAS_TECH: ("has_tech", 0x005B9F20, 0x005B9F89),
    TECH_CATEGORY: ("tech_category", 0x005B9FE0, 0x005BA02C),
    TECH_AVAILABLE: ("tech_avail", 0x005BAC20, 0x005BADBF),
    TECH_PREREQUISITE: ("tech_is_preq", 0x005BCB60, 0x005BCBDB),
    HUMAN_MINERAL_FACTOR: ("cost_factor (human/mineral, no base)", 0x004E4430, 0x004E45B3),
}


def _fields(values, names):
    if not isinstance(values, dict) or set(values) != set(names):
        raise ProtocolError(f"expected fields {sorted(names)}")


def _integer(value, low, high, name):
    if type(value) is not int or not low <= value <= high:
        raise ProtocolError(f"{name} must be an integer in {low}..{high}")


def _prerequisites(values):
    if not isinstance(values, list) or len(values) != 2:
        raise ProtocolError("prerequisites must contain exactly two integers")
    for value in values:
        _integer(value, -2, 88, "prerequisite")


def _technology_rows(rows):
    if not isinstance(rows, list) or len(rows) > 89:
        raise ProtocolError("technologies must be a list with at most 89 rows")
    ids = set()
    for row in rows:
        _fields(row, {"id", "prerequisites", "owners"})
        _integer(row["id"], 0, 88, "technology id")
        if row["id"] in ids:
            raise ProtocolError("duplicate technology row")
        ids.add(row["id"])
        _prerequisites(row["prerequisites"])
        _integer(row["owners"], 0, 255, "owners")


def validate_input(algorithm, values):
    """Validate public fixture contracts, without computing original results."""
    if algorithm == ALGORITHM:
        validate_distance_input(values)
    elif algorithm == VECTOR_DISTANCE:
        _fields(values, {"width", "height", "flat", "x1", "y1", "x2", "y2"})
        _integer(values["width"], 4, 4096, "width")
        _integer(values["height"], 2, 4096, "height")
        if values["width"] % 2 or type(values["flat"]) is not bool:
            raise ProtocolError("width must be even and flat must be boolean")
        for suffix in ("1", "2"):
            x, y = values["x" + suffix], values["y" + suffix]
            _integer(x, 0, values["width"] - 1, "x coordinate")
            _integer(y, 0, values["height"] - 1, "y coordinate")
            if x % 2 != y % 2:
                raise ProtocolError("coordinates must have valid tile parity")
    elif algorithm == RAW_VECTOR_DISTANCE:
        _fields(values, {"dx", "dy"})
        for name in ("dx", "dy"):
            _integer(values[name], -4095, 4095, name)
    elif algorithm == HAS_TECH:
        _fields(values, {"tech_id", "faction_id", "prerequisites", "owners"})
        _integer(values["tech_id"], -2, 89, "tech_id")
        _integer(values["faction_id"], 0, 7, "faction_id")
        _prerequisites(values["prerequisites"])
        _integer(values["owners"], 0, 255, "owners")
    elif algorithm == TECH_CATEGORY:
        _fields(values, {"weights"})
        if not isinstance(values["weights"], list) or len(values["weights"]) != 4:
            raise ProtocolError("weights must contain exactly four integers")
        for value in values["weights"]:
            _integer(value, -32768, 32767, "weight")
    elif algorithm == TECH_AVAILABLE:
        _fields(values, {"tech_id", "faction_id", "expansion_enabled", "technologies"})
        _integer(values["tech_id"], 0, 88, "tech_id")
        _integer(values["faction_id"], 0, 7, "faction_id")
        if type(values["expansion_enabled"]) is not bool:
            raise ProtocolError("expansion_enabled must be boolean")
        _technology_rows(values["technologies"])
    elif algorithm == TECH_PREREQUISITE:
        _fields(values, {"ancestor_id", "tech_id", "max_depth", "technologies"})
        _integer(values["ancestor_id"], -2, 88, "ancestor_id")
        _integer(values["tech_id"], -2, 88, "tech_id")
        _integer(values["max_depth"], 0, 5, "max_depth")
        _technology_rows(values["technologies"])
    elif algorithm == HUMAN_MINERAL_FACTOR:
        _fields(values, {"faction_id", "map_size_level", "mineral_rule_factor", "industry"})
        _integer(values["faction_id"], 1, 7, "faction_id")
        _integer(values["map_size_level"], 0, 4, "map_size_level")
        _integer(values["mineral_rule_factor"], 1, 100, "mineral_rule_factor")
        _integer(values["industry"], -8, 10, "industry")


class ProbeError(Exception):
    """An invalid request, unsupported binary, or failed original execution."""


def load_image(path):
    """Verify the exact local executable before asking a PE parser to read it."""
    try:
        if path.stat().st_size != EXECUTABLE_SIZE:
            raise ProbeError(f"unsupported executable: expected {EXECUTABLE_SIZE} bytes")
        executable = path.read_bytes()
    except OSError as error:
        raise ProbeError(f"cannot read executable: {error}") from error
    fingerprint = hashlib.sha256(executable).hexdigest()
    if fingerprint != EXECUTABLE_SHA256:
        raise ProbeError(f"unsupported executable SHA-256: {fingerprint}")
    try:
        import pefile
    except ImportError as error:
        raise ProbeError("install the optional dependencies in requirements-reference.txt") from error
    try:
        pe = pefile.PE(data=executable, fast_load=True)
        if (pe.FILE_HEADER.Machine != 0x014C
                or pe.OPTIONAL_HEADER.ImageBase != IMAGE_BASE
                or pe.OPTIONAL_HEADER.SizeOfImage != IMAGE_SIZE):
            raise ProbeError("unexpected PE architecture or memory layout")
        image = pe.get_memory_mapped_image()
        pe.close()
    except pefile.PEFormatError as error:
        raise ProbeError(f"cannot parse original PE image: {error}") from error
    if len(image) > IMAGE_SIZE:
        raise ProbeError("original PE image exceeds its declared mapping")
    return image


class OriginalOracle:
    def __init__(self, image):
        try:
            import unicorn
            from unicorn import x86_const
        except ImportError as error:
            raise ProbeError("install the optional dependencies in requirements-reference.txt") from error
        self.unicorn = unicorn
        self.registers = x86_const
        self.image = image

    def metadata(self, algorithms=()):
        algorithms = tuple(algorithms)
        result = {
            "name": "smacx-original",
            "kind": "original-executable",
            "executable_sha256": EXECUTABLE_SHA256,
            "adapter_version": 1,
            "function": "x_dist",
            "address": "0x00579790",
            "engine": "unicorn",
            "engine_version": self.unicorn.__version__,
        }
        if any(algorithm != ALGORITHM for algorithm in algorithms if algorithm in FUNCTIONS):
            result.pop("function")
            result.pop("address")
            result["adapter_version"] = 2
            result["functions"] = [
                {"algorithm": algorithm, "function": FUNCTIONS[algorithm][0],
                 "address": f"0x{FUNCTIONS[algorithm][1]:08X}"}
                for algorithm in sorted(set(algorithms)) if algorithm in FUNCTIONS
            ]
        return result

    def distance(self, values):
        """Execute original x_dist; do not reproduce its decision branches here."""
        result = self.execute(ALGORITHM, (values["x1"], values["x2"]), self.map_fixture(values))
        width = values["width"]
        if result < 0 or result > width // 2 or result % 2:
            raise ProbeError("original execution returned an invalid same-row coordinate distance")
        return result // 2

    @staticmethod
    def map_fixture(values):
        return (
            (MAP_WIDTH, struct.pack("<I", values["width"])),
            (MAP_HALF_WIDTH, struct.pack("<I", values["width"] // 2)),
            (MAP_FLAGS, bytes([int(values.get("flat", False))])),
        )

    @staticmethod
    def technology_fixture(rows):
        # Sparse public fixtures define every omitted row as disabled/unowned.
        table = bytearray(89 * TECH_STRIDE)
        owners = bytearray(89)
        for index in range(89):
            struct.pack_into("<ii", table, index * TECH_STRIDE + 36, -2, -2)
        for row in rows:
            struct.pack_into("<ii", table, row["id"] * TECH_STRIDE + 36,
                             *row["prerequisites"])
            owners[row["id"]] = row["owners"]
        return ((TECH_TABLE, bytes(table)), (TECH_OWNERS, bytes(owners)))

    def probe(self, algorithm, values):
        validate_input(algorithm, values)
        if algorithm == ALGORITHM:
            return {"distance": self.distance(values)}
        if algorithm == VECTOR_DISTANCE:
            arguments = tuple(values[name] for name in ("x1", "y1", "x2", "y2"))
            result = self.execute(algorithm, arguments, self.map_fixture(values))
            return {"distance": result}
        if algorithm == RAW_VECTOR_DISTANCE:
            return {"distance": self.execute(algorithm, (values["dx"], values["dy"]))}
        if algorithm == TECH_CATEGORY:
            fixture = ((TECH_TABLE + 20, struct.pack("<iiii", *values["weights"])),)
            return {"category": self.execute(algorithm, (0,), fixture)}
        if algorithm == HAS_TECH:
            rows = []
            if 0 <= values["tech_id"] <= 88:
                rows.append({"id": values["tech_id"], "prerequisites": values["prerequisites"],
                             "owners": values["owners"]})
            result = self.execute(algorithm, (values["tech_id"], values["faction_id"]),
                                  self.technology_fixture(rows))
            if result not in (0, 1):
                raise ProbeError("original technology predicate returned a non-boolean value")
            return {"has_tech": bool(result)}
        if algorithm == HUMAN_MINERAL_FACTOR:
            # Human status bypasses AI/difficulty dependencies. Mineral mode
            # and base=-1 exclude nutrient and per-base effects. Every data
            # read on this bounded path has an explicit synthetic fixture.
            fixture = (
                (HUMAN_FACTIONS, struct.pack("<I", 1 << values["faction_id"])),
                (MINERAL_RULE_FACTOR, struct.pack("<i", values["mineral_rule_factor"])),
                (MAP_SIZE_LEVEL, struct.pack("<i", values["map_size_level"])),
                (FACTION_INDUSTRY + values["faction_id"] * FACTION_STRIDE,
                 struct.pack("<i", values["industry"])),
            )
            return {"factor": self.execute(algorithm, (values["faction_id"], 0, -1), fixture)}
        fixture = self.technology_fixture(values["technologies"])
        if algorithm == TECH_AVAILABLE:
            fixture += ((EXPANSION_ENABLED, struct.pack("<I", values["expansion_enabled"])),)
            arguments = (values["tech_id"], values["faction_id"])
            key = "available"
        elif algorithm == TECH_PREREQUISITE:
            arguments = (values["ancestor_id"], values["tech_id"], values["max_depth"])
            key = "is_prerequisite"
        else:
            raise ProbeError(f"unsupported algorithm: {algorithm}")
        result = self.execute(algorithm, arguments, fixture)
        if result not in (0, 1):
            raise ProbeError("original technology predicate returned a non-boolean value")
        return {key: bool(result)}

    def execute(self, algorithm, arguments, fixture=()):
        """Execute only pinned original function instructions with a fresh fixture."""
        uc = self.unicorn
        regs = self.registers
        _name, entry, end = FUNCTIONS[algorithm]
        allowed_code = ((entry, end),)
        if algorithm in (ALGORITHM, VECTOR_DISTANCE, RAW_VECTOR_DISTANCE):
            allowed_code += ((ABS, 0x00644F45),)
        instruction_limit = MAX_INSTRUCTIONS * (10 if algorithm == TECH_PREREQUISITE else 1)
        emulator = uc.Uc(uc.UC_ARCH_X86, uc.UC_MODE_32)
        # Copy only verified function/fixture pages, always into a new emulator.
        # This preserves fresh state while avoiding a full PE mapping per case.
        image_ranges = allowed_code + tuple((start, start + len(data)) for start, data in fixture)
        pages = {page for start, end in image_ranges
                 for page in range(start & ~(PAGE_SIZE - 1), end, PAGE_SIZE)}
        for page in pages:
            if not IMAGE_BASE <= page < IMAGE_BASE + IMAGE_SIZE:
                raise ProbeError("fixture page is outside the verified image")
            emulator.mem_map(page, PAGE_SIZE, uc.UC_PROT_READ)
            offset = page - IMAGE_BASE
            emulator.mem_write(page, self.image[offset:offset + PAGE_SIZE].ljust(PAGE_SIZE, b"\x00"))
        for address, data in fixture:
            emulator.mem_write(address, data)
        for start, end in allowed_code:
            for page in range(start & ~(PAGE_SIZE - 1), end, PAGE_SIZE):
                emulator.mem_protect(page, PAGE_SIZE, uc.UC_PROT_READ | uc.UC_PROT_EXEC)
        emulator.mem_map(STACK_BASE, STACK_SIZE, uc.UC_PROT_READ | uc.UC_PROT_WRITE)
        emulator.mem_map(RETURN_ADDRESS, PAGE_SIZE, uc.UC_PROT_READ | uc.UC_PROT_EXEC)
        stack_pointer = STACK_BASE + STACK_SIZE - 0x100
        arguments = struct.pack("<" + "I" * (len(arguments) + 1), RETURN_ADDRESS,
                                *(value & 0xFFFFFFFF for value in arguments))
        emulator.mem_write(stack_pointer, arguments)
        emulator.reg_write(regs.UC_X86_REG_ESP, stack_pointer)
        emulator.reg_write(regs.UC_X86_REG_EFLAGS, 0x202)
        preserved = {
            regs.UC_X86_REG_EBX: 0x11223344,
            regs.UC_X86_REG_ESI: 0x55667788,
            regs.UC_X86_REG_EDI: 0x99AABBCC,
            regs.UC_X86_REG_EBP: 0x13572468,
        }
        for register, value in preserved.items():
            emulator.reg_write(register, value)
        failure = []
        instructions = 0

        def stop(message):
            failure.append(message)
            emulator.emu_stop()

        def check_code(_emulator, address, size, _data):
            nonlocal instructions
            instructions += 1
            if not any(start <= address and address + size <= end
                       for start, end in allowed_code):
                stop(f"original execution left the permitted functions at 0x{address:08X}")

        def check_read(_emulator, _access, address, size, _value, _data):
            ranges = ((STACK_BASE, STACK_BASE + STACK_SIZE),) + tuple(
                (start, start + len(data)) for start, data in fixture
            )
            if not any(start <= address and address + size <= end for start, end in ranges):
                stop(f"original execution read outside its fixture at 0x{address:08X}")

        def invalid_memory(_emulator, _access, address, _size, _value, _data):
            failure.append(f"original execution accessed unavailable memory at 0x{address:08X}")
            return False

        def interrupt(_emulator, number, _data):
            stop(f"original execution attempted interrupt {number}")

        emulator.hook_add(uc.UC_HOOK_CODE, check_code)
        emulator.hook_add(uc.UC_HOOK_MEM_READ, check_read)
        emulator.hook_add(uc.UC_HOOK_MEM_INVALID, invalid_memory)
        emulator.hook_add(uc.UC_HOOK_INTR, interrupt)
        try:
            emulator.emu_start(entry, RETURN_ADDRESS, timeout=TIMEOUT_MICROSECONDS,
                               count=instruction_limit)
        except uc.UcError as error:
            raise ProbeError(failure[0] if failure else f"original execution failed: {error}") from error
        if failure:
            raise ProbeError(failure[0])
        if emulator.reg_read(regs.UC_X86_REG_EIP) != RETURN_ADDRESS:
            raise ProbeError("original execution did not return before its instruction/time limit")
        if not 0 < instructions < instruction_limit:
            raise ProbeError("original execution exceeded its instruction limit")
        if emulator.reg_read(regs.UC_X86_REG_ESP) != stack_pointer + 4:
            raise ProbeError("original execution returned with an invalid cdecl stack")
        if bytes(emulator.mem_read(stack_pointer, len(arguments))) != arguments:
            raise ProbeError("original execution changed its return address or arguments")
        if any(emulator.reg_read(register) != value for register, value in preserved.items()):
            raise ProbeError("original execution changed a callee-preserved register")
        result = struct.unpack("<i", struct.pack("<I", emulator.reg_read(regs.UC_X86_REG_EAX)))[0]
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exe", required=True, type=Path,
                        help="local unmodified GOG Alien Crossfire v2.0 terranx.exe")
    arguments = parser.parse_args()
    try:
        cases = load_request()["cases"]
        # Validate the complete batch before executing any original instructions.
        for case in cases:
            validate_input(case["algorithm"], case["input"])
        oracle = OriginalOracle(load_image(arguments.exe))
        results = []
        for case in cases:
            if case["algorithm"] not in FUNCTIONS:
                results.append({"id": case["id"], "status": "unsupported",
                                "reason": f"unsupported algorithm: {case['algorithm']}"})
            else:
                results.append({"id": case["id"], "status": "ok",
                                "output": oracle.probe(case["algorithm"], case["input"])})
        write_response(oracle.metadata(case["algorithm"] for case in cases), results)
    except (ProbeError, ProtocolError, OSError, UnicodeError) as error:
        print(f"original adapter: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
