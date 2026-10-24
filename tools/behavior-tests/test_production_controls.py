"""Frozen original production phases, isolated inputs and complete roster contexts."""
from pathlib import Path
from copy import deepcopy
import json
import unittest
import compare
from protocol import ProtocolError
from ui.production_controls_contract import validate_input,validate_output
PHASES=('first_city_before_panels','ready_before_panels','after_operations','after_panel','after_social')

class ProductionControlTests(unittest.TestCase):
    def datasets(self):
        root=Path(__file__).parent/'ui'
        return root,[(name,compare.read_json(root/f'cases/initial-production-controls-{name}.json'),compare.read_json(root/f'observations/initial-production-controls-{name}.json')) for name in ('core','source')]

    def test_two_fresh_complete_original_runs_per_case(self):
        _,datasets=self.datasets()
        for _,suite,record in datasets:
            compare.validate_observations(record,suite);self.assertEqual(record['repeat'],2);self.assertEqual(len(suite['cases']),4)
            self.assertEqual(record['reference']['kind'],'original-executable')
            self.assertEqual(record['reference']['executable_sha256'],'01901cbf7196b0c5d0df9540a029520f5df8fd9a6b343deef8b5663872805fcf')
            for c,r in zip(suite['cases'],record['observations']):validate_input(c['input']);validate_output(r['output'])

    def test_only_declared_source_files_differ_from_stock(self):
        _,datasets=self.datasets()
        expected={'gaian-physics':{'gaians.txt'},'gaian-formers-cost-4':{'alphax.txt'},'gaian-formers-cost-8':{'alphax.txt'},'gaian-mineral-rule-12':{'alphax.txt'},'gaian-industry-minus-1':{'gaians.txt'}}
        for _,_,record in datasets:
            profiles=record['reference']['source_profiles_sha256'];stock=profiles['stock']
            for name,changed in expected.items():self.assertEqual({k for k in stock if stock[k]!=profiles[name][k]},changed)

    def test_first_observed_stock_precedes_panels_and_remains_unchanged(self):
        _,datasets=self.datasets()
        for _,_,record in datasets:
            for r in record['observations']:
                d=r['output'];first=d[PHASES[0]]
                for phase in PHASES:
                    n=d[phase];self.assertEqual((n['turn'],n['map_kind'],n['map_area_sqrt']),(1,0,40))
                    for field in ('raw_mineral_field','current_project_id','queue_size','industry_rating','mineral_rule_factor','city','owned_ids'):self.assertEqual(n[field],first[field])
                self.assertEqual(d['operations']['pair'][0],first['raw_mineral_field'])
                self.assertEqual(d['operations']['project'],d['panel']['project']);self.assertEqual(d['operations']['turns'],d['panel']['turns'])
                self.assertEqual(d['social_after']['industry'],first['industry_rating'])
                self.assertEqual(d['panel']['allocation'],dict(economy=50,psych=0,labs=50));self.assertEqual(d['panel']['labs_income'],1)

    def test_strict_projection_keeps_every_complete_context_separately(self):
        root,datasets=self.datasets()
        for name,_,record in datasets:
            expected={r['id']:r['output'] for r in record['observations']}
            for run in ('run-a','run-b'):
                full=compare.read_json(root/f'reference-archives/initial-production-controls-v2/{name}-{run}.json')
                for r in full['observations']:
                    d=json.loads(json.dumps(r['output']))
                    for phase in PHASES:
                        units=d[phase].pop('units');self.assertGreaterEqual(len(units),1)
                        self.assertTrue(all(set(u)=={'prototype_id','order_code','movement_spent','damage'} for u in units))
                    self.assertEqual(d,expected[r['id']])

    def test_unrecorded_profiles_are_outside_scope(self):
        base=dict(faction='GAIANS',difficulty='CITIZEN',text_profile='stock',world_width=40,world_height=80,map_route='load-map',research='directed',target_id=5)
        for change in (dict(difficulty='TRANSCEND'),dict(text_profile='gaian-formers-cost-3'),dict(world_width=80),dict(faction='HIVE',text_profile='gaian-physics')):
            with self.assertRaises(ProtocolError):validate_input(dict(base,**change))

    def valid_output(self):
        _, datasets = self.datasets()
        return deepcopy(datasets[0][2]['observations'][0]['output'])

    def output_object_paths(self):
        return [(), ('operations',), ('panel',), ('panel', 'allocation'), ('social_after',)] + [
            path for phase in PHASES for path in ((phase,), (phase, 'city'))]

    def replace_output_value(self, output, path, value):
        if not path:
            return value
        container = output
        for key in path[:-1]:
            container = container[key]
        container[path[-1]] = value
        return output

    def test_every_output_object_rejects_wrong_container_types(self):
        for path in self.output_object_paths():
            for value in (None, True, 1, 'not an object', [], [{}]):
                with self.subTest(path=path, value=value), self.assertRaises(ProtocolError):
                    validate_output(self.replace_output_value(self.valid_output(), path, value))

    def test_every_output_object_requires_all_and_only_its_declared_keys(self):
        valid = self.valid_output()
        for path in self.output_object_paths():
            container = valid
            for key in path:
                container = container[key]
            for missing in container:
                value = dict(container)
                del value[missing]
                with self.subTest(path=path, missing=missing), self.assertRaises(ProtocolError):
                    validate_output(self.replace_output_value(deepcopy(valid), path, value))
            with self.subTest(path=path, extra=True), self.assertRaises(ProtocolError):
                validate_output(self.replace_output_value(deepcopy(valid), path, dict(container, unexpected=0)))

    def test_every_numeric_output_field_rejects_bool_float_and_string(self):
        valid = self.valid_output()
        paths = []
        for phase in PHASES:
            paths.extend((phase, key) for key in valid[phase] if key not in ('city', 'owned_ids'))
            paths.extend((phase, 'city', key) for key in valid[phase]['city'])
        paths.extend(('panel', key) for key in valid['panel'] if key not in ('allocation', 'project'))
        paths.extend(('panel', 'allocation', key) for key in valid['panel']['allocation'])
        paths.extend([('operations', 'turns'), ('social_after', 'industry')])
        for path in paths:
            for value in (True, 1.0, '1', None):
                with self.subTest(path=path, value=value), self.assertRaises(ProtocolError):
                    validate_output(self.replace_output_value(deepcopy(valid), path, value))

    def test_owned_ids_and_production_pair_require_integer_arrays(self):
        for phase in PHASES:
            for value in (None, True, 6, '6', (6,), {'id': 6}, [True], [6.0], ['6'], [{}]):
                with self.subTest(phase=phase, value=value), self.assertRaises(ProtocolError):
                    validate_output(self.replace_output_value(self.valid_output(), (phase, 'owned_ids'), value))
        for value in (None, True, 9, '91', (9, 16), {'first': 9}, [], [9], [9, 16, 7],
                      [True, 16], [9, False], ['9', 16], [9, 16.0], [9, {}]):
            with self.subTest(pair=value), self.assertRaises(ProtocolError):
                validate_output(self.replace_output_value(self.valid_output(), ('operations', 'pair'), value))

    def test_project_names_require_nonempty_strings(self):
        for section in ('operations', 'panel'):
            for value in (None, True, 1, 1.0, [], {}, ''):
                with self.subTest(section=section, value=value), self.assertRaises(ProtocolError):
                    validate_output(self.replace_output_value(self.valid_output(), (section, 'project'), value))

    def test_projection_rejects_malformed_nested_data_before_unpacking_it(self):
        from ui.production_controls_native import project_reference
        for path, value in [
            ((PHASES[0], 'city'), 'city'), ((PHASES[0], 'city'), ['city']),
            ((PHASES[0], 'owned_ids'), ['6']), (('operations', 'turns'), '7'),
            (('panel', 'project'), 42), (('panel', 'allocation'), '50/0/50'),
        ]:
            with self.subTest(path=path, value=value), self.assertRaises(ProtocolError):
                project_reference(self.replace_output_value(self.valid_output(), path, value))

    def test_malformed_inputs_consistently_raise_protocol_error(self):
        _, datasets = self.datasets()
        valid = datasets[0][1]['cases'][0]['input']
        for value in (None, True, 1, 'input', [], [{}]):
            with self.subTest(container=value), self.assertRaises(ProtocolError):
                validate_input(value)
        for key, original in valid.items():
            missing = dict(valid)
            del missing[key]
            with self.subTest(missing=key), self.assertRaises(ProtocolError):
                validate_input(missing)
            values = (True, 1.0, '40', None, [], {}) if type(original) is int else (True, 1, None, [], {})
            for value in values:
                with self.subTest(field=key, value=value), self.assertRaises(ProtocolError):
                    validate_input(dict(valid, **{key: value}))
        with self.assertRaises(ProtocolError):
            validate_input(dict(valid, unexpected=0))
