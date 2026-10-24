"""Tests for the shared scenario/state-trace framework. All fixtures synthetic."""

from copy import deepcopy
import json
import sys
import tempfile
import unittest
from pathlib import Path

import compare as behavior
from protocol import ProtocolError, fingerprint, probe_request
from state_trace.compare import (
    compare_outputs,
    compare_states,
    compare_suite,
    select_cases,
)
from state_trace.run import check_suite, main as trace_main
from state_trace.schema import (
    ALGORITHM,
    validate_input,
    validate_output,
    validate_reference_output,
    validate_reference_plan,
)


def case_input():
    return {"fixture": {"map": "synthetic", "players": ["human", "ai"]}, "actions": [
        {"id": "a1", "kind": "end-turn"},
        {"id": "a2", "kind": "move-unit", "args": {"unit": "u1"}},
    ], "checkpoints": [
        {"id": "c1", "after_action": "a1"},
        {"id": "c2", "after_action": "a2"},
    ]}


def state(turn=1, x1=2, owner2="ai", extra=None):
    value = {"turn": turn, "map": {"width": 40, "height": 20}, "players": [
        {"id": "human", "is_human": True}, {"id": "ai", "is_human": False},
    ], "units": [
        {"id": "u1", "owner": "human", "x": x1, "y": 3, "prototype": "scout",
         "moves_remaining": 1, "order": "none"},
        {"id": "u2", "owner": owner2, "x": 9, "y": 9, "prototype": "colony-pod"},
    ], "bases": [
        {"id": "b1", "owner": "human", "x": 2, "y": 3, "population": 1},
    ]}
    if extra:
        value.update(extra)
    return value


def output(states, coverage=None, diagnostics=None, ids=(("c1", "a1"), ("c2", "a2"))):
    points = []
    for (point_id, after), item in zip(ids, states):
        entry = {"id": point_id, "after_action": after, "state": item}
        if coverage is not None:
            entry["coverage"] = coverage
        points.append(entry)
    result = {"checkpoints": points}
    if diagnostics is not None:
        result["diagnostics"] = diagnostics
    return result


def suite(inputs=None):
    return {"version": 1, "cases": [
        {"id": "trace-a", "algorithm": ALGORITHM, "input": case_input()},
        {"id": "trace-b", "algorithm": ALGORITHM, "input": inputs or case_input()},
    ]}


def record(outputs):
    request = probe_request(suite())
    return {"version": 1, "suite_sha256": fingerprint(request), "repeat": 2,
            "captured_at": "2000-01-01T00:00:00+00:00", "reference": {
                "name": "synthetic-trace-double", "kind": "original-executable",
                "executable_sha256": "b" * 64, "adapter_version": 1,
            }, "observations": [
                {"id": case["id"], "case_sha256": fingerprint(case), "output": outputs[case["id"]]}
                for case in request["cases"]
            ]}


def candidate(outputs, status="ok", implementation=None):
    implementation = implementation or {"name": "synthetic-candidate", "kind": "candidate"}
    results = []
    for case_id, item in outputs.items():
        if status == "ok":
            results.append({"id": case_id, "status": "ok", "output": item})
        else:
            results.append({"id": case_id, "status": status, "reason": "synthetic"})
    return {"version": 1, "implementation": implementation, "results": results}


def good_outputs():
    return {"trace-a": output([state(), state(turn=2, x1=4)]),
            "trace-b": output([state(), state(turn=2, x1=4)])}


