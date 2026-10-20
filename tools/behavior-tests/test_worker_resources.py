"""Independent land-worker evidence integrity and bounded fixture contracts."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import struct
import unittest
from unittest.mock import patch

import compare
from protocol import ProtocolError
from economy.generate_worker_resources import suite
from economy.worker_resources_contract import ALGORITHM, validate_input, validate_output
from economy.worker_resources_original import fixture
from economy import worker_resources_headless


class WorkerResourceTests(unittest.TestCase):
    def test_generator_and_immutable_independent_original_evidence(self):
        directory = Path(__file__).parent / 'economy'
        cases = compare.read_json(directory / 'cases/land-worker-resources.json')
        self.assertEqual(suite(), cases)
        path = directory / 'observations/smacx-gog-2.0-land-worker-resources.json'
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),
                         'cc5fb5ef8504865cef6271f0959d74956d841d9125df3671c23669f2f2acec3c')
        observations = compare.read_json(path)
        compare.validate_observations(observations, cases)
        self.assertEqual(observations['repeat'], 2)
        self.assertEqual(len(observations['observations']), 576)
        for case, row in zip(cases['cases'], observations['observations']):
            validate_input(case['input']); validate_output(row['output'])

    def test_outside_contract_values_and_extra_fields_cannot_be_replayed(self):
        data = suite()['cases'][0]['input']
        variants = [dict(data, rainfall=True), dict(data, rockiness=3), dict(data, cap_tech_owned=1),
                    dict(data, faction_id=0), dict(data, x=2), dict(data, improvement='solar'),
                    dict(data, profile='unknown'), dict(data, answer=2), dict(data, improvement=[])]
        missing = dict(data); del missing['x']
        for value in variants + [missing, None]:
            with self.subTest(value=value), self.assertRaises(ProtocolError):
                validate_input(value)
        for output in ({'NUTRIENTS': True, 'MINERALS': 1, 'ENERGY': 0}, {'NUTRIENTS': 1},
                       {'NUTRIENTS': -1, 'MINERALS': 0, 'ENERGY': 0}):
            with self.assertRaises(ProtocolError): validate_output(output)

    def test_original_fixture_queries_a_worker_square_and_declares_cap_ownership(self):
        for case in suite()['cases']:
            data = case['input']; fields = dict(fixture(data))
            tile = (data['y'] * 2 + data['x'] // 2) * 44
            self.assertFalse(struct.unpack_from('<I', fields[0x009F0000], tile + 8)[0] & 1,
                             'The requested square must not accidentally exercise the base-center shortcut')
            self.assertNotEqual(struct.unpack_from('<hh', fields[0x0097D040]), (data['x'], data['y']))
            self.assertEqual(fields[0x009A6670][0], (1 << data['faction_id']) if data['cap_tech_owned'] else 0)
            self.assertEqual(struct.unpack('<iii', fields[0x00949784]), (0, 0, 0))

    def test_worker_adapter_selects_its_own_contract_and_template(self):
        request = {'cases': [suite()['cases'][0]]}
        saved = deepcopy(request)
        with patch.object(worker_resources_headless, 'load_request', return_value=request), \
                patch.object(worker_resources_headless.headless, 'replay', return_value=({}, [])) as replay, \
                patch.object(worker_resources_headless, 'write_response'), patch('sys.argv', ['worker']):
            worker_resources_headless.main()
        self.assertEqual(replay.call_args.kwargs['algorithm'], ALGORITHM)
        self.assertIs(replay.call_args.kwargs['input_validator'], validate_input)
        self.assertEqual(replay.call_args.kwargs['template_path'].name, '_worker_resources.gls.js')
        self.assertEqual(request, saved)


if __name__ == '__main__':
    unittest.main()
