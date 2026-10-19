#!/usr/bin/env python3
"""Execute the original custom-planet controller with display boundaries stubbed.

No original algorithm is reproduced here. The pinned x86 controller chooses
questions, reads selection defaults, stores answers and branches on cancel.
Only construction/loading of graphics objects and modal input waits are mocked.
The observation ends at the next input wait or the verified UI teardown boundary.
"""

import argparse
import os
from pathlib import Path
import struct
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import original
from protocol import ProtocolError, load_request, write_response


ALGORITHM = "ui.custom_planet.v1"
ENTRY = 0x0058C2A0
CODE = ((ENTRY, 0x0058CE9C), (0x00645470, 0x00645550), (0x00645550, 0x0064557F))
STOPS = {0x0058C7FC: "confirmed", 0x0058CBDB: "canceled"}
# Display-only boundaries: verified original entry points and stack cleanup.
CONSTRUCTORS = {0x004048A0: 0, 0x004AD880: 0, 0x006457C2: 20, 0x005D7DE0: 16}
POPUP_START = 0x00406380
INPUT_WAIT = 0x004ADB20
PARAMETERS = 0x0094A2A0
PREFERENCES = 0x0094B480
TEXT_BUFFER = 0x009B86A0
WIDTH = 0x009B7B1C
FIELD_INDICES = (1, 3, 6, 5)  # declared engine field order: ocean, erosion, life, clouds
TAGS = {"WORLDLAND": "ocean", "WORLDTIDES": "erosion", "WORLDLIFE": "life", "WORLDCLOUDS": "clouds"}
MAX_INSTRUCTIONS = 20000


def validate_input(values):
    original._fields(values, {"choices", "preferences"})
    if not isinstance(values["preferences"], list) or len(values["preferences"]) != 4:
        raise ProtocolError("preferences requires four menu ordinals")
    for value in values["preferences"]:
        original._integer(value, 0, 2, "preference")
    choices = values["choices"]
    if not isinstance(choices, list) or len(choices) > 4:
        raise ProtocolError("choices requires at most four responses")
    for index, value in enumerate(choices):
        original._integer(value, -1, 2, "choice")
        if value == -1 and index != len(choices) - 1:
            raise ProtocolError("no responses may follow cancellation")