class SchemaTests(unittest.TestCase):
    def test_valid_input_and_output_pass(self):
        actions = validate_input(case_input())
        self.assertEqual([action["id"] for action in actions], ["a1", "a2"])
        points = validate_output(output([state(), state(turn=2)]), case_input())
        self.assertEqual([point["id"] for point in points], ["c1", "c2"])

    def test_malformed_inputs_rejected(self):
        bad = deepcopy(case_input())
        bad["actions"] = []
        with self.assertRaises(ProtocolError):
            validate_input(bad)
        for mutate in (
            lambda value: value.update({"actions": [
                {"id": "a1", "kind": "end-turn"}, {"id": "a1", "kind": "end-turn"}]}),
            lambda value: value.update({"actions": [{"id": "a1", "kind": "Bad Kind"}]}),
            lambda value: value.update({"fixture": {}}),
            lambda value: value.update({"checkpoints": [{"id": "c9", "after_action": "nope"}]}),
            lambda value: value.update({"checkpoints": [
                {"id": "c1", "after_action": "a2"}, {"id": "c2", "after_action": "a1"}]}),
        ):
            with self.subTest(mutate=str(mutate)):
                broken = deepcopy(case_input())
                mutate(broken)
                with self.assertRaises(ProtocolError):
                    validate_input(broken)

    def test_malformed_outputs_are_rejected(self):
        base = output([state(), state(turn=2)])
        cases = []
        missing = deepcopy(base)
        del missing["checkpoints"][0]["state"]["players"]
        cases.append(missing)
        duplicate_unit = deepcopy(base)
        duplicate_unit["checkpoints"][1]["state"]["units"].append(
            deepcopy(duplicate_unit["checkpoints"][1]["state"]["units"][0]))
        cases.append(duplicate_unit)
        duplicate_point = deepcopy(base)
        duplicate_point["checkpoints"][1]["id"] = "c1"
        cases.append(duplicate_point)
        unknown_owner = deepcopy(base)
        unknown_owner["checkpoints"][0]["state"]["units"][0]["owner"] = "ghost"
        cases.append(unknown_owner)
        bool_turn = deepcopy(base)
        bool_turn["checkpoints"][0]["state"]["turn"] = True
        cases.append(bool_turn)
        empty = deepcopy(base)
        empty["checkpoints"] = []
        cases.append(empty)
        for index, broken in enumerate(cases):
            with self.subTest(index=index):
                with self.assertRaises(ProtocolError):
                    validate_output(broken, case_input())

    def test_stable_identity_survives_movement(self):
        moved = output([state(x1=2), state(turn=2, x1=4)])
        self.assertEqual(compare_outputs(output([state(), state(turn=1)]), moved, case_input())["status"], "mismatched")
        same_spot = output([state(), state(turn=2, x1=4)])
        self.assertEqual(compare_outputs(moved, deepcopy(same_spot), case_input())["status"], "matched")


