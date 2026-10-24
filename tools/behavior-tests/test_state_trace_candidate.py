"""Native exporter invariants, without original executables, assets or answers."""
import copy
import json
import math
import os
from pathlib import Path
import unittest

from protocol import ProtocolError
from state_trace.candidate import ROOT, Unsupported, gse_literal, parse_candidate, prepare, replay_case
from state_trace.schema import ALGORITHM


def scenario(kind='exporter-invariants', actions=None, width=4, height=4):
    fixture = dict(kind=kind, rng_state='1:2:3:4')
    if kind == 'natural-startup':
        fixture.update(width=width, height=height, terrain='flat-arid', faction='GAIANS', difficulty='Citizen')
    return dict(id='native-exporter', algorithm=ALGORITHM, input=dict(fixture=fixture,
        actions=actions or [dict(id='observed', kind='snapshot')]))


EXPLICIT_SUITE = ROOT / 'tools/behavior-tests/state_trace/cases/explicit-seven-world-v2.json'


def explicit_case(index=0):
    with open(EXPLICIT_SUITE, encoding='utf-8') as handle:
        suite = json.load(handle)
    return copy.deepcopy(suite['cases'][index])


class CandidateContractTests(unittest.TestCase):
    def test_unknown_actions_and_native_seed_not_silently_ignored(self):
        case = scenario(); case['input']['actions'][0]['kind'] = 'invent-a-turn'
        with self.assertRaisesRegex(Unsupported, 'action'):
            prepare(case)
        case = scenario(); case['input']['fixture']['seed'] = 1
        with self.assertRaises(Unsupported):
            prepare(case)

    def test_invalid_control_types_and_reserved_initial(self):
        for field, value in [('terrain', []), ('faction', {}), ('difficulty', True), ('width', True), ('rng_state', '1:2:3:4294967296')]:
            case = scenario('natural-startup'); case['input']['fixture'][field] = value
            with self.subTest(field=field), self.assertRaises((ProtocolError, Unsupported)):
                prepare(case)
        case = scenario(); case['input']['actions'][0]['id'] = 'initial'
        with self.assertRaises(ProtocolError):
            prepare(case)

    def test_reference_control_is_declared_independent_of_native_rng(self):
        case = scenario('natural-startup'); case['input']['fixture']['reference_rng_seed'] = 12345
        self.assertEqual(prepare(case)['fixture']['rng_state'], '1:2:3:4')
        self.assertEqual(prepare(case)['fixture']['reference_rng_seed'], 12345)

    def test_full_profile_requires_initialized_installed_source_world(self):
        case = scenario('natural-startup'); case['input']['fixture']['profile'] = 'economy-research-v1'
        with self.assertRaisesRegex(Unsupported, '--assets'):
            prepare(case)
        self.assertEqual(prepare(case, has_installed_sources=True)['fixture']['profile'], 'economy-research-v1')

    def test_escaping_and_signed_integer_limits(self):
        self.assertEqual(gse_literal("a'b\\c\n"), "'a\\'b\\\\c\\n'")
        self.assertEqual(gse_literal(-2), '(0 - 2)')
        with self.assertRaises(ProtocolError):
            gse_literal(2**63)
        with self.assertRaises(ProtocolError):
            gse_literal({'bad-key': 1})

    def test_partial_or_failed_worker_cannot_pass(self):
        log = 'BEHAVIOR_SUMMARY 1 1\nAll tests passed.\nTRACE_CHECK|observed|observed|1|4|4\nTRACE_PLAYER|p|GAIANS|0\nTRACE_END\n'
        with self.assertRaisesRegex(ProtocolError, 'completion'):
            parse_candidate(log, scenario())
        with self.assertRaises(ProtocolError):
            parse_candidate(log + 'TRACE_COMPLETE\nTRACE_COMPLETE\n', scenario())
        with self.assertRaises(ProtocolError):
            parse_candidate(log + 'TRACE_COMPLETE\nTEST FAILED\n', scenario())


