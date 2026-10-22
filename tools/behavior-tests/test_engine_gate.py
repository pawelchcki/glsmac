"""Exercise the actual required-check guard across producer outcomes."""

import os
from pathlib import Path
import subprocess
import sys
import unittest


class EngineGateTests(unittest.TestCase):
    def test_success_and_explicit_shared_artifact_are_the_only_passing_paths(self):
        for result, artifact in [('success', ''), ('success', 'behavior-engine'), ('skipped', 'behavior-engine')]:
            with self.subTest(result=result, artifact=artifact):
                process = self.guard(result, artifact)
                self.assertEqual(process.returncode, 0, process.stderr)

    def test_failure_cancelled_missing_or_unexplained_skip_fails_even_with_an_old_artifact(self):
        for result in ('failure', 'cancelled', '', 'unknown', 'skipped'):
            for artifact in ('', 'behavior-engine'):
                if result == 'skipped' and artifact:
                    continue
                with self.subTest(result=result, artifact=artifact):
                    process = self.guard(result, artifact)
                    self.assertNotEqual(process.returncode, 0)
                    self.assertIn('producer did not succeed', process.stderr)

    def guard(self, result, artifact):
        env = dict(os.environ, TEST_ENGINE_RESULT=result, TEST_ENGINE_ARTIFACT=artifact)
        return subprocess.run([sys.executable, str(Path(__file__).with_name('engine_gate.py'))],
                              env=env, capture_output=True, text=True, timeout=10)


if __name__ == '__main__':
    unittest.main()