class CompareTests(unittest.TestCase):
    def test_complete_agreement(self):
        report = compare_suite(suite(), record(good_outputs()), candidate(good_outputs()))
        self.assertEqual(report["summary"], {"matched": 2, "mismatched": 0, "unsupported": 0, "errors": 0})

    def test_diagnostics_are_ignored(self):
        varied = deepcopy(good_outputs())
        varied["trace-a"]["diagnostics"] = {"runtime_ids": {"u1": "0xdead"}, "engine": "synthetic"}
        report = compare_suite(suite(), record(good_outputs()), candidate(varied))
        self.assertEqual(report["summary"]["matched"], 2)

    def test_dropped_checkpoint_is_a_mismatch(self):
        varied = deepcopy(good_outputs())
        varied["trace-b"]["checkpoints"] = varied["trace-b"]["checkpoints"][:1]
        report = compare_suite(suite(), record(good_outputs()), candidate(varied))
        bad = next(item for item in report["results"] if item["id"] == "trace-b")
        self.assertEqual(bad["status"], "mismatched")
        self.assertEqual(bad["first_divergent_checkpoint"], "c2")
        self.assertEqual(report["summary"]["mismatched"], 1)

    def test_reordered_checkpoints_are_a_mismatch(self):
        # Same after_action for both points keeps both orders well-formed;
        # swapping the ids is then a comparison mismatch, not malformed input.
        swapped = deepcopy(case_input())
        swapped["checkpoints"] = [{"id": "c1", "after_action": "a1"}, {"id": "c1b", "after_action": "a1"}]
        pair = (("c1", "a1"), ("c1b", "a1"))
        first = output([state(), state(turn=2)], ids=pair)
        second = deepcopy(first)
        second["checkpoints"] = list(reversed(second["checkpoints"]))
        outcome = compare_outputs(first, second, swapped)
        self.assertEqual(outcome["status"], "mismatched")
        self.assertEqual(outcome["first_divergent_checkpoint"], "c1b")
        self.assertEqual(outcome["first_path"], "$.checkpoints")

    def test_field_and_type_differences_report_paths(self):
        reference = output([state(extra={"resources": {"minerals": 5}}),
                            state(turn=2, extra={"resources": {"minerals": 6}})])
        actual = output([state(extra={"resources": {"minerals": 5}}),
                         state(turn=2, extra={"resources": {"minerals": "6"}})])
        outcome = compare_outputs(reference, actual, case_input())
        self.assertEqual(outcome["status"], "mismatched")
        self.assertEqual(outcome["first_divergent_checkpoint"], "c2")
        self.assertIn("minerals", outcome["first_path"])
        valued = deepcopy(good_outputs()["trace-a"])
        valued["checkpoints"][0]["state"]["turn"] = 9
        valued["checkpoints"][1]["state"]["bases"][0]["population"] = 2
        outcome = compare_outputs(record(good_outputs())["observations"][0]["output"],
                                  valued, case_input())
        self.assertEqual(outcome["status"], "mismatched")
        self.assertEqual(outcome["first_divergent_checkpoint"], "c1")
        self.assertIn("$.state.turn", outcome["first_path"])
        paths = [item["path"] for item in outcome["differences"]]
        self.assertTrue(any("population" in path for path in paths))

    def test_hidden_opponent_change_is_detected(self):
        varied = deepcopy(good_outputs())
        varied["trace-b"]["checkpoints"][1]["state"]["units"] = [
            unit for unit in varied["trace-b"]["checkpoints"][1]["state"]["units"]
            if unit["owner"] == "human"
        ]
        outcome = compare_outputs(record(good_outputs())["observations"][1]["output"],
                                  varied["trace-b"], case_input())
        self.assertEqual(outcome["status"], "mismatched")
        self.assertTrue(any(item.get("actual_missing") for item in outcome["differences"]))

    def test_opponent_roster_change_is_detected(self):
        varied = deepcopy(good_outputs())
        varied["trace-a"]["checkpoints"][0]["state"]["players"] = [{"id": "human"}]
        varied["trace-a"]["checkpoints"][0]["state"]["units"] = [
            varied["trace-a"]["checkpoints"][0]["state"]["units"][0]]
        report = compare_suite(suite(), record(good_outputs()), candidate(varied))
        bad = next(item for item in report["results"] if item["id"] == "trace-a")
        self.assertEqual(bad["status"], "mismatched")

    def test_unsupported_coverage_never_passes(self):
        varied = deepcopy(good_outputs())
        varied["trace-a"]["checkpoints"][0]["coverage"] = {"units.opponent": False}
        report = compare_suite(suite(), record(good_outputs()), candidate(varied))
        bad = next(item for item in report["results"] if item["id"] == "trace-a")
        self.assertEqual(bad["status"], "unsupported")
        self.assertEqual(report["summary"]["matched"], 1)

    def test_candidate_statuses_never_pass(self):
        for status, bucket in (("unsupported", "unsupported"), ("error", "errors")):
            with self.subTest(status=status):
                response = candidate(good_outputs(), status=status)
                report = compare_suite(suite(), record(good_outputs()), response)
                self.assertEqual(report["summary"][bucket], 2)
                self.assertEqual(report["summary"]["matched"], 0)

    def test_early_divergence_survives_identical_final_state(self):
        reference = output([state(turn=1, x1=7), state(turn=2, x1=4)])
        actual = output([state(turn=1, x1=2), state(turn=2, x1=4)])
        outcome = compare_outputs(reference, actual, case_input())
        self.assertEqual(outcome["status"], "mismatched")
        self.assertEqual(outcome["first_divergent_checkpoint"], "c1")

    def test_duplicate_identity_is_an_error(self):
        varied = deepcopy(good_outputs())
        varied["trace-a"]["checkpoints"][0]["state"]["units"].append(
            deepcopy(varied["trace-a"]["checkpoints"][0]["state"]["units"][0]))
        report = compare_suite(suite(), record(good_outputs()), candidate(varied))
        bad = next(item for item in report["results"] if item["id"] == "trace-a")
        self.assertEqual(bad["status"], "errors")
        self.assertEqual(report["summary"]["matched"], 1)

    def test_reference_mutation_fails_closed(self):
        evidence = record(good_outputs())
        evidence["observations"][0]["output"]["checkpoints"][0]["state"]["turn"] = 99
        report = compare_suite(suite(), evidence, candidate(good_outputs()))
        self.assertEqual(report["summary"]["matched"], 1)
        self.assertEqual(report["summary"]["mismatched"], 1)
        mutated = record(good_outputs())
        mutated["observations"][0]["case_sha256"] = "0" * 64
        with self.assertRaises(ProtocolError):
            compare_suite(suite(), mutated, candidate(good_outputs()))

    def test_exact_evidence_selection(self):
        before = (deepcopy(suite()), deepcopy(record(good_outputs())))
        selected, projected = select_cases(suite(), record(good_outputs()), ["trace-b"])
        self.assertEqual([case["id"] for case in selected["cases"]], ["trace-b"])
        self.assertEqual([row["id"] for row in projected["observations"]], ["trace-b"])
        self.assertEqual((suite(), record(good_outputs())), before)
        report = compare_suite(selected, projected, candidate({"trace-b": good_outputs()["trace-b"]}))
        self.assertEqual(report["summary"]["matched"], 1)
        with self.assertRaises(ProtocolError):
            select_cases(suite(), record(good_outputs()), ["unknown"])


