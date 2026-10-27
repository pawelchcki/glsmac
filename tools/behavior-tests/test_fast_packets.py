"""Fail-closed logical suites over sequential, independently completed workers."""
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile
import unittest

import fast
from protocol import ProtocolError


def contract():
    return dict(id='packet-suite', script='GLSMAC_data/tests/canonical.gls.js',
                domains=['ui'], evidence='glsmac-regression', packets=dict(
                    assertions=4, parts=[
                        dict(script='GLSMAC_data/tests/_first.gls.js', scenario_names=['first', 'second']),
                        dict(script='GLSMAC_data/tests/_next.gls.js', scenario_names=['third']),
                        dict(script='GLSMAC_data/tests/_last.gls.js', scenario_names=['fourth']),
                    ]))


def completed(names):
    return ''.join('BEHAVIOR_BEGIN ' + name + '\n' for name in names) + ''.join(
        'BEHAVIOR_PASS ' + name + '\n' for name in names) + (
        f'BEHAVIOR_SUMMARY {len(names)} {len(names)}\nAll tests passed.\n')


class PacketCatalogTests(unittest.TestCase):
    def test_disband_default_selection_keeps_the_exact_original_seven_case_contract(self):
        suites = fast.load_catalog(fast.DEFAULT_CATALOG)['suites']
        self.assertEqual([suite['id'] for suite in suites if 'packets' in suite], ['unit-disband-controls'])
        row = next(suite for suite in suites if suite['id'] == 'unit-disband-controls')
        cases = (fast.ROOT / 'GLSMAC_data/tests/_unit_disband_regression_cases.gls.js').read_bytes()
        self.assertEqual(hashlib.sha256(cases).hexdigest(), '7407e78beddc606c20263dc233a4530e7af1333d07ae38d6a5f41f5545affc01')
        names = re.findall(r"behavior\.scenario\('([^']+)'", cases.decode())[:7]
        self.assertEqual(len(names), 7)
        self.assertEqual([name for part in row['packets']['parts'] for name in part['scenario_names']], names)
        self.assertEqual([len(part['scenario_names']) for part in row['packets']['parts']], [3, 2, 2])
        self.assertEqual(row['packets']['assertions'], 47)
        self.assertTrue(all((fast.ROOT / script).is_file() for script in fast.suite_scripts(row)))

    def test_only_explicit_unique_packet_contracts_are_accepted(self):
        good = contract()
        changes = []
        for replacement in [None, {}, {'parts': [], 'assertions': 4},
                            {'parts': good['packets']['parts'], 'assertions': True},
                            {'parts': good['packets']['parts'], 'assertions': 0}]:
            row = deepcopy(good); row['packets'] = replacement; changes.append(row)
        for edit in ['unknown', 'duplicate-script', 'canonical-script', 'unsafe-script',
                     'duplicate-name', 'repeat-name', 'empty-name', 'newline-name', 'missing-name']:
            row = deepcopy(good); parts = row['packets']['parts']
            if edit == 'unknown': parts[0]['extra'] = True
            elif edit == 'duplicate-script': parts[1]['script'] = parts[0]['script']
            elif edit == 'canonical-script': parts[0]['script'] = row['script']
            elif edit == 'unsafe-script': parts[0]['script'] = '../outside.gls.js'
            elif edit == 'duplicate-name': parts[1]['scenario_names'] = ['first']
            elif edit == 'repeat-name': parts[0]['scenario_names'] = ['first', 'first']
            elif edit == 'empty-name': parts[0]['scenario_names'] = ['']
            elif edit == 'newline-name': parts[0]['scenario_names'] = ['first\nsecond']
            else: del parts[0]['scenario_names']
            changes.append(row)
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'catalog.json'
            path.write_text(json.dumps(dict(version=1, suites=[good])))
            self.assertEqual(fast.load_catalog(path)['suites'], [good])
            for row in changes:
                path.write_text(json.dumps(dict(version=1, suites=[row])))
                with self.subTest(row=row), self.assertRaises(ProtocolError):
                    fast.load_catalog(path)


