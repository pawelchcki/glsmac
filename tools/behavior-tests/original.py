#!/usr/bin/env python3
"""Run narrow behavior probes against a caller-supplied original SMACX binary.

This does not start Windows or the game's entry point. Each case executes the
original x86 function in a fresh, bounded Unicorn instance. No game bytes are
stored by this adapter, and no translated implementation supplies its answers.

Address/build provenance (checked against the pinned executable's disassembly):
https://github.com/induktio/thinker/blob/c633f0b801bdf065a0a81450c685f66e97962c16/Technical.md
https://github.com/induktio/thinker/blob/c633f0b801bdf065a0a81450c685f66e97962c16/src/engine.cpp
https://github.com/b-casey/OpenSMACX/blob/2f7f4e24faddbaa5b97ee76d5e3dccfd855e4a8c/src/map.cpp

The test operation uses two valid tiles on one row of a round map. Original
``x_dist`` returns horizontal coordinate units; two units equal one tile step.
That unit conversion is the adapter's only calculation on the returned value.
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

    def metadata(self):
        return {
            "name": "smacx-original",
            "kind": "original-executable",
            "executable_sha256": EXECUTABLE_SHA256,
            "adapter_version": 1,
            "function": "x_dist",
            "address": "0x00579790",
            "engine": "unicorn",
            "engine_version": self.unicorn.__version__,
        }

    def distance(self, values):
        """Execute original x_dist; do not reproduce its decision branches here."""
        uc = self.unicorn
        regs = self.registers
        emulator = uc.Uc(uc.UC_ARCH_X86, uc.UC_MODE_32)
        emulator.mem_map(IMAGE_BASE, IMAGE_SIZE, uc.UC_PROT_READ)
        emulator.mem_write(IMAGE_BASE, self.image)
        width = values["width"]
        emulator.mem_write(MAP_WIDTH, struct.pack("<I", width))
        emulator.mem_write(MAP_HALF_WIDTH, struct.pack("<I", width // 2))
        emulator.mem_write(MAP_FLAGS, b"\x00")  # This operation specifies a round map.
        for start, _end in ALLOWED_CODE:
            emulator.mem_protect(start & ~(PAGE_SIZE - 1), PAGE_SIZE,
                                 uc.UC_PROT_READ | uc.UC_PROT_EXEC)
        emulator.mem_map(STACK_BASE, STACK_SIZE, uc.UC_PROT_READ | uc.UC_PROT_WRITE)
        emulator.mem_map(RETURN_ADDRESS, PAGE_SIZE, uc.UC_PROT_READ | uc.UC_PROT_EXEC)
        stack_pointer = STACK_BASE + STACK_SIZE - 0x100
        arguments = struct.pack("<III", RETURN_ADDRESS, values["x1"], values["x2"])
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
                       for start, end in ALLOWED_CODE):
                stop(f"original execution left the permitted functions at 0x{address:08X}")

        def invalid_memory(_emulator, _access, address, _size, _value, _data):
            failure.append(f"original execution accessed unavailable memory at 0x{address:08X}")
            return False

        def interrupt(_emulator, number, _data):
            stop(f"original execution attempted interrupt {number}")

        emulator.hook_add(uc.UC_HOOK_CODE, check_code)
        emulator.hook_add(uc.UC_HOOK_MEM_INVALID, invalid_memory)
        emulator.hook_add(uc.UC_HOOK_INTR, interrupt)
        try:
            emulator.emu_start(X_DIST, RETURN_ADDRESS, timeout=TIMEOUT_MICROSECONDS,
                               count=MAX_INSTRUCTIONS)
        except uc.UcError as error:
            raise ProbeError(failure[0] if failure else f"original execution failed: {error}") from error
        if failure:
            raise ProbeError(failure[0])
        if emulator.reg_read(regs.UC_X86_REG_EIP) != RETURN_ADDRESS:
            raise ProbeError("original execution did not return before its instruction/time limit")
        if not 0 < instructions < MAX_INSTRUCTIONS:
            raise ProbeError("original execution exceeded its instruction limit")
        if emulator.reg_read(regs.UC_X86_REG_ESP) != stack_pointer + 4:
            raise ProbeError("original execution returned with an invalid cdecl stack")
        if bytes(emulator.mem_read(stack_pointer, len(arguments))) != arguments:
            raise ProbeError("original execution changed its return address or arguments")
        if any(emulator.reg_read(register) != value for register, value in preserved.items()):
            raise ProbeError("original execution changed a callee-preserved register")
        result = struct.unpack("<i", struct.pack("<I", emulator.reg_read(regs.UC_X86_REG_EAX)))[0]
        if result < 0 or result > width // 2 or result % 2:
            raise ProbeError("original execution returned an invalid same-row coordinate distance")
        return result // 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exe", required=True, type=Path,
                        help="local unmodified GOG Alien Crossfire v2.0 terranx.exe")
    arguments = parser.parse_args()
    try:
        cases = load_request()["cases"]
        # Validate the complete batch before executing any original instructions.
        for case in cases:
            if case["algorithm"] == ALGORITHM:
                validate_distance_input(case["input"])
        oracle = OriginalOracle(load_image(arguments.exe))
        results = []
        for case in cases:
            if case["algorithm"] != ALGORITHM:
                results.append({"id": case["id"], "status": "unsupported",
                                "reason": f"unsupported algorithm: {case['algorithm']}"})
            else:
                results.append({"id": case["id"], "status": "ok",
                                "output": {"distance": oracle.distance(case["input"])}})
        write_response(oracle.metadata(), results)
    except (ProbeError, ProtocolError, OSError, UnicodeError) as error:
        print(f"original adapter: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