def explicit_trace(second_units, drop_detail=False, turn=1, check_id='held'):
    """Two-checkpoint explicit trace text over a frozen two-action plan."""
    lines = ['BEHAVIOR_SUMMARY 1 3', 'All tests passed.',
        'TRACE_CONFIG|blind_research|true',
        'TRACE_CHECK|initial|before|' + str(turn) + '|40|80',
        'TRACE_PLAYER|player:1|GAIANS|0',
        'TRACE_PLAYER|player:2|HIVE|1',
        'TRACE_UNIT|scout-p1|player:1|6|12|scout-patrol|10|1.0|NO_ORDERS',
        'TRACE_UNIT|scout-p2|player:2|22|12|scout-patrol|11|1.0|NO_ORDERS',
        'TRACE_UNITDETAIL|scout-p1|1.0|2',
        'TRACE_UNITDETAIL|scout-p2|1.0|2',
        'TRACE_BASE|base-p1|player:1|6|12|1|20',
        'TRACE_BASE|base-p2|player:2|22|12|1|21',
        'TRACE_BASEECONOMY|base-p1|3|colony-pod|0|1|0',
        'TRACE_BASEECONOMY|base-p2|3|colony-pod|0|1|0',
        'TRACE_RESEARCH|player:1|-1|0|6',
        'TRACE_RESEARCH|player:2|-1|0|6',
        'TRACE_END',
        'TRACE_CHECK|' + check_id + '|' + check_id + '|1|40|80',
        'TRACE_PLAYER|player:1|GAIANS|0',
        'TRACE_PLAYER|player:2|HIVE|1']
    for unit in second_units:
        lines.append('TRACE_UNIT|' + unit)
    if not drop_detail:
        lines.append('TRACE_UNITDETAIL|scout-p1|1.0|2')
        if any('scout-p2' in unit for unit in second_units):
            lines.append('TRACE_UNITDETAIL|scout-p2|1.0|2')
    lines.extend(['TRACE_BASE|base-p1|player:1|6|12|1|20',
        'TRACE_BASE|base-p2|player:2|22|12|1|21',
        'TRACE_BASEECONOMY|base-p1|3|colony-pod|0|1|0',
        'TRACE_BASEECONOMY|base-p2|3|colony-pod|0|1|0',
        'TRACE_RESEARCH|player:1|-1|0|6',
        'TRACE_RESEARCH|player:2|-1|0|6',
        'TRACE_END', 'TRACE_COMPLETE'])
    return '\n'.join(lines) + '\n'