def case_input_no_plan():
    value = case_input()
    del value["checkpoints"]
    return value


class ReferenceStrictnessTests(unittest.TestCase):
    def test_reference_coverage_gap_never_passes(self):
        gapped = output([state(), state(turn=2)], coverage={"units.opponent": False})
        full = output([state(), state(turn=2)])
        outcome = compare_outputs(gapped, full, case_input())
        self.assertEqual(outcome["status"], "unsupported")
        self.assertIn("reference", outcome["reason"])
        outcome = compare_outputs(full, gapped, case_input())
        self.assertEqual(outcome["status"], "unsupported")
        with self.assertRaises(ProtocolError):
            validate_reference_output(gapped, case_input())
        # Plan-only strictness allows the gap (comparison reports it);
        # the recording gate above rejects it.
        self.assertEqual(len(validate_reference_plan(gapped, case_input())), 2)

    def test_reference_gap_is_an_error_in_suite(self):
        gapped = output([state(), state(turn=2)], coverage={"units.opponent": False})
        varied = {"trace-a": gapped, "trace-b": good_outputs()["trace-b"]}
        report = compare_suite(suite(), record(varied), candidate(good_outputs()))
        bad = next(item for item in report["results"] if item["id"] == "trace-a")
        self.assertEqual(bad["status"], "errors")
        self.assertIn("reference", bad["reason"])
        self.assertEqual(report["summary"]["matched"], 1)

    def test_malformed_reference_not_masked_by_candidate_status(self):
        broken = deepcopy(good_outputs())
        broken["trace-a"]["checkpoints"][0]["state"]["units"].append(
            deepcopy(broken["trace-a"]["checkpoints"][0]["state"]["units"][0]))
        for status in ("unsupported", "error"):
            with self.subTest(status=status):
                report = compare_suite(
                    suite(), record(broken), candidate(good_outputs(), status=status))
                bad = next(item for item in report["results"] if item["id"] == "trace-a")
                self.assertEqual(bad["status"], "errors")
                self.assertIn("reference", bad["reason"])
                self.assertEqual(report["summary"]["matched"], 0)

    def test_reference_plan_gaps_are_malformed(self):
        dropped = output([state()], ids=(("c1", "a1"),))
        with self.assertRaises(ProtocolError):
            validate_reference_output(dropped, case_input())
        with self.assertRaises(ProtocolError):
            compare_outputs(dropped, deepcopy(dropped), case_input())
        outcome = compare_outputs(output([state(), state(turn=2)]), dropped, case_input())
        self.assertEqual(outcome["status"], "mismatched")
        self.assertEqual(outcome["first_divergent_checkpoint"], "c2")
        added = output([state(), state(turn=2), state(turn=3)],
                       ids=(("c1", "a1"), ("c2", "a2"), ("c3", "a2")))
        with self.assertRaises(ProtocolError):
            validate_reference_output(added, case_input())
        outcome = compare_outputs(output([state(), state(turn=2)]), added, case_input())
        self.assertEqual(outcome["status"], "mismatched")
        self.assertEqual(outcome["first_divergent_checkpoint"], "c3")

    def test_reference_plan_without_declared_checkpoints(self):
        strict = case_input_no_plan()
        full = output([state(), state(turn=2)], ids=(("x", "a1"), ("y", "a2")))
        self.assertEqual(len(validate_reference_output(full, strict)), 2)
        short = output([state()], ids=(("x", "a1"),))
        with self.assertRaises(ProtocolError):
            validate_reference_output(short, strict)


