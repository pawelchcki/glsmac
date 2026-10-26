"""Trace-aware comparison on top of compare.py evidence binding."""

from compare import select_cases, validate_observations
from protocol import ProtocolError, canonical, probe_request, validate_cases, validate_response
from state_trace.schema import ALGORITHM, validate_output, validate_reference_output, validate_reference_plan
from state_trace.comparison_audit import audit_outputs, state_groups

DOMAIN_LIMIT = 20
TOTAL_LIMIT = 50

__all__ = ["ALGORITHM", "compare_outputs", "compare_states", "compare_suite", "select_cases"]


def compare_states(expected, actual, checkpoint=None):
    """Bounded per-domain differences; entities matched by stable id.

    Array order is insignificant: units/bases/players are matched by
    stable logical id, never by position. At most DOMAIN_LIMIT
    differences per domain and TOTAL_LIMIT overall. When checkpoint is
    given, every difference carries it so multi-checkpoint reports stay
    attributable.
    """
    found, domain_counts = [], {}
    for domain, identity, owners, status, changes in state_groups(expected, actual):
        if len(found) >= TOTAL_LIMIT:
            break
        if domain_counts.get(domain, 0) >= DOMAIN_LIMIT:
            continue
        for item in changes:
            if checkpoint is not None:
                item = {**item, "checkpoint": checkpoint}
            found.append(item)
            domain_counts[domain] = domain_counts.get(domain, 0) + 1
            if domain_counts[domain] >= DOMAIN_LIMIT or len(found) >= TOTAL_LIMIT:
                break
    return found


def _unsupported_reason(side, point):
    denied = sorted(name for name, allowed in point["coverage"].items() if not allowed)
    if denied:
        return f"{side} checkpoint {point['id']} declares {denied} unobserved"
    return None


def compare_outputs(expected, actual, case_input):
    """Compare one recorded output with one candidate output.

    Raises ProtocolError when either side is structurally malformed or
    the reference breaks the declared checkpoint plan; a reference
    coverage gap is reported as unsupported, never as a pass. Otherwise
    returns a matched/mismatched/unsupported result naming the first
    divergence. Checkpoints are compared in chronological order so an
    early divergence is never hidden by a later dropped checkpoint, id
    change or coverage gap. Any observed value or structural divergence
    beats a coverage gap anywhere: gaps are reported as unsupported only
    when no actual divergence exists, and never pass.
    """
    try:
        wanted = validate_reference_plan(expected, case_input)
    except ProtocolError as error:
        raise ProtocolError(f"reference trace is malformed: {error}") from error
    got = validate_output(actual, case_input)
    pairs = list(zip(wanted, got))
    all_found = []
    first = None
    unsupported = None
    for wanted_point, got_point in pairs:
        if (wanted_point["id"], wanted_point["after_action"]) != (
            got_point["id"], got_point["after_action"]
        ):
            detail = {
                "path": "$.checkpoints",
                "expected": {"id": wanted_point["id"], "after_action": wanted_point["after_action"]},
                "actual": {"id": got_point["id"], "after_action": got_point["after_action"]},
                "checkpoint": got_point["id"],
            }
            if first is not None:
                return {"status": "mismatched",
                        "first_divergent_checkpoint": first[0],
                        "first_path": first[1],
                        "differences": all_found[:TOTAL_LIMIT]}
            return {"status": "mismatched",
                    "first_divergent_checkpoint": got_point["id"],
                    "first_path": "$.checkpoints",
                    "differences": [detail]}
        found = compare_states(wanted_point["state"], got_point["state"],
                               checkpoint=got_point["id"])
        if found and first is None:
            first = (got_point["id"], found[0]["path"])
        for item in found:
            if len(all_found) < TOTAL_LIMIT:
                all_found.append(item)
        for side, point in (("reference", wanted_point), ("candidate", got_point)):
            reason = _unsupported_reason(side, point)
            if reason is not None and unsupported is None:
                unsupported = reason
        if len(all_found) >= TOTAL_LIMIT:
            break
    if len(wanted) != len(got):
        (longer, missing) = (wanted, "actual") if len(wanted) > len(got) else (got, "expected")
        divergent = longer[len(pairs)]["id"]
        if first is not None:
            return {"status": "mismatched",
                    "first_divergent_checkpoint": first[0],
                    "first_path": first[1],
                    "differences": all_found[:TOTAL_LIMIT]}
        return {"status": "mismatched",
                "first_divergent_checkpoint": divergent,
                "first_path": "$.checkpoints.length",
                "differences": [{
                    "path": "$.checkpoints.length",
                    "expected": len(wanted), "actual": len(got),
                    "detail": f"checkpoint {divergent} {missing}_missing",
                    "checkpoint": divergent,
                }]}
    if first is not None:
        return {"status": "mismatched",
                "first_divergent_checkpoint": first[0],
                "first_path": first[1],
                "differences": all_found[:TOTAL_LIMIT]}
    if unsupported is not None:
        return {"status": "unsupported", "reason": unsupported}
    return {"status": "matched"}


