"""Declared suite headroom never overrides an explicit user's worker deadline."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import fast
import lanes
from protocol import ProtocolError


def suite(name, declared=False):
    row = dict(id=name, script=f'GLSMAC_data/tests/{name}.gls.js', domains=['gameplay'], evidence='glsmac-regression')
    if declared:
        row['execution_timeout'] = dict(seconds=240, reason='Measured complete native fixture headroom')
    return row


class TimeoutContractTests(unittest.TestCase):
    def test_only_capacity_declares_headroom_and_native_case_bytes_are_unchanged(self):
        rows = fast.load_catalog(fast.DEFAULT_CATALOG)['suites']
        declared = [row for row in rows if 'execution_timeout' in row]
        self.assertEqual([row['id'] for row in declared], ['terraforming-cooperation-capacity'])
        self.assertEqual(declared[0]['execution_timeout']['seconds'], 240)
        self.assertEqual(hashlib.sha256((fast.ROOT / declared[0]['script']).read_bytes()).hexdigest(),
                         '70056250da9314593e04fa2be65536eea60b76284b28bf1d14a8f59e96732b81')

    def test_invalid_or_ambiguous_declared_budgets_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'catalog.json'
            for bad in [True, None, {}, {'seconds': True, 'reason': 'x'}, {'seconds': 0, 'reason': 'x'},
                        {'seconds': 301, 'reason': 'x'}, {'seconds': 240.0, 'reason': 'x'},
                        {'seconds': 240, 'reason': ' '}, {'seconds': 240, 'reason': False},
                        {'seconds': 240, 'reason': 'x', 'override': True}]:
                row = suite('capacity'); row['execution_timeout'] = bad
                path.write_text(json.dumps(dict(version=1, suites=[row])))
                with self.subTest(budget=bad), self.assertRaises(ProtocolError): fast.load_catalog(path)

    def invoke_cli(self, argv):
        rows = [suite('ordinary'), suite('capacity', True)]
        calls = []
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); runtime = root / 'GLSMAC.js'; runtime.write_text('runtime')
            runtime.with_suffix('.wasm').write_bytes(b'wasm'); report = root / 'report.json'
            def runner(row, runtime, snapshot, directory, timeout, node):
                calls.append((row['id'], timeout))
                return dict(id=row['id'], status='passed', scenarios=1, assertions=1, elapsed_ms=0)
            with patch.object(fast, 'load_catalog', return_value=dict(suites=rows)), \
                 patch.object(fast, 'create_snapshot', return_value={row['script']: 'source' for row in rows}), \
                 patch.object(fast.lanes, 'select', side_effect=lambda kind, selected, lane: selected), \
                 patch.object(fast, 'run_suite', side_effect=runner), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(fast.main([*argv, '--runtime', str(runtime), '--report', str(report)]), 0)
            return calls, json.loads(report.read_text())

    def test_real_lane_command_keeps_ordinary_120_and_declared_capacity_240(self):
        command = lanes.command('regression', 'hot', 2, Path('ignored.json'))
        self.assertEqual(command[command.index('--lane') + 1], 'hot')
        self.assertNotIn('--timeout', command, 'Internal lane default must not masquerade as an explicit user override')
        self.assertEqual(command[command.index('--default-timeout') + 1], '120')
        calls, report = self.invoke_cli(command[2:])
        self.assertEqual(dict(calls), dict(ordinary=120, capacity=240))
        self.assertEqual(report['default_timeout_s'], 120)
        self.assertIsNone(report['requested_timeout_s'])
        budgets = {row['id']: row['timeout_budget'] for row in report['results']}
        self.assertEqual(budgets['ordinary']['source'], 'default')
        self.assertEqual(budgets['capacity']['declared_seconds'], 240)
        self.assertEqual(budgets['capacity']['effective_seconds'], 240)
        self.assertEqual(budgets['capacity']['source'], 'catalog')

    def test_explicit_cli_override_wins_even_when_lower_than_capacity_profile(self):
        calls, report = self.invoke_cli(['--lane', 'hot', '--jobs', '2', '--timeout', '120'])
        self.assertEqual(dict(calls), dict(ordinary=120, capacity=120))
        budget = next(row['timeout_budget'] for row in report['results'] if row['id'] == 'capacity')
        self.assertEqual((budget['requested_seconds'], budget['declared_seconds'], budget['effective_seconds']), (120, 240, 120))
        self.assertEqual(budget['source'], 'cli')

    def test_direct_all_lane_default_stays_30_for_ordinary_suites(self):
        calls, report = self.invoke_cli(['--jobs', '1'])
        self.assertEqual(dict(calls), dict(ordinary=30, capacity=240))
        self.assertEqual(report['default_timeout_s'], 30)

    def test_direct_selected_lane_defaults_also_stay_30_without_wrapper_fallback(self):
        for lane in ['hot', 'stable']:
            with self.subTest(lane=lane):
                calls, report = self.invoke_cli(['--lane', lane, '--jobs', '1'])
                self.assertEqual(dict(calls), dict(ordinary=30, capacity=240))
                self.assertEqual(report['default_timeout_s'], 30)

    def test_all_lane_wrapper_preserves_its_previous_120_default(self):
        command = lanes.command('regression', 'all', 2, Path('ignored.json'))
        calls, report = self.invoke_cli(command[2:])
        self.assertEqual(dict(calls), dict(ordinary=120, capacity=240))
        self.assertEqual(report['default_timeout_s'], 120)

    def test_packet_workers_keep_individual_lane_deadlines_and_exact_aggregate(self):
        row = suite('packet')
        row['packets'] = dict(parts=[dict(script=f'GLSMAC_data/tests/_part_{i}.gls.js', scenario_names=[name])
                                    for i, name in enumerate(['first', 'second', 'third'])], assertions=3)
        timeouts = []
        def worker(argv, **kwargs):
            request = json.loads(kwargs['input']); timeouts.append(kwargs['timeout'])
            part = next(part for part in row['packets']['parts'] if part['script'] == request['script'])
            name = part['scenario_names'][0]
            return subprocess.CompletedProcess(argv, 0, f'BEHAVIOR_BEGIN {name}\nBEHAVIOR_PASS {name}\nBEHAVIOR_SUMMARY 1 1\nAll tests passed.\n', '')
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); runtime = root / 'GLSMAC.js'; runtime.write_text('runtime')
            runtime.with_suffix('.wasm').write_bytes(b'wasm'); snapshot = root / 'scripts.json'
            snapshot.write_text(json.dumps({path: 'source' for path in fast.suite_scripts(row)}))
            with patch.object(fast.subprocess, 'run', side_effect=worker):
                result = list(fast.scheduled_results([row], runtime, snapshot, root, None, 'node', 2))[0]
        self.assertEqual(timeouts, [120, 120, 120])
        self.assertEqual(result['status'], 'passed')
        self.assertEqual(result['scenario_names'], ['first', 'second', 'third'])
        self.assertEqual(result['worker_timeout_budget_s'], 360)
        self.assertEqual(result['timeout_budget']['effective_seconds'], 120)


if __name__ == '__main__': unittest.main()