class ChronologyTests(unittest.TestCase):
    def test_early_state_divergence_beats_later_drop(self):
        reference = output([state(), state(turn=2)])
        actual = output([state(turn=99)], ids=(("c1", "a1"),))
        outcome = compare_outputs(reference, actual, case_input())
        self.assertEqual(outcome["status"], "mismatched")
        self.assertEqual(outcome["first_divergent_checkpoint"], "c1")
        self.assertEqual(outcome["first_path"], "$.state.turn")

    def test_early_state_divergence_beats_later_id_change(self):
        reference = output([state(), state(turn=2)])
        actual = deepcopy(reference)
        actual["checkpoints"][0]["state"]["turn"] = 99
        actual["checkpoints"][1]["id"] = "wrong"
        outcome = compare_outputs(reference, actual, case_input())
        self.assertEqual(outcome["status"], "mismatched")
        self.assertEqual(outcome["first_divergent_checkpoint"], "c1")
        self.assertEqual(outcome["first_path"], "$.state.turn")

    def test_early_state_divergence_beats_later_coverage_gap(self):
        reference = output([state(), state(turn=2)])
        actual = deepcopy(reference)
        actual["checkpoints"][0]["state"]["turn"] = 99
        actual["checkpoints"][1]["coverage"] = {"units.opponent": False}
        outcome = compare_outputs(reference, actual, case_input())
        self.assertEqual(outcome["status"], "mismatched")
        self.assertEqual(outcome["first_divergent_checkpoint"], "c1")

    def test_state_divergence_beats_earlier_coverage_gap(self):
        reference = output([state(), state(turn=2)])
        actual = deepcopy(reference)
        actual["checkpoints"][0]["coverage"] = {"units.opponent": False}
        actual["checkpoints"][1]["state"]["turn"] = 99
        outcome = compare_outputs(reference, actual, case_input())
        self.assertEqual(outcome["status"], "mismatched")
        self.assertEqual(outcome["first_divergent_checkpoint"], "c2")

    def test_lone_coverage_gap_is_unsupported(self):
        reference = output([state(), state(turn=2)])
        actual = deepcopy(reference)
        actual["checkpoints"][0]["coverage"] = {"units.opponent": False}
        outcome = compare_outputs(reference, actual, case_input())
        self.assertEqual(outcome["status"], "unsupported")
        self.assertIn("c1", outcome["reason"])

    def test_same_checkpoint_state_beats_coverage_gap(self):
        reference = output([state(), state(turn=2)])
        actual = deepcopy(reference)
        actual["checkpoints"][0]["state"]["turn"] = 99
        actual["checkpoints"][0]["coverage"] = {"units.opponent": False}
        outcome = compare_outputs(reference, actual, case_input())
        self.assertEqual(outcome["status"], "mismatched")
        self.assertEqual(outcome["first_divergent_checkpoint"], "c1")