class PacketWorkerTests(unittest.TestCase):
    def run_packets(self, change=None, mode=None, missing=None, assertions=4):
        row = contract(); row['packets']['assertions'] = assertions
        outputs = {part['script']: completed(part['scenario_names']) for part in row['packets']['parts']}
        if change: change(outputs, row)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            runtime = root / 'unused.js'; runtime.write_text('pinned-js')
            runtime.with_suffix('.wasm').write_bytes(b'pinned-wasm')
            snapshot = root / 'scripts.json'
            snapshot.write_text(json.dumps({script: 'pinned source ' + script
                                           for script in fast.suite_scripts(row) if script != missing}))
            worker = root / 'worker.py'
            worker.write_text(
                'import json,sys,time\nfrom pathlib import Path\n'
                'r=json.load(sys.stdin)\n'
                "with (Path(r['snapshot']).parent/'started.jsonl').open('a') as f: f.write(json.dumps(r)+'\\n')\n"
                f'outputs={outputs!r}\nmode={mode!r}\n'
                "if mode=='timeout' and r['script'].endswith('_next.gls.js'):\n"
                "    print('timeout-stderr-sentinel',file=sys.stderr,flush=True); time.sleep(2)\n"
                "if mode=='mutate': Path(r['runtime']).write_text('changed')\n"
                "print(outputs[r['script']],end='',flush=True)\n"
                "if mode=='crash' and r['script'].endswith('_next.gls.js'): raise SystemExit(3)\n")
            timeout = 0.2 if mode == 'timeout' else 2
            result = fast.run_suite(row, runtime, snapshot, root, timeout,
                                    node=sys.executable, worker=worker)
            starts = [json.loads(line) for line in (root / 'started.jsonl').read_text().splitlines()]
            self.assertTrue(all(start['script'] in outputs for start in starts))
            self.assertEqual(len({start['prefix'] for start in starts}), len(starts))
            return result, starts

    def test_all_packets_are_required_in_order_with_independent_raw_exit_and_logs(self):
        result, starts = self.run_packets()
        self.assertEqual(result['status'], 'passed', result)
        self.assertEqual(result['scenario_names'], ['first', 'second', 'third', 'fourth'])
        self.assertEqual((result['scenarios'], result['assertions']), (4, 4))
        self.assertEqual([start['script'] for start in starts], [part['script'] for part in contract()['packets']['parts']])
        self.assertEqual(result['per_packet_timeout_s'], 2)
        self.assertEqual(result['worker_timeout_budget_s'], 6)
        for packet in result['packets']:
            self.assertEqual(packet['process_returncode'], 0)
            self.assertEqual(packet['raw_log_sha256'], hashlib.sha256(packet['log'].encode()).hexdigest())
            self.assertEqual(packet['log'].count('All tests passed.'), 1)
            self.assertEqual(len(packet['execution_binding']), 4)
            self.assertEqual(len(packet['script_sha256']), 64)

    def test_bad_completed_inventory_or_missing_footer_stops_before_later_packets(self):
        for replacement in [completed(['wrong']), completed(['third', 'third']),
                            completed(['third']).replace('All tests passed.\n', '')]:
            def change(outputs, row): outputs[row['packets']['parts'][1]['script']] = replacement
            result, starts = self.run_packets(change=change)
            with self.subTest(replacement=replacement):
                self.assertEqual(result['status'], 'failed', result)
                self.assertEqual(len(starts), 2)
                self.assertNotIn('scenarios', result)
                self.assertIn('All tests passed.', result['packets'][0]['log'])

    def test_reordered_names_cannot_pass_even_with_a_valid_worker_summary(self):
        def change(outputs, row): outputs[row['packets']['parts'][0]['script']] = completed(['second', 'first'])
        result, starts = self.run_packets(change=change)
        self.assertEqual(result['status'], 'failed', result)
        self.assertEqual(len(starts), 1)
        self.assertIn('exact ordered scenario inventory', result['reason'])

    def test_simultaneous_logical_runs_cannot_share_native_prefixes(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            runs = list(pool.map(lambda _: self.run_packets(), range(2)))
        self.assertTrue(all(result['status'] == 'passed' for result, _ in runs), runs)
        prefixes = [row['prefix'] for _, starts in runs for row in starts]
        self.assertEqual(len(prefixes), 6)
        self.assertEqual(len(set(prefixes)), 6)

    def test_crash_timeout_missing_source_and_changed_runtime_fail_closed(self):
        for mode, expected in [('crash', 2), ('timeout', 2), ('mutate', 1)]:
            result, starts = self.run_packets(mode=mode)
            with self.subTest(mode=mode):
                self.assertEqual(result['status'], 'failed', result)
                self.assertEqual(len(starts), expected)
                self.assertNotIn('assertions', result)
                if mode == 'crash': self.assertEqual(result['packets'][-1]['process_returncode'], 3)
                if mode == 'timeout':
                    self.assertTrue(result['packets'][-1]['timed_out'])
                    self.assertIsNone(result['packets'][-1]['process_returncode'])
                    self.assertIn('timeout-stderr-sentinel', result['packets'][-1]['log'])
        result, starts = self.run_packets(missing=contract()['packets']['parts'][1]['script'])
        self.assertEqual(result['status'], 'failed', result)
        self.assertEqual(len(starts), 1)

    def test_all_child_passes_do_not_override_an_incomplete_aggregate_assertion_contract(self):
        result, starts = self.run_packets(assertions=47)
        self.assertEqual(len(starts), 3)
        self.assertTrue(all(part['status'] == 'passed' for part in result['packets']))
        self.assertEqual(result['status'], 'failed')
        self.assertIn('aggregate assertion count', result['reason'])


if __name__ == '__main__':
    unittest.main()
