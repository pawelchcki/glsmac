"""Ownership transfer retains exact original evidence and real native replay."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import compare
from protocol import ProtocolError
from ui import world_base_ownership_contract as contract
from ui import world_base_ownership_headless as candidate

DIRECTORY = Path(__file__).resolve().parent / 'ui'


def case():
    return json.loads((DIRECTORY / 'cases/world-base-ownership.json').read_text())['cases'][0]


def markers():
    return ('WORLD_CASE|' + case()['id'] + '\nWORLD_PLAYER|0|human\n'
            'WORLD_PLAYER|2|computer\nWORLD_PLAYER|3|computer\n'
            'WORLD_BASE|7|0\nWORLD_BASE|9|2\nWORLD_BASE|11|2\nWORLD_BASE|12|3\n'
            'WORLD_END\nAll tests passed.\n')


class WorldBaseOwnershipTests(unittest.TestCase):
    def test_input_is_exact_and_rejects_answers_and_boolean_scalars(self):
        value = case()['input']
        contract.validate_input(value)
        invalid = [None, {}, dict(value, expected_owners=7), dict(value, world_width=80),
                   dict(value, world_height=80.0), dict(value, profile='other')]
        for field in value['initial_human_base']:
            changed = deepcopy(value)
            changed['initial_human_base'][field] = bool(changed['initial_human_base'][field])
            invalid.append(changed)
        for item in invalid:
            with self.subTest(item=item), self.assertRaises(ProtocolError):
                contract.validate_input(item)

    def test_parser_groups_actual_membership_without_expected_owner_counts(self):
        row = contract.parse_candidate(markers(), case())
        self.assertEqual(row['output'], {'human_factions': 1, 'human_bases': 1,
                         'owners_with_bases': 3, 'total_bases': 4, 'other_owner_base_counts': [1, 2]})
        single = ('WORLD_CASE|' + case()['id'] + '\nWORLD_PLAYER|0|human\nWORLD_BASE|31|0\n'
                  'WORLD_END\nAll tests passed.\n')
        self.assertEqual(contract.parse_candidate(single, case())['output']['other_owner_base_counts'], [])

    def test_parser_rejects_incomplete_ambiguous_and_failed_startup(self):
        text = markers()
        invalid = [text.replace('WORLD_END\n', ''), text.replace('All tests passed.', ''),
                   text + 'WORLD_END\n', text + 'TEST FAILED', text + 'Event rejected: invalid',
                   text + 'Event result listener failed: invalid', text.replace('|9|2', '|9|99'),
                   text.replace('WORLD_BASE|9|2', 'WORLD_BASE|7|2'), text.replace('|0|human', '|00|human'),
                   text.replace('|2|computer', '|0|computer'), text.replace('|3|computer', '|3|unknown'),
                   text.replace('WORLD_END', 'WORLD_UNKNOWN'), text.replace(case()['id'], 'unknown')]
        for item in invalid:
            with self.subTest(item=item), self.assertRaises(ProtocolError):
                contract.parse_candidate(item, case())

    def test_output_rejects_count_inconsistency_and_silently_coerced_values(self):
        value = contract.parse_candidate(markers(), case())['output']
        invalid = [dict(value, total_bases=5), dict(value, owners_with_bases=8),
                   dict(value, human_bases=0), dict(value, human_factions=True),
                   dict(value, other_owner_base_counts=[2, 1]), dict(value, other_owner_base_counts=[0, 3]),
                   dict(value, expected_owners=7)]
        for item in invalid:
            with self.subTest(item=item), self.assertRaises(ProtocolError):
                contract.validate_output(item)

    def test_adapter_executes_inputs_only_and_rejects_changed_runtime(self):
        with tempfile.TemporaryDirectory() as temporary:
            runtime = Path(temporary) / 'GLSMAC.js'
            runtime.write_text('synthetic candidate loader')
            runtime.with_suffix('.wasm').write_text('synthetic candidate runtime')
            requests = []

            def execute(argv, **kwargs):
                request = json.loads(kwargs['input'])
                snapshot = json.loads(Path(request['snapshot']).read_text())
                source = snapshot[request['script']]
                self.assertIn('const world_input = ', source)
                self.assertNotIn('other_owner_base_counts', source)
                self.assertEqual(argv[0], '/declared/node')
                requests.append(request)
                return SimpleNamespace(returncode=0, stdout=markers(), stderr='')

            with patch.object(candidate, 'create_snapshot', return_value={}), patch.object(candidate.subprocess, 'run', side_effect=execute):
                metadata, rows = candidate.headless([case()], runtime, '/declared/node')
            self.assertEqual(len(requests), 1)
            self.assertEqual(rows[0]['output']['owners_with_bases'], 3)
            self.assertEqual(metadata['runtime_sha256'], hashlib.sha256(runtime.with_suffix('.wasm').read_bytes()).hexdigest())

            def mutate(argv, **kwargs):
                runtime.write_text('changed while executing')
                return execute(argv, **kwargs)

            with patch.object(candidate, 'create_snapshot', return_value={}), patch.object(candidate.subprocess, 'run', side_effect=mutate):
                with self.assertRaisesRegex(ProtocolError, 'runtime changed'):
                    candidate.headless([case()], runtime, '/declared/node')

    def test_unknown_algorithm_is_unsupported_without_opening_runtime(self):
        unknown = dict(case(), algorithm='unknown.v1')
        with patch('sys.argv', ['world_base_ownership_headless.py']), \
                patch.object(candidate, 'load_request', return_value={'cases': [unknown]}), \
                patch.object(candidate, 'headless') as execute, patch.object(candidate, 'write_response') as write:
            candidate.main()
        execute.assert_not_called()
        self.assertEqual(write.call_args.args[1][0]['status'], 'unsupported')

    def test_main_uses_lane_runtime_override_and_explicit_runtime_takes_precedence(self):
        for arguments, expected in [([], Path('/selected/headless/GLSMAC.js')),
                                    (['--runtime', '/explicit/GLSMAC.js'], Path('/explicit/GLSMAC.js'))]:
            with self.subTest(arguments=arguments), \
                    patch.dict(candidate.os.environ, {'WASM_HEADLESS_APP_DIR': '/selected/headless',
                                                      'WASM_APP_DIR': '/unrelated/browser'}), \
                    patch('sys.argv', ['world_base_ownership_headless.py', *arguments]), \
                    patch.object(candidate, 'load_request', return_value={'cases': [case()]}), \
                    patch.object(candidate, 'headless', return_value=({}, [{'id': case()['id']}])) as execute, \
                    patch.object(candidate, 'write_response'):
                candidate.main()
                self.assertEqual(execute.call_args.args[1], expected)

    def test_frozen_repeated_evidence_is_catalogued_without_changing_gold(self):
        path = DIRECTORY / 'observations/smacx-gog-2.0-world-base-ownership.json'
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),
                         '71a75678cc7288fc9b90c8653864e154357e6fea600c125352bab97152b72436')
        suite = json.loads((DIRECTORY / 'cases/world-base-ownership.json').read_text())
        evidence = json.loads(path.read_text())
        compare.validate_observations(evidence, suite)
        pending = json.loads((DIRECTORY / 'pending-catalog.json').read_text())['references']
        passing = json.loads((DIRECTORY / 'catalog.json').read_text())['references']
        self.assertNotIn('world-base-ownership', {row['id'] for row in pending})
        self.assertIn('world-base-ownership', {row['id'] for row in passing})
        self.assertNotEqual(contract.parse_candidate(markers(), case())['output'], evidence['observations'][0]['output'])


if __name__ == '__main__':
    unittest.main()