class EntityOrderTests(unittest.TestCase):
    def test_reordered_arrays_still_match(self):
        reference = output([state(), state(turn=2)])
        actual = deepcopy(reference)
        for checkpoint in actual["checkpoints"]:
            checkpoint["state"]["units"].reverse()
            checkpoint["state"]["bases"].reverse()
            checkpoint["state"]["players"].reverse()
        self.assertEqual(compare_outputs(reference, actual, case_input())["status"], "matched")

    def test_reordered_multi_base_roster_matches(self):
        first = state()
        first["bases"].append({"id": "b2", "owner": "ai", "x": 5, "y": 5, "population": 2})
        reference = output([first, state(turn=2)])
        actual = deepcopy(reference)
        for checkpoint in actual["checkpoints"]:
            checkpoint["state"]["bases"].reverse()
            checkpoint["state"]["players"].reverse()
        self.assertEqual(compare_outputs(reference, actual, case_input())["status"], "matched")

    def test_duplicate_base_identity_is_an_error(self):
        broken = output([state(), state(turn=2)])
        broken["checkpoints"][0]["state"]["bases"].append(
            deepcopy(broken["checkpoints"][0]["state"]["bases"][0]))
        with self.assertRaises(ProtocolError):
            validate_output(broken, case_input())
        varied = deepcopy(good_outputs())
        varied["trace-a"] = broken
        report = compare_suite(suite(), record(good_outputs()), candidate(varied))
        bad = next(item for item in report["results"] if item["id"] == "trace-a")
        self.assertEqual(bad["status"], "errors")


