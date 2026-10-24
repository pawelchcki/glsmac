"""Native exporter invariants, without original executables, assets or answers."""
import copy
import os
from pathlib import Path
import unittest

from protocol import ProtocolError
from state_trace.candidate import ROOT, Unsupported, gse_literal, parse_candidate, prepare, replay_case
from state_trace.schema import ALGORITHM


def scenario(kind='exporter-invariants', actions=None):
    fixture = dict(kind=kind, rng_state='1:2:3:4')
    if kind == 'natural-startup':
        fixture.update(width=4, height=4, terrain='flat-arid', faction='GAIANS', difficulty='Citizen')
    return dict(id='native-exporter', algorithm=ALGORITHM, input=dict(fixture=fixture,
        actions=actions or [dict(id='observed', kind='snapshot')]))


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
            dict(id='held', kind='hold-all-ready-human-units'), dict(id='next', kind='end-turn')])
        first_meta, first = replay_case(case, RUNTIME)
        second_meta, second = replay_case(copy.deepcopy(case), RUNTIME)
        self.assertEqual(first, second)
        self.assertEqual([point['state']['turn'] for point in first['checkpoints']], [1, 1, 2])
        self.assertEqual(first_meta['production_scripts_sha256'], second_meta['production_scripts_sha256'])
        self.assertEqual(first_meta['runtime_wasm_sha256'], second_meta['runtime_wasm_sha256'])
        self.assertEqual(first['diagnostics']['checkpoints'][1]['units'][0]['order_native'], 'HOLD')
        # Complete *actual* collection, without inventing the six absent AI slots.
        self.assertEqual(len(first['checkpoints'][0]['state']['players']), 1)


ASSETS = os.environ.get('STATE_TRACE_ASSETS')


@unittest.skipUnless(ASSETS and RUNTIME.exists(), 'Optional installed-text full-profile replay requires STATE_TRACE_ASSETS and WASM runtime')
class CandidateInstalledSourceTests(unittest.TestCase):
    def test_frozen_economy_profile_reads_initialized_production_technology_and_ledger(self):
        from ui.research_headless import installed_sources
        case = scenario('natural-startup', [dict(id='before', kind='snapshot'),
            dict(id='held', kind='hold-all-ready-human-units'), dict(id='next', kind='end-turn')])
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