class ExplicitWorldContractTests(unittest.TestCase):
    def test_frozen_cases_prepare_with_installed_sources(self):
        for index in range(3):
            case = explicit_case(index)
            prepared = prepare(case, has_installed_sources=True)
            self.assertEqual(prepared['fixture']['players'][0]['research']['owned_tech_ids'], [6])
            health = prepared['fixture']['units'][0]['health']
            self.assertIs(type(health), float)
            self.assertEqual(health, 1.0)
            self.assertEqual(gse_literal(prepared['fixture']['units'][0]['health']), '1.0')

    def test_explicit_world_requires_installed_sources(self):
        with self.assertRaisesRegex(Unsupported, '--assets'):
            prepare(explicit_case(0))

    def test_unsupported_initial_controls_are_rejected_not_ignored(self):
        mutations = []
        def mutate(path, value):
            case = explicit_case(0)
            target = case['input']['fixture']
            for key in path[:-1]:
                target = target[key]
            target[path[-1]] = value
            return case
        mutations.append(mutate(('players',), explicit_case(0)['input']['fixture']['players'][:6]))
        duplicate = explicit_case(0); duplicate['input']['fixture']['bases'][1]['id'] = 'base-p1'
        mutations.append(duplicate)
        for path, value in [(('bases', 1, 'resources'), {'minerals': 4}),
                (('bases', 0, 'project'), 'formers'),
                (('bases', 0, 'facilities'), []),
                (('bases', 0, 'jobs'), {'workers': 1, 'doctors': 0}),
                (('bases', 0, 'raw_nutrients'), 2),
                (('bases', 0, 'population'), 2),
                (('units', 0, 'order'), 'hold'),
                (('units', 0, 'health'), 0.5),
                (('units', 0, 'health'), 1),
                (('units', 0, 'morale'), 'green'),
                (('units', 0, 'movement'), 'moved'),
                (('units', 0, 'home_base'), 'base-p1'),
                (('units', 0, 'prototype'), 'scout-rover'),
                (('players', 1, 'research'), {'owned_tech_ids': [7], 'target_id': -1, 'accumulated': 0}),
                (('players', 1, 'research'), {'owned_tech_ids': [6], 'target_id': 5, 'accumulated': 0}),
                (('players', 1, 'research'), {'owned_tech_ids': [6], 'target_id': -1, 'accumulated': 3}),
                (('players', 1, 'faction'), 'GAIAN'),
                (('players', 0, 'is_human'), False),
                (('calling_player',), 'player:2'),
                (('selected_unit',), 'scout-p2'),
                (('turn',), 2),
                (('rules',), 'advanced'),
                (('blind_research',), False),
                (('difficulty',), 'Impossible'),
                (('profile',), 'core-v1')]:
            mutations.append(mutate(path, value))
        off_center = explicit_case(0); off_center['input']['fixture']['units'][0]['x'] = 8
        mutations.append(off_center)
        overlap = explicit_case(0); overlap['input']['fixture']['bases'][1]['x'] = 6
        overlap['input']['fixture']['bases'][1]['y'] = 12
        mutations.append(overlap)
        unknown_unit = explicit_case(0); unknown_unit['input']['actions'][1]['args']['unit'] = 'scout-p8'
        mutations.append(unknown_unit)
        synthetic = explicit_case(0); synthetic['input']['actions'][1] = dict(id='moved', kind='fixture-move-unit', args=dict(unit='scout-p1', x=8, y=12))
        mutations.append(synthetic)
        extra = explicit_case(0); extra['input']['fixture']['weather'] = 'clear'
        mutations.append(extra)
        for index, case in enumerate(mutations):
            with self.subTest(mutation=index):
                with self.assertRaises((Unsupported, ProtocolError)):
                    prepare(case, has_installed_sources=True)

    def test_narrow_finite_float_encoding(self):
        self.assertEqual(gse_literal(1.0), '1.0')
        self.assertEqual(gse_literal(-2.5), '(0 - 2.5)')
        self.assertEqual(gse_literal(-0.0), '(0 - 0.0)')
        self.assertEqual(gse_literal(1), '1')
        self.assertEqual(gse_literal(True), 'true')
        for bad in (math.nan, math.inf, -math.inf, 1e300):
            with self.assertRaises(ProtocolError):
                gse_literal(bad)
        self.assertEqual(gse_literal({'health': 1.0, 'ids': [6]}), '{health:1.0,ids:[6]}')

    def test_explicit_parser_requires_orders_details_and_declared_stores(self):
        case = explicit_case(1)
        text = explicit_trace(['scout-p1|player:1|6|12|scout-patrol|10|0.0|HOLD',
            'scout-p2|player:2|22|12|scout-patrol|11|1.0|NO_ORDERS'])
        output = parse_candidate(text, case)
        initial, held = (point['state'] for point in output['checkpoints'])
        self.assertEqual([unit.get('order') for unit in initial['units']], ['none', 'none'])
        self.assertEqual([unit['order'] for unit in held['units']], ['hold', 'none'])
        foreign = next(unit for unit in held['units'] if unit['id'] == 'scout-p2')
        self.assertEqual((foreign['x'], foreign['y'], foreign['owner'], foreign['prototype']), (22, 12, 'player:2', 'scout-patrol'))
        base = next(row for row in initial['bases'] if row['id'] == 'base-p1')
        self.assertEqual((base['resources']['minerals'], base['project'], base['jobs']), (3, 'colony-pod', {'workers': 0, 'doctors': 1}))
        self.assertEqual(initial['research']['player:1'], {'owned_tech_ids': [6], 'target_id': -1, 'accumulated': 0})
        self.assertEqual(set(initial['research']), {'player:1', 'player:2'})
        human = next(row for row in output['diagnostics']['checkpoints'][0]['units'] if row['id'] == 'scout-p1')
        self.assertEqual((human['health_native'], human['morale_native'], human['order_native']), (1.0, 2, 'NO_ORDERS'))
        self.assertEqual(output['diagnostics']['native_configuration'], {'blind_research': True})
        self.assertEqual(parse_candidate(text, case), output)

    def test_explicit_unit_identities_persist_through_movement(self):
        case = explicit_case(0)
        text = explicit_trace(['scout-p1|player:1|8|12|scout-patrol|10|0.0|NO_ORDERS',
            'scout-p2|player:2|22|12|scout-patrol|11|1.0|NO_ORDERS'], check_id='moved-east')
        output = parse_candidate(text, case)
        initial, moved = (point['state'] for point in output['checkpoints'])
        self.assertEqual({unit['id'] for unit in moved['units']}, {unit['id'] for unit in initial['units']})
        self.assertEqual(next(unit for unit in moved['units'] if unit['id'] == 'scout-p1')['x'], 8)
        self.assertEqual(next(unit for unit in initial['units'] if unit['id'] == 'scout-p1')['x'], 6)

    def test_explicit_parser_manufactures_no_rows(self):
        case = explicit_case(1)
        text = explicit_trace(['scout-p1|player:1|6|12|scout-patrol|10|0.0|HOLD'])
        output = parse_candidate(text, case)
        self.assertEqual(len(output['checkpoints'][1]['state']['units']), 1)
        self.assertNotIn('scout-p2', {unit['id'] for unit in output['checkpoints'][1]['state']['units']})

    def test_explicit_parser_rejects_gaps_and_unverified_orders(self):
        case = explicit_case(1)
        held = ['scout-p1|player:1|6|12|scout-patrol|10|0.0|HOLD',
            'scout-p2|player:2|22|12|scout-patrol|11|1.0|NO_ORDERS']
        with self.assertRaisesRegex(ProtocolError, 'detail'):
            parse_candidate(explicit_trace(held, drop_detail=True), case)
        sentry = ['scout-p1|player:1|6|12|scout-patrol|10|0.0|SENTRY',
            'scout-p2|player:2|22|12|scout-patrol|11|1.0|NO_ORDERS']
        with self.assertRaises(Unsupported):
            parse_candidate(explicit_trace(sentry), case)
        no_config = explicit_trace(held).replace('TRACE_CONFIG|blind_research|true\n', '')
        with self.assertRaisesRegex(ProtocolError, 'native rules'):
            parse_candidate(no_config, case)
        wrong_turn = explicit_trace(held, turn=2)
        with self.assertRaisesRegex(ProtocolError, 'declared world'):
            parse_candidate(wrong_turn, case)
        natural = scenario()
        with self.assertRaises(ProtocolError):
            parse_candidate(explicit_trace(held), natural)