class InputHygieneTests(unittest.TestCase):
    def test_unknown_state_domains_require_objects(self):
        for value in ([], 1, True, "semantic", None):
            with self.subTest(value=value):
                broken = output([state(extra={"future_domain": value}), state(turn=2)])
                with self.assertRaises(ProtocolError):
                    validate_output(broken, case_input())
        valid = output([state(extra={"future_domain": {"value": 1}}), state(turn=2)])
        validate_output(valid, case_input())

    def test_cross_action_reorder_is_candidate_mismatch_but_invalid_reference(self):
        reference = output([state(), state(turn=2)])
        reordered = deepcopy(reference)
        reordered["checkpoints"].reverse()
        result = compare_outputs(reference, reordered, case_input())
        self.assertEqual(result["status"], "mismatched")
        self.assertEqual(result["first_divergent_checkpoint"], "c2")
        self.assertEqual(result["first_path"], "$.checkpoints")
        with self.assertRaises(ProtocolError):
            validate_reference_output(reordered, case_input())

    def test_initial_action_id_is_reserved(self):
        bad = case_input()
        bad["actions"][0]["id"] = "initial"
        bad["checkpoints"] = [{"id": "c0", "after_action": "initial"},
                              {"id": "c1", "after_action": "a2"}]
        with self.assertRaises(ProtocolError):
            validate_input(bad)
        with self.assertRaises(ProtocolError):
            check_suite({"version": 1, "cases": [
                {"id": "trace-a", "algorithm": ALGORITHM, "input": bad}]})

    def test_unhashable_after_action_is_malformed(self):
        for marker in ([], {}):
            with self.subTest(marker=type(marker).__name__):
                bad_plan = case_input()
                bad_plan["checkpoints"][0]["after_action"] = marker
                with self.assertRaises(ProtocolError):
                    validate_input(bad_plan)
                bad_output = output([state(), state(turn=2)])
                bad_output["checkpoints"][0]["after_action"] = marker
                with self.assertRaises(ProtocolError):
                    validate_output(bad_output, case_input())

    def test_unhashable_owner_is_malformed(self):
        for marker in ([], {}):
            with self.subTest(marker=type(marker).__name__):
                broken = output([state(), state(turn=2)])
                broken["checkpoints"][0]["state"]["units"][0]["owner"] = marker
                with self.assertRaises(ProtocolError):
                    validate_output(broken, case_input())

    def test_unknown_algorithm_is_rejected_before_cases(self):
        other = {"version": 1, "cases": [
            {"id": "trace-a", "algorithm": "game.other.v1", "input": case_input()}]}
        with self.assertRaises(ProtocolError):
            check_suite(other)
        with self.assertRaises(ProtocolError):
            compare_suite(other, record(good_outputs()), candidate(good_outputs()))
        with self.assertRaises(ProtocolError):
            check_suite({"no-version": True})

    def test_bool_is_not_an_integer(self):
        for mutate in (
            lambda point: point["state"].update({"turn": True}),
            lambda point: point["state"]["bases"][0].update({"population": True}),
            lambda point: point["state"]["units"][0].update({"moves_remaining": False}),
            lambda point: point.update({"coverage": {"units": 1}}),
            lambda point: point.update({"coverage": {"units": 0}}),
        ):
            with self.subTest(mutate=True):
                broken = output([state(), state(turn=2)])
                mutate(broken["checkpoints"][0])
                with self.assertRaises(ProtocolError):
                    validate_output(broken, case_input())


class LimitTests(unittest.TestCase):
    def test_domain_and_total_limits_hold(self):
        reference = state()
        actual = deepcopy(reference)
        for index, unit in enumerate(reference["units"]):
            for number in range(19 if index == 0 else 20):
                unit[f"extra{number}"] = 0
                actual["units"][index][f"extra{number}"] = 1
        found = compare_states(reference, actual, checkpoint="c1")
        units_found = [item for item in found if item["path"].startswith("$.state.units")]
        self.assertEqual(len(units_found), 20)
        self.assertLessEqual(len(found), 50)
        self.assertTrue(all(item["checkpoint"] == "c1" for item in found))

    def test_differences_carry_checkpoint_attribution(self):
        reference = output([state(turn=1, x1=7), state(turn=2, x1=4)])
        actual = output([state(turn=1, x1=2), state(turn=2, x1=5)])
        outcome = compare_outputs(reference, actual, case_input())
        self.assertEqual(outcome["status"], "mismatched")
        self.assertEqual(outcome["first_divergent_checkpoint"], "c1")
        self.assertTrue(outcome["differences"])
        self.assertTrue(all(item["checkpoint"] in ("c1", "c2")
                            for item in outcome["differences"]))

    def test_report_keeps_adapter_identities(self):
        implementation = {"name": "synthetic-candidate", "kind": "candidate",
                          "runtime": "synthetic-1.0"}
        report = compare_suite(suite(), record(good_outputs()),
                               candidate(good_outputs(), implementation=implementation))
        self.assertEqual(report["candidate"], implementation)
        self.assertEqual(report["reference"]["name"], "synthetic-trace-double")
        self.assertEqual(report["reference"]["kind"], "original-executable")


