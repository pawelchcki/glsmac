"""Native research snapshot preservation without graphics or installed assets."""
from pathlib import Path
import shlex
import os
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class ResearchStateTests(unittest.TestCase):
    def test_native_research_roundtrip_and_atomic_rejection(self):
        with tempfile.TemporaryDirectory(prefix='smac-research-state-') as directory:
            executable = Path(directory) / 'research-state'
            command = shlex.split(os.environ.get('CXX', 'c++')) + [
                '-std=c++23', '-O1', '-ffunction-sections', '-fdata-sections', '-Wl,--gc-sections',
                '-I' + str(ROOT / 'src'), str(ROOT / 'tools/behavior-tests/research_state.cpp'),
                str(ROOT / 'src/game/backend/technology/Research.cpp'),
                str(ROOT / 'src/types/Buffer.cpp'), str(ROOT / 'src/common/Common.cpp'),
                '-o', str(executable),
            ]
            built = subprocess.run(command, capture_output=True, text=True, timeout=90)
            self.assertEqual(built.returncode, 0, built.stderr)
            result = subprocess.run([str(executable)], capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertRegex(result.stdout, r'^PASS research state / [1-9][0-9]* assertions\n$')


if __name__ == '__main__':
    unittest.main()