RUNTIME = Path(os.environ.get('STATE_TRACE_RUNTIME', str(Path(os.environ.get('WASM_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')))


@unittest.skipUnless(RUNTIME.exists() and RUNTIME.with_suffix('.wasm').exists(), 'WASM runtime not installed; native GSE catalog independently gates exporter')
class CandidateNativeTests(unittest.TestCase):
    def test_all_actual_owners_movement_removal_and_same_launch_checkpoints(self):
        logical = 'unit:native-player:0:scout-patrol:10:10:0'
        case = scenario(actions=[dict(id='before', kind='snapshot'),
            dict(id='moved', kind='fixture-move-unit', args=dict(unit=logical, x=12, y=10)),
            dict(id='removed', kind='fixture-remove-unit', args=dict(unit=logical))])
        metadata, output = replay_case(case, RUNTIME)
        self.assertEqual(metadata['launches'], 1)
        self.assertTrue(metadata['candidate_executed'])
        before, moved, removed = [point['state'] for point in output['checkpoints']]
        self.assertEqual(len(before['players']), 2)
        self.assertEqual(len(before['units']), 3)
        self.assertEqual(len(before['bases']), 2)
        self.assertEqual({unit['owner'] for unit in before['units']}, {player['id'] for player in before['players']})
        self.assertEqual(next(unit for unit in moved['units'] if unit['id'] == logical)['x'], 12)
        self.assertNotIn(logical, {unit['id'] for unit in removed['units']})
        self.assertEqual(len(removed['units']), 2)
        self.assertEqual(next(unit for unit in before['units'] if unit['id'] == logical)['x'], 10)
        self.assertEqual(len(metadata['runtime_wasm_sha256']), 64)
        self.assertEqual(len(metadata['native_source_sha256']), 64)

    def test_launched_native_failure_is_still_reported_as_executed(self):
        executions = []
        case = scenario('natural-startup', [dict(id='invalid-unit', kind='hold-unit', args=dict(unit='absent-unit'))])
        with self.assertRaises(ProtocolError):
            replay_case(case, RUNTIME, execution_log=executions)
        self.assertEqual(len(executions), 1)
        self.assertTrue(executions[0]['candidate_executed'])
        self.assertEqual(len(executions[0]['runtime_wasm_sha256']), 64)

    def test_real_natural_startup_settled_turns_repeat_under_same_native_rng(self):
        case = scenario('natural-startup', [dict(id='before', kind='snapshot'),
            dict(id='held', kind='hold-all-ready-human-units'), dict(id='next', kind='end-turn')], 16, 16)
        first_meta, first = replay_case(case, RUNTIME)
        second_meta, second = replay_case(copy.deepcopy(case), RUNTIME)
        self.assertEqual(first, second)
        self.assertEqual([point['state']['turn'] for point in first['checkpoints']], [1, 1, 2])
        self.assertEqual(first_meta['production_scripts_sha256'], second_meta['production_scripts_sha256'])
        self.assertEqual(first_meta['runtime_wasm_sha256'], second_meta['runtime_wasm_sha256'])
        self.assertIn('HOLD', [unit['order_native'] for unit in first['diagnostics']['checkpoints'][1]['units']])
        # Complete *actual* collection: production startup seats all seven factions.
        self.assertEqual(len(first['checkpoints'][0]['state']['players']), 7)


ASSETS = os.environ.get('STATE_TRACE_ASSETS')


@unittest.skipUnless(ASSETS and RUNTIME.exists(), 'Optional installed-text full-profile replay requires STATE_TRACE_ASSETS and WASM runtime')
class CandidateInstalledSourceTests(unittest.TestCase):
    def test_explicit_move_and_hold_match_frozen_all_player_reference(self):
        from compare import read_json, validate_observations
        from state_trace.compare import compare_outputs
        from ui.research_headless import installed_sources
        suite = read_json(EXPLICIT_SUITE)
        record = read_json(ROOT / 'tools/behavior-tests/state_trace/observations/smacx-gog-2.0-explicit-seven-world-v2-native-defaults.json')
        expected = validate_observations(record, suite)
        sources = installed_sources(Path(ASSETS))
        # The end-turn case remains a genuine mismatch and is reported by the
        # strict runner; only these two independently frozen behaviors landed.
        for case in suite['cases'][:2]:
            with self.subTest(case=case['id']):
                metadata, output = replay_case(case, RUNTIME, sources=sources)
                self.assertTrue(metadata['candidate_executed'])
                self.assertEqual(compare_outputs(expected[case['id']], output, case['input']), {'status': 'matched'})

    def test_frozen_economy_profile_reads_initialized_production_technology_and_ledger(self):
        from ui.research_headless import installed_sources
        case = scenario('natural-startup', [dict(id='before', kind='snapshot'),
            dict(id='held', kind='hold-all-ready-human-units'), dict(id='next', kind='end-turn')], 16, 16)
        case['input']['fixture']['profile'] = 'economy-research-v1'
        metadata, output = replay_case(case, RUNTIME, sources=installed_sources(Path(ASSETS)))
        self.assertEqual(metadata['semantic_profile'], 'economy-research-v1')
        self.assertEqual(output['diagnostics']['native_configuration'], {'blind_research': True})
        for point in output['checkpoints']:
            state = point['state']
            self.assertEqual(set(state['research']), {player['id'] for player in state['players']})
            self.assertGreater(len(state['research']['player:1']['owned_tech_ids']), 0)
            for base in state['bases']:
                self.assertIs(type(base['resources']['minerals']), int)
                self.assertIn(base['project'], {'formers', 'scout-patrol', 'colony-pod'})
                self.assertEqual(base['jobs']['workers'] + base['jobs']['doctors'], base['population'])


if __name__ == '__main__':
    unittest.main()