class RunnerReportTests(unittest.TestCase):
    def _write_tree(self, root, response, reference_outputs=None):
        (root / "cases.json").write_text(json.dumps(suite()))
        record_doc = record(reference_outputs or good_outputs())
        (root / "reference.json").write_text(json.dumps(record_doc))
        (root / "response.json").write_text(json.dumps(response))
        (root / "runner.py").write_text(
            "import json, sys\n"
            "request = json.load(sys.stdin)\n"
            f"outputs = json.load(open({str(root / 'response.json')!r}))\n"
            "results = [{\"id\": case[\"id\"], \"status\": \"ok\", \"output\": outputs[case[\"id\"]]}"
            " for case in request[\"cases\"]]\n"
            "print(json.dumps({\"version\": 1, "
            "\"implementation\": {\"name\": \"synthetic-candidate\", \"kind\": \"candidate\"}, "
            "\"results\": results}))\n")
        return root

    def _compare(self, root, command, name="report.json", extra=()):
        report = root / name
        code = trace_main(["compare", "--cases", str(root / "cases.json"),
                           "--reference", str(root / "reference.json"),
                           "--command", command, "--report", str(report), *extra])
        return code, report

    def test_success_reports_execution(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = self._write_tree(Path(scratch), good_outputs())
            code, report = self._compare(root, f"{sys.executable} {root / 'runner.py'}")
            self.assertEqual(code, 0)
            body = json.loads(report.read_text())
            self.assertTrue(body["candidate_executed"])
            self.assertIn("duration_s", body)
            self.assertEqual(body["summary"]["matched"], 2)

    def test_crash_replaces_stale_report(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = self._write_tree(Path(scratch), good_outputs())
            stale = {"summary": {"matched": 2}, "candidate_executed": True}
            (root / "report.json").write_text(json.dumps(stale))
            code, report = self._compare(
                root, f"{sys.executable} -c \"import sys; sys.exit(1)\"")
            self.assertEqual(code, 2)
            body = json.loads(report.read_text())
            self.assertTrue(body["candidate_executed"])
            self.assertIn("error", body)
            self.assertNotEqual(body, stale)

    def test_timeout_replaces_stale_report(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = self._write_tree(Path(scratch), good_outputs())
            (root / "report.json").write_text(json.dumps({"candidate_executed": True}))
            code, report = self._compare(
                root, f"{sys.executable} -c \"import time; time.sleep(30)\"",
                extra=("--timeout", "0.05"))
            self.assertEqual(code, 2)
            body = json.loads(report.read_text())
            self.assertTrue(body["candidate_executed"])
            self.assertIn("error", body)

    def test_invalid_input_reports_not_executed(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = self._write_tree(Path(scratch), good_outputs())
            (root / "reference.json").write_text(json.dumps({"broken": True}))
            (root / "report.json").write_text(json.dumps({"candidate_executed": True}))
            code, report = self._compare(root, f"{sys.executable} {root / 'runner.py'}")
            self.assertEqual(code, 2)
            body = json.loads(report.read_text())
            self.assertFalse(body["candidate_executed"])
            self.assertIn("error", body)

    def test_unlaunched_commands_report_not_executed(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = self._write_tree(Path(scratch), good_outputs())
            for command in ("", "'unterminated", str(root / "missing-executable")):
                with self.subTest(command=command):
                    (root / "report.json").write_text(json.dumps({"candidate_executed": True}))
                    code, report = self._compare(root, command)
                    self.assertEqual(code, 2)
                    body = json.loads(report.read_text())
                    self.assertFalse(body["candidate_executed"])
                    self.assertIn("error", body)


class RunnerTests(unittest.TestCase):
    def test_crashing_probe_is_a_protocol_error(self):
        with self.assertRaises(ProtocolError):
            behavior.run_probe("false", probe_request(suite()), timeout=10)

    def test_timed_out_probe_is_a_protocol_error(self):
        with self.assertRaises(ProtocolError):
            behavior.run_probe("sleep 30", probe_request(suite()), timeout=0.1)

    def test_command_is_parsed_without_a_shell(self):
        with self.assertRaises(ProtocolError):
            behavior.run_probe("echo; exit 1", probe_request(suite()), timeout=10)


if __name__ == "__main__":
    unittest.main()
