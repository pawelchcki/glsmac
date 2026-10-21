"""Synthetic integrity fixtures only; these are never original-game evidence."""
from copy import deepcopy
from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest

from combine_observations import combine, main
from compare import select_cases, validate_observations
from protocol import ProtocolError, fingerprint, probe_request
from test_compare import record, suite


def parts():
    return [select_cases(suite(), record(), [identifier]) for identifier in ('synthetic-a', 'synthetic-b')]


class PartitionTests(unittest.TestCase):
    def test_complete_records_preserve_every_answer_and_input_binding(self):
        partitioned = parts()
        before = deepcopy(partitioned)
        result = combine(suite(), list(reversed(partitioned)))
        self.assertEqual(result['observations'], record()['observations'])
        self.assertEqual(result['repeat'], 2)
        self.assertEqual(partitioned, before)
        self.assertEqual(validate_observations(result, suite()), {'synthetic-a': {'value': 4}, 'synthetic-b': {'value': 8}})
        for item, (_, original) in zip(result['reference']['recording_partitions'], reversed(partitioned)):
            self.assertEqual(item['record_sha256'], fingerprint(original))
            self.assertEqual(item['captured_at'], original['captured_at'])
            self.assertEqual(item['repeat'], 2)
            self.assertEqual(item['cases'], 1)
        metadata = dict(result['reference'])
        metadata.pop('recording_partitions')
        self.assertEqual(metadata, record()['reference'])

    def test_missing_or_overlapping_partitions_fail(self):
        for values in ([], parts()[:1], [parts()[0], parts()[0]]):
            with self.subTest(values=values), self.assertRaises(ProtocolError):
                combine(suite(), values)
        larger = suite()
        larger['cases'].append(dict(id='synthetic-c', algorithm='synthetic.v1', input={'value': 11}))
        with self.assertRaisesRegex(ProtocolError, 'Incomplete'):
            combine(larger, parts())

    def test_changed_or_unknown_inputs_fail_even_with_valid_partition_records(self):
        for change in ('value', 'id'):
            values = parts()
            selected, evidence = values[1]
            if change == 'value':
                selected['cases'][0]['input']['value'] = 999
            else:
                selected['cases'][0]['id'] = 'foreign-input'
                evidence['observations'][0]['id'] = 'foreign-input'
            evidence['suite_sha256'] = fingerprint(probe_request(selected))
            evidence['observations'][0]['case_sha256'] = fingerprint(selected['cases'][0])
            validate_observations(evidence, selected)
            with self.subTest(change=change), self.assertRaisesRegex(ProtocolError, 'differs'):
                combine(suite(), values)

    def test_partial_or_changed_reference_evidence_cannot_be_laundered(self):
        for change in ('repeat', 'metadata', 'missing', 'binding', 'candidate'):
            values = parts()
            selected, evidence = values[1]
            if change == 'repeat': evidence['repeat'] = 3
            if change == 'metadata': evidence['reference']['adapter_version'] = 2
            if change == 'missing': evidence['observations'] = []
            if change == 'binding': evidence['observations'][0]['case_sha256'] = '0' * 64
            if change == 'candidate': evidence['reference']['kind'] = 'candidate'
            with self.subTest(change=change), self.assertRaises(ProtocolError):
                combine(suite(), values)

    def test_recorded_context_partitions_preserve_complete_immutable_gold(self):
        root = Path(__file__).resolve().parent
        archive = root/'ui/reference-archives/unit-menu-context-saved-v26'
        import hashlib
        manifest = json.loads((archive/'manifest.json').read_text())
        for name, digest in manifest['files'].items():
            self.assertEqual(hashlib.sha256((archive/name).read_bytes()).hexdigest(), digest, name)
        full_suite = json.loads((root/'ui/cases/unit-menu-context.json').read_text())
        full_record = json.loads((root/'ui/observations/smacx-gog-2.0-unit-menu-context.json').read_text())
        captured = []
        for role in ('former', 'colony'):
            captured.append(tuple(json.loads((archive/'recordings'/f'{role}-{kind}.json').read_text())
                                  for kind in ('cases', 'observations')))
        rebuilt = combine(full_suite, captured)
        self.assertEqual(rebuilt['observations'], full_record['observations'])
        self.assertEqual(rebuilt['reference'], full_record['reference'])
        self.assertEqual(rebuilt['repeat'], full_record['repeat'])
        self.assertEqual(len(rebuilt['observations']), 12)
        self.assertEqual(sum(len(row['output']['trace']) for row in rebuilt['observations']), 78)

    def test_cli_validates_before_writing_and_refuses_to_replace_existing_gold(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root/'all.json').write_text(json.dumps(suite()))
            args = ['--cases', str(root/'all.json'), '--output', str(root/'gold.json')]
            for index, (selected, evidence) in enumerate(parts()):
                cases, gold = root/f'cases-{index}.json', root/f'gold-{index}.json'
                cases.write_text(json.dumps(selected)); gold.write_text(json.dumps(evidence))
                args += ['--part', str(cases), str(gold)]
            with redirect_stdout(io.StringIO()): self.assertEqual(main(args), 0)
            original = (root/'gold.json').read_bytes()
            with redirect_stderr(io.StringIO()): self.assertEqual(main(args), 2)
            self.assertEqual((root/'gold.json').read_bytes(), original)
            (root/'gold.json').unlink()
            partial = json.loads((root/'gold-1.json').read_text()); partial['observations'] = []
            (root/'gold-1.json').write_text(json.dumps(partial))
            with redirect_stderr(io.StringIO()): self.assertEqual(main(args), 2)
            self.assertFalse((root/'gold.json').exists())


if __name__ == '__main__':
    unittest.main()
