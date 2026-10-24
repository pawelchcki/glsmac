"""Harness scheduling tests; synthetic candidate replies are not game evidence."""

from contextlib import redirect_stdout
from copy import deepcopy
import hashlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import audit
import compare
from protocol import ProtocolError, fingerprint
from ui import run, shards


class UiShardTests(unittest.TestCase):
    def test_every_catalog_case_is_partitioned_once_including_small_suites(self):
        for count in (1, 2, 4, 16):
            for reference in audit.load_references(shards.DIRECTORY / 'catalog.json'):
                suite = compare.read_json(shards.DIRECTORY / reference['cases'])
                parts = [shards.select_cases(suite, f'{index}/{count}') for index in range(1, count + 1)]
                flat = [case for part in parts for case in part]
                self.assertCountEqual(flat, [case['id'] for case in suite['cases']])
                self.assertEqual(len(flat), len(set(flat)))
                self.assertLessEqual(max(map(len, parts)) - min(map(len, parts)), 1)

    def test_invalid_partition_or_unsupported_mode_starts_no_candidate(self):
        for value in ('0/4', '5/4', '1/0', '1/17', '01/4', '1', 'true', None):
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                shards.parse_shard(value)
        for option in ('--record', '--browser', '--render-smoke', '--pending', '--validate-only', '--list'):
            with self.subTest(option=option), patch.object(compare, 'run_probe') as probe:
                with self.assertRaises(ProtocolError):
                    run.main(['--shard', '1/4', option])
                probe.assert_not_called()

    def replies(self, request, runtime_hash):
        # Feed recorded outputs into a deliberately synthetic candidate solely
        # to exercise the dispatcher/comparator/aggregation protocol.
        by_id = {}
        for reference in audit.load_references(shards.DIRECTORY / 'catalog.json'):
            evidence = compare.read_json(shards.DIRECTORY / reference['observations'])
            by_id.update({row['id']: row['output'] for row in evidence['observations']})
        return dict(version=1, implementation=dict(name='synthetic-harness-fixture', kind='candidate',
                                        rendering=False, runtime_sha256=runtime_hash),
                    results=[dict(id=case['id'], status='ok', output=by_id[case['id']]) for case in request['cases']])

    def reports(self, directory, *, count=4, lane='hot'):
        runtime = directory / 'GLSMAC.js'
        runtime.write_text('// synthetic harness runtime')
        runtime.with_suffix('.wasm').write_bytes(b'synthetic harness bytes')
        runtime_hash = hashlib.sha256(runtime.with_suffix('.wasm').read_bytes()).hexdigest()
        reports = []
        for index in range(1, count + 1):
            path = directory / f'ui-{index}.json'
            with patch.object(compare, 'run_probe', side_effect=lambda command, request, timeout:
                              self.replies(request, runtime_hash)), redirect_stdout(io.StringIO()):
                self.assertEqual(run.main(['--lane', lane, '--shard', f'{index}/{count}', '--report', str(path)]), 0)
            reports.append(compare.read_json(path))
        return runtime, reports

    def test_complete_replay_reports_aggregate_all_cases_and_require_all_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            runtime, reports = self.reports(directory)
            report = shards.aggregate(reports, 'hot', runtime)
            self.assertEqual(report['summary'], dict(reference_cases=44, candidate_executed=True,
                                                   matched=44, mismatched=0, unsupported=0, errors=0))
            self.assertEqual(report['source_snapshot_sha256'], fingerprint(shards.create_snapshot()))
            output = directory / 'aggregate.json'
            with redirect_stdout(io.StringIO()):
                self.assertEqual(shards.main(['--reports', str(directory), '--count', '4', '--lane', 'hot',
                                             '--runtime', str(runtime), '--report', str(output)]), 0)
            (directory / 'ui-4.json').unlink()
            with self.assertRaises(ProtocolError):
                shards.main(['--reports', str(directory), '--count', '4', '--lane', 'hot',
                             '--runtime', str(runtime), '--report', str(output)])

    def test_empty_partitions_are_metadata_only_and_full_union_still_required(self):
        with tempfile.TemporaryDirectory() as temporary:
            runtime, reports = self.reports(Path(temporary), count=16)
            self.assertTrue(any(not report['results'] for report in reports))
            self.assertEqual(shards.aggregate(reports, 'hot', runtime)['summary']['matched'], 44)

    def test_stable_synthetic_reports_cover_the_full_complement_including_rotated_controls(self):
        # Transport/partition coverage only: replies above deliberately reuse
        # recorded outputs and do not execute a game candidate.
        with tempfile.TemporaryDirectory() as temporary:
            runtime, reports = self.reports(Path(temporary), lane='stable')
            report = shards.aggregate(reports, 'stable', runtime)
            self.assertEqual(report['summary'], dict(reference_cases=711, candidate_executed=True,
                                                   matched=711, mismatched=0, unsupported=0, errors=0))
            identifiers = {row['id'] for part in reports for row in part['results']}
            self.assertTrue({'terraform-menu-work', 'colony-menu-join', 'terraform-menu-presentation',
                             'colony-found-menu', 'colony-adjacent-warning'} <= identifiers)
            with self.assertRaises(ProtocolError):
                shards.aggregate(reports, 'hot', runtime)

    def test_missing_duplicate_failed_unexecuted_and_stale_replay_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            runtime, reports = self.reports(Path(temporary))
            corruptions = [lambda rows: rows.pop(),
                           lambda rows: rows.__setitem__(1, deepcopy(rows[0])),
                           lambda rows: rows[0]['results'].pop(),
                           lambda rows: rows[0].update(kind='original-ui-evidence-validation'),
                           lambda rows: rows[0].update(pending_transfer=True),
                           lambda rows: rows[0].update(source_snapshot_sha256='0' * 64),
                           lambda rows: rows[0]['summary'].update(matched=999)]
            for field, value in [('candidate_executed', False), ('cases', 999),
                                 ('selected_case_ids', ['wrong-case']), ('source_suite_sha256', '0' * 64)]:
                corruptions.append(lambda rows, field=field, value=value: rows[0]['results'][0].update({field: value}))
            corruptions += [lambda rows: rows[0]['results'][0]['comparison']['results'].pop(),
                            lambda rows: rows[0]['results'][0]['comparison']['results'][0].update(status='mismatched'),
                            lambda rows: rows[0]['results'][0]['comparison']['candidate'].update(runtime_sha256='0' * 64),
                            lambda rows: rows[0]['results'][0]['comparison']['summary'].update(errors=1)]
            for index, corrupt in enumerate(corruptions):
                changed = deepcopy(reports)
                corrupt(changed)
                with self.subTest(corruption=index), self.assertRaises(ProtocolError):
                    shards.aggregate(changed, 'hot', runtime)

    def test_case_failure_survives_sharded_dispatch(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'ui.json'
            def failure(command, request, timeout):
                response = self.replies(request, '0' * 64)
                response['results'][0] = dict(id=request['cases'][0]['id'], status='error', reason='synthetic failure')
                return response
            with patch.object(compare, 'run_probe', side_effect=failure), redirect_stdout(io.StringIO()):
                self.assertEqual(run.main(['--lane', 'hot', '--shard', '1/4', '--report', str(path)]), 2)
            self.assertGreater(compare.read_json(path)['summary']['errors'], 0)


if __name__ == '__main__':
    unittest.main()
