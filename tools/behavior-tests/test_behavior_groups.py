"""Actual optional native failure/cleanup checks for grouped script cases."""
import os
from pathlib import Path
import tempfile
import unittest

import fast

RUNTIME = Path(os.environ.get('STATE_TRACE_RUNTIME', fast.ROOT / 'build/wasm/bin/GLSMAC.js'))


@unittest.skipUnless(RUNTIME.is_file() and RUNTIME.with_suffix('.wasm').is_file(),
                     'WASM runtime absent; grouped positive cases are also gated by script-stages')
class NativeGroupedFailures(unittest.TestCase):
    def check_failure(self, mode):
        script = f'GLSMAC_data/tests/_behavior_group_{mode}_failure.gls.js'
        row = dict(id='grouped-expected-failure-' + mode, script=script,
                   domains=['gameplay'], evidence='glsmac-regression')
        with tempfile.TemporaryDirectory(prefix='grouped-native-negative-') as temporary:
            root = Path(temporary)
            snapshot = root / 'scripts.json'
            snapshot.write_text(fast.canonical(fast.create_snapshot()))
            result = fast.run_suite(row, RUNTIME, snapshot, root, 40)
        self.assertEqual(result['status'], 'failed', result)
        self.assertEqual(result['reason'], 'GSE reported a test failure', result)
        self.assertIn('GROUP_NEGATIVE_BODY_READY|' + mode, result['log'])
        self.assertIn('intentional grouped ' + mode + ' failure', result['log'])
        self.assertIn('GROUP_NEGATIVE_CLEANUP|' + mode, result['log'])
        self.assertIn('Testing complete, passed: 0, failed: 1', result['log'])
        for forbidden in ['GROUP_NEGATIVE_UNEXPECTED_COMPLETION', 'BEHAVIOR_PASS ',
                          'BEHAVIOR_SUMMARY ', 'All tests passed.']:
            self.assertNotIn(forbidden, result['log'])

    def test_body_failure_runs_native_checked_cleanup_without_later_case_or_pass(self):
        self.check_failure('body')

    def test_cleanup_failure_prevents_group_pass_summary_and_success(self):
        self.check_failure('cleanup')


if __name__ == '__main__':
    unittest.main()