class MenuOracle(original.OriginalOracle):
    def probe_custom(self, values):
        validate_input(values)
        uc, regs = self.unicorn, self.registers
        emulator = uc.Uc(uc.UC_ARCH_X86, uc.UC_MODE_32)
        settings, preferences = [2] + [0] * 6, [2] + [0] * 6
        for index, value in zip(FIELD_INDICES, values["preferences"]):
            preferences[index] = value
        fixture = (
            (PARAMETERS, struct.pack("<7i", *settings)),
            (PREFERENCES, struct.pack("<7i", *preferences)),
            (TEXT_BUFFER, bytes(256)), (WIDTH, struct.pack("<I", 1024)),
        )
        writable = ((0, 4), (original.STACK_BASE, original.STACK_BASE + original.STACK_SIZE)) + tuple(
            (address, address + len(data)) for address, data in fixture)
        readable = writable + ((0x0068F754, 0x0068F824), (0x0058CE9C, 0x0058CED0))
        hooks = tuple(CONSTRUCTORS) + (POPUP_START, INPUT_WAIT) + tuple(STOPS)
        ranges = CODE + tuple((address, address + 1) for address in hooks) + readable[2:]
        pages = {page for start, end in ranges for page in range(start & ~4095, end, 4096)}
        for page in pages:
            if not original.IMAGE_BASE <= page < original.IMAGE_BASE + original.IMAGE_SIZE:
                raise original.ProbeError("menu fixture page is outside verified image")
            emulator.mem_map(page, 4096, uc.UC_PROT_READ | uc.UC_PROT_EXEC)
            offset = page - original.IMAGE_BASE
            emulator.mem_write(page, self.image[offset:offset + 4096].ljust(4096, b"\0"))
        for address, data in fixture:
            emulator.mem_protect(address & ~4095, 4096, uc.UC_PROT_READ | uc.UC_PROT_WRITE)
            emulator.mem_write(address, data)
        emulator.mem_map(0, 4096, uc.UC_PROT_READ | uc.UC_PROT_WRITE)  # private x86 SEH link
        emulator.mem_map(original.STACK_BASE, original.STACK_SIZE, uc.UC_PROT_READ | uc.UC_PROT_WRITE)
        emulator.mem_map(original.RETURN_ADDRESS, 4096, uc.UC_PROT_READ | uc.UC_PROT_EXEC)
        sp = original.STACK_BASE + original.STACK_SIZE - 256
        # Actual main-menu presentation mode, no automated-setup shortcut.
        emulator.mem_write(sp, struct.pack("<III", original.RETURN_ADDRESS, 1, 0))
        emulator.reg_write(regs.UC_X86_REG_ESP, sp)
        emulator.reg_write(regs.UC_X86_REG_EFLAGS, 0x202)
        menus, popup_tags, failures = [], {}, []
        consumed, outcome = 0, None

        def inside(address, size, permitted):
            return any(start <= address and address + size <= end for start, end in permitted)

        def read(address, size):
            if not inside(address, size, readable):
                raise original.ProbeError(f"menu adapter read outside fixture at 0x{address:08X}")
            return bytes(emulator.mem_read(address, size))

        def integer(address):
            return struct.unpack("<I", read(address, 4))[0]

        def signed(address):
            return struct.unpack("<i", read(address, 4))[0]

        def string(address):
            result = bytearray()
            for offset in range(64):
                byte = read(address + offset, 1)
                if byte == b"\0":
                    return result.decode("ascii")
                result.extend(byte)
            raise original.ProbeError("unterminated original menu tag")

        def return_from_boundary(value, cleanup):
            pointer = emulator.reg_read(regs.UC_X86_REG_ESP)
            destination = integer(pointer)
            if not inside(destination, 1, CODE):
                raise original.ProbeError("UI boundary returned outside original controller")
            emulator.reg_write(regs.UC_X86_REG_EAX, value & 0xFFFFFFFF)
            emulator.reg_write(regs.UC_X86_REG_ESP, pointer + 4 + cleanup)
            emulator.reg_write(regs.UC_X86_REG_EIP, destination)

        def code(_emulator, address, size, _data):
            nonlocal consumed, outcome
            if address in STOPS:
                outcome = STOPS[address]
                emulator.emu_stop()
            elif address in CONSTRUCTORS:
                return_from_boundary(emulator.reg_read(regs.UC_X86_REG_ECX), CONSTRUCTORS[address])
            elif address == POPUP_START:
                pointer = emulator.reg_read(regs.UC_X86_REG_ESP)
                popup = emulator.reg_read(regs.UC_X86_REG_ECX)
                tag = string(integer(pointer + 8))
                if tag not in TAGS or not inside(popup + 0xA44, 4, writable):
                    raise original.ProbeError("unsupported original popup fixture")
                popup_tags[popup] = tag
                return_from_boundary(0, 24)
            elif address == INPUT_WAIT:
                pointer = emulator.reg_read(regs.UC_X86_REG_ESP)
                popup = integer(pointer + 4)
                if popup not in popup_tags:
                    raise original.ProbeError("original waited on an uninitialized popup")
                menus.append({"screen": TAGS[popup_tags[popup]], "selected": signed(popup + 0xA44)})
                if consumed == len(values["choices"]):
                    outcome = "waiting"
                    emulator.emu_stop()
                else:
                    response = values["choices"][consumed]
                    consumed += 1
                    return_from_boundary(response, 12)
            elif not inside(address, size, CODE):
                raise original.ProbeError(f"original menu left permitted code at 0x{address:08X}")

        def memory(_emulator, access, address, size, _value, _data):
            allowed = writable if access == uc.UC_MEM_WRITE else readable
            if not inside(address, size, allowed):
                failures.append(f"original menu accessed outside fixture at 0x{address:08X}")
                emulator.emu_stop()

        def invalid(_emulator, _access, address, _size, _value, _data):
            failures.append(f"original menu accessed unmapped/protected memory at 0x{address:08X}")
            return False

        def interrupt(_emulator, number, _data):
            failures.append(f"original menu attempted interrupt {number}")
            emulator.emu_stop()

        emulator.hook_add(uc.UC_HOOK_CODE, code)
        emulator.hook_add(uc.UC_HOOK_MEM_READ | uc.UC_HOOK_MEM_WRITE, memory)
        emulator.hook_add(uc.UC_HOOK_MEM_INVALID, invalid)
        emulator.hook_add(uc.UC_HOOK_INTR, interrupt)
        try:
            emulator.emu_start(ENTRY, original.RETURN_ADDRESS, timeout=100000, count=MAX_INSTRUCTIONS)
        except uc.UcError as error:
            raise original.ProbeError(failures[0] if failures else str(error)) from error
        if failures:
            raise original.ProbeError(failures[0])
        if outcome is None or consumed != len(values["choices"]):
            raise original.ProbeError("original menu did not consume the bounded sequence before its execution limit")
        parameters = [signed(PARAMETERS + index * 4) for index in FIELD_INDICES] if outcome == "confirmed" else None
        return {"menus": menus, "status": outcome, "consumed": consumed, "parameters": parameters}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    default = Path(os.environ["SMAC_ASSETS_DIR"]) / "terranx.exe" if "SMAC_ASSETS_DIR" in os.environ else None
    parser.add_argument("--exe", type=Path, default=default)
    args = parser.parse_args()
    if args.exe is None:
        raise ProtocolError("provide --exe or SMAC_ASSETS_DIR")
    cases = load_request()["cases"]
    for case in cases:
        if case["algorithm"] == ALGORITHM:
            validate_input(case["input"])
    oracle = MenuOracle(original.load_image(args.exe))
    results = [{"id": case["id"], "status": "ok", "output": oracle.probe_custom(case["input"])}
               if case["algorithm"] == ALGORITHM else {"id": case["id"], "status": "unsupported", "reason": "unknown menu controller contract"}
               for case in cases]
    write_response({"name": "smacx-original-headless-ui", "kind": "original-executable", "adapter_version": 1,
                    "executable_sha256": original.EXECUTABLE_SHA256, "engine": "unicorn", "engine_version": oracle.unicorn.__version__,
                    "function": "custom_planet", "address": "0x0058C2A0", "rendering": False,
                    "mocked": ["graphics object construction", "bitmap loading", "popup creation", "modal response delivery"],
                    "scope": "Original question order, selected defaults, parameter writes and cancel/confirm branches before UI teardown"}, results)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ProtocolError, original.ProbeError) as error:
        print(f"Original headless menu adapter failed: {error}", file=sys.stderr)
        sys.exit(1)
