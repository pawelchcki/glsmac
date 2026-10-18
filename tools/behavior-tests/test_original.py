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


def synthetic_oracle(program, extra=()):
    image = bytearray(original.IMAGE_SIZE)
    for address, code in ((original.X_DIST, program), *extra):
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


@unittest.skipUnless(importlib.util.find_spec("unicorn"), "optional Unicorn dependency is absent")
class EmulatorGuardTests(unittest.TestCase):
    values = {"width": 80, "x1": 0, "x2": 2, "y": 0}

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


if __name__ == "__main__":
    unittest.main()
