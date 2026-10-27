"""Resource isolation is scheduling only, never a substitute for worker success."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest

import fast
from protocol import ProtocolError


def suite(name, exclusive=False):
    row = dict(id=name, script='GLSMAC_data/tests/' + name.replace('-', '_') + '.gls.js',
               domains=['gameplay'], evidence='glsmac-regression')
    if exclusive: row['scheduling'] = dict(mode='exclusive', reason='Declared large native fixture')
    return row


class SchedulingCatalogTests(unittest.TestCase):
    def test_only_capacity_is_declared_exclusive_without_changing_its_script_or_packet_shape(self):
        rows = fast.load_catalog(fast.DEFAULT_CATALOG)['suites']
        exclusive = [row for row in rows if 'scheduling' in row]
        self.assertEqual([row['id'] for row in exclusive], ['terraforming-cooperation-capacity'])
        self.assertEqual(exclusive[0]['script'], 'GLSMAC_data/tests/terraforming_cooperation_capacity.gls.js')
        self.assertNotIn('packets', exclusive[0])
        self.assertEqual(exclusive[0]['scheduling']['mode'], 'exclusive')

    def test_invalid_modes_types_empty_reasons_and_unknown_fields_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'catalog.json'
            good = suite('capacity', True)
            path.write_text(json.dumps(dict(version=1, suites=[good])))
            self.assertEqual(fast.load_catalog(path)['suites'], [good])
            for bad in [True, None, [], {}, {'mode':'parallel','reason':'x'},
                        {'mode':'exclusive','reason':True}, {'mode':'exclusive','reason':'  '},
                        {'mode':'exclusive','reason':'x','workers':2}]:
                row = deepcopy(good); row['scheduling'] = bad
                path.write_text(json.dumps(dict(version=1, suites=[row])))
                with self.subTest(declaration=bad), self.assertRaises(ProtocolError):
                    fast.load_catalog(path)


class SchedulingWorkerTests(unittest.TestCase):
    def test_exclusive_worker_retains_complete_raw_output_and_prelaunch_hashes(self):
        good = 'BEHAVIOR_BEGIN capacity\nBEHAVIOR_PASS capacity\nBEHAVIOR_SUMMARY 1 1\nAll tests passed.\n'
        for mutate in [False, True]:
            with self.subTest(mutate=mutate), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary); runtime = root / 'runtime.js'; runtime.write_text('pinned-runtime')
                runtime.with_suffix('.wasm').write_bytes(b'pinned-wasm'); snapshot = root / 'scripts.json'
                row = suite('capacity', True); snapshot.write_text(json.dumps({row['script']:'pinned source'}))
                worker = root / 'worker.py'
                worker.write_text('import json,sys\nfrom pathlib import Path\nr=json.load(sys.stdin)\n' +
                                  ("Path(r['runtime']).write_text('changed')\n" if mutate else '') + f'print({good!r},end="")\n')
                result = fast.run_suite(row, runtime, snapshot, root, 2, sys.executable, worker)
                self.assertEqual(result['process_returncode'], 0)
                self.assertEqual(result['log'], good)
                self.assertEqual(result['raw_log_sha256'], hashlib.sha256(good.encode()).hexdigest())
                self.assertEqual(result['execution_binding']['runtime_js_sha256'], hashlib.sha256(b'pinned-runtime').hexdigest())
                self.assertEqual(len(result['execution_binding']), 4)
                self.assertEqual(result['script_sha256'], hashlib.sha256(b'pinned source').hexdigest())
                self.assertEqual(result['status'], 'failed' if mutate else 'passed', result)
                if mutate: self.assertIn('exclusive execution input changed', result['reason'])

    def execute(self, failures=()):
        rows = [suite('before-a'), suite('before-b'), suite('capacity', True), suite('after-a'), suite('after-b')]
        lock = threading.Lock(); active = set(); finished = set(); events = []
        barriers = {name:threading.Barrier(2, timeout=2) for name in ('before','after')}
        def runner(row, runtime, snapshot, temporary, timeout, node):
            name = row['id']
            with lock:
                if name == 'capacity':
                    self.assertFalse(active, 'Prior workers must finish before capacity starts')
                    self.assertEqual(finished, {'before-a','before-b'})
                    self.assertFalse(any(event[1].startswith('after') for event in events))
                else:
                    self.assertNotIn('capacity', active, 'Ordinary work cannot overlap the exclusive worker')
                active.add(name); events.append(('start',name,len(active)))
                self.assertLessEqual(len(active), 2)
            if name != 'capacity': barriers[name.split('-')[0]].wait()
            with lock:
                active.remove(name); finished.add(name); events.append(('reaped',name,len(active)))
            if name in failures:
                return dict(id=name,status='failed',reason='worker timeout/error',log='retained failure',timed_out=True)
            return dict(id=name,status='passed',scenarios=1,assertions=1,log='',process_returncode=0)
        results = list(fast.scheduled_results(rows, None, None, None, 120, 'node', 2, runner))
        self.assertFalse(active)
        self.assertEqual(finished, {row['id'] for row in rows})
        self.assertEqual({r['id'] for r in results[:2]}, {'before-a','before-b'})
        self.assertEqual(results[2]['id'], 'capacity')
        self.assertEqual({r['id'] for r in results[3:]}, {'after-a','after-b'})
        self.assertEqual(results[2]['scheduling'], dict(mode='exclusive',reason='Declared large native fixture',requested_jobs=2,suite_worker_limit=1))
        self.assertTrue(all('scheduling' not in row for row in results if row['id'] != 'capacity'))
        return results, events

    def test_prior_workers_drain_exclusive_runs_alone_and_ordinary_parallelism_resumes(self):
        results, events = self.execute()
        self.assertTrue(all(result['status']=='passed' for result in results))
        self.assertIn(('start','capacity',1), events)
        self.assertTrue(any(event[0]=='start' and event[1].startswith('before') and event[2]==2 for event in events))
        self.assertTrue(any(event[0]=='start' and event[1].startswith('after') and event[2]==2 for event in events))

    def test_failed_prior_or_exclusive_workers_remain_failures_without_dropping_later_suites(self):
        for failures in [('before-a',), ('capacity',)]:
            results, _ = self.execute(failures)
            self.assertEqual([result['id'] for result in results if result['status']=='failed'], list(failures))
            self.assertEqual(len(results), 5)
            self.assertIn('retained failure', next(result['log'] for result in results if result['status']=='failed'))

    def test_capacity_only_selection_keeps_requested_jobs_but_invokes_exactly_one_worker(self):
        calls = []
        def runner(row, *args):
            calls.append(row['id']); self.assertEqual(args[3], 120)
            return dict(id=row['id'],status='failed',reason='no footer',log='partial',process_returncode=1)
        results = list(fast.scheduled_results([suite('capacity', True)], None,None,None,120,'node',2,runner))
        self.assertEqual(calls, ['capacity'])
        self.assertEqual(results[0]['status'], 'failed')
        self.assertEqual(results[0]['scheduling']['requested_jobs'], 2)
        self.assertEqual(results[0]['scheduling']['suite_worker_limit'], 1)


if __name__ == '__main__':
    unittest.main()