def compare_suite(suite, record, candidate, audit_details=None):
    """Compare every case; reuse compare.py evidence and response binding.

    The suite envelope is validated before any case is read, and every
    reference output is strictly validated before the candidate result
    for that case is considered: a malformed reference (broken plan,
    coverage gap or bad state) is reported as an error even when the
    candidate itself is unsupported or errored. Source/runtime identities
    from the runners are reported unchanged.
    """
    cases = validate_cases(suite)
    for case in cases:
        if case["algorithm"] != ALGORITHM:
            raise ProtocolError(f"case {case['id']} uses {case['algorithm']}, not {ALGORITHM}")
    expected = validate_observations(record, suite)
    actual = validate_response(candidate, probe_request(suite))
    inputs = {case["id"]: case["input"] for case in probe_request(suite)["cases"]}
    counts = {"matched": 0, "mismatched": 0, "unsupported": 0, "errors": 0}
    results = []
    for case in probe_request(suite)["cases"]:
        case_id = case["id"]
        result = {"id": case_id}
        audit = None
        try:
            validate_reference_output(expected[case_id], inputs[case_id])
        except ProtocolError as error:
            result.update(status="errors", reason=f"reference trace is malformed: {error}")
            counts["errors"] += 1
            result["comparison_audit"] = {"comparison_performed": False, "reason": result["reason"]}
            if audit_details is not None:
                audit_details.append(dict(id=case_id, status="errors", **result["comparison_audit"]))
            results.append(result)
            continue
        response = actual[case_id]
        result = {"id": case_id}
        if response["status"] in ("unsupported", "error"):
            status = "errors" if response["status"] == "error" else "unsupported"
            result.update(status=status, reason=response["reason"])
        else:
            try:
                outcome = compare_outputs(expected[case_id], response["output"], inputs[case_id])
            except ProtocolError as error:
                outcome = {"status": "errors", "reason": str(error)}
            status = outcome.pop("status")
            result.update(status=status, **outcome)
            if status != "errors":
                audit = audit_outputs(expected[case_id], response["output"], inputs[case_id],
                                      detail_limit=1000 if audit_details is not None else 0)
                result["comparison_audit"] = {key: value for key, value in audit.items()
                                              if key not in ("details", "detail_limit", "details_omitted")}
                if audit_details is not None:
                    audit_details.append(dict(id=case_id, status=status, **audit))
        if audit is None:
            result["comparison_audit"] = {"comparison_performed": False, "reason": result["reason"]}
            if audit_details is not None:
                audit_details.append(dict(id=case_id, status=status, **result["comparison_audit"]))
        counts[status] += 1
        results.append(result)
    canonical(record)
    return {
        "version": 1, "algorithm": ALGORITHM, "suite_sha256": record["suite_sha256"],
        "reference": record["reference"], "candidate": candidate["implementation"],
        "summary": counts, "results": results,
    }
