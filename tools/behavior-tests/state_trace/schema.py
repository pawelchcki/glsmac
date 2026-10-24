"""Strict v1 scenario/state-trace schema. No game rules live here."""

import re

from protocol import ProtocolError

ALGORITHM = "game.state_trace.v1"

MAX_ACTIONS = 256
MAX_CHECKPOINTS = 1024

_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\Z")
_KIND = re.compile(r"[a-z0-9][a-z0-9_.-]{0,95}\Z")

REQUIRED_STATE_FIELDS = ("turn", "map", "players", "units", "bases")


def _id(value, what):
    if not isinstance(value, str) or not _ID.match(value):
        raise ProtocolError(f"invalid {what} id: {value!r}")
    return value


def _kind(value, action_id):
    if not isinstance(value, str) or not _KIND.match(value):
        raise ProtocolError(f"invalid action kind for {action_id}: {value!r}")
    return value


def _int(value, what):
    if type(value) is not int:
        raise ProtocolError(f"{what} must be an integer, not {type(value).__name__}")
    return value


def validate_input(case_input):
    """Validate a game.state_trace.v1 case input; return the action list."""
    if not isinstance(case_input, dict) or set(case_input) - {"fixture", "actions", "checkpoints"}:
        raise ProtocolError("trace input requires only fixture/actions/checkpoints")
    if "fixture" not in case_input or "actions" not in case_input:
        raise ProtocolError("trace input requires fixture and actions")
    fixture = case_input["fixture"]
    if not isinstance(fixture, dict) or not fixture:
        raise ProtocolError("trace fixture must be a non-empty object")
    actions = case_input["actions"]
    if not isinstance(actions, list) or not 1 <= len(actions) <= MAX_ACTIONS:
        raise ProtocolError(f"trace actions must list 1..{MAX_ACTIONS} actions")
    seen = set()
    for action in actions:
        if not isinstance(action, dict) or set(action) - {"id", "kind", "args"} or {"id", "kind"} - set(action):
            raise ProtocolError("trace action requires exactly id/kind, optional args")
        action_id = _id(action["id"], "action")
        if action_id == "initial":
            raise ProtocolError("action id 'initial' is reserved for the checkpoint epoch")
        if action_id in seen:
            raise ProtocolError(f"duplicate action id: {action_id}")
        seen.add(action_id)
        _kind(action["kind"], action_id)
        if "args" in action and not isinstance(action["args"], dict):
            raise ProtocolError(f"action args must be an object: {action_id}")
    if "checkpoints" in case_input:
        _validate_plan(case_input["checkpoints"], [action["id"] for action in actions])
    return actions


def _validate_plan(plan, action_ids):
    if not isinstance(plan, list) or not 1 <= len(plan) <= MAX_CHECKPOINTS:
        raise ProtocolError(f"trace checkpoints must list 1..{MAX_CHECKPOINTS} entries")
    order = {"initial": -1}
    order.update({action_id: index for index, action_id in enumerate(action_ids)})
    seen, level = set(), -1
    for entry in plan:
        if not isinstance(entry, dict) or set(entry) != {"id", "after_action"}:
            raise ProtocolError("trace checkpoint plan requires exactly id/after_action")
        checkpoint_id = _id(entry["id"], "checkpoint")
        if checkpoint_id in seen:
            raise ProtocolError(f"duplicate checkpoint id: {checkpoint_id}")
        seen.add(checkpoint_id)
        after = entry["after_action"]
        if not isinstance(after, str) or after not in order:
            raise ProtocolError(f"checkpoint {checkpoint_id} follows unknown action: {after!r}")
        if order[after] < level:
            raise ProtocolError(f"checkpoint {checkpoint_id} breaks action order")
        level = order[after]
    return plan


def expected_plan(case_input):
    """Checkpoint plan as (id-or-None, after_action) pairs in order."""
    actions = validate_input(case_input)
    if "checkpoints" in case_input:
        return [(entry["id"], entry["after_action"]) for entry in case_input["checkpoints"]]
    return [(None, action["id"]) for action in actions]


def validate_output(output, case_input):
    """Generic structural validation for a status-ok output; return checkpoints.

    Accepts any well-formed checkpoint sequence (unique ids, known
    after_action values) and any coverage
    declaration, including declared gaps. Plan-exactness and coverage
    completeness are enforced separately by validate_reference_output;
    candidate plan deviations are comparison mismatches, not errors.
    """
    if not isinstance(output, dict) or set(output) - {"checkpoints", "diagnostics"} or "checkpoints" not in output:
        raise ProtocolError("trace output requires checkpoints, optional diagnostics")
    if "diagnostics" in output and not isinstance(output["diagnostics"], dict):
        raise ProtocolError("trace diagnostics must be an object")
    actions = validate_input(case_input)
    order = {"initial": -1}
    order.update({action["id"]: index for index, action in enumerate(actions)})
    checkpoints = output["checkpoints"]
    if not isinstance(checkpoints, list) or not 1 <= len(checkpoints) <= MAX_CHECKPOINTS:
        raise ProtocolError(f"trace output requires 1..{MAX_CHECKPOINTS} checkpoints")
    seen = set()
    validated = []
    for entry in checkpoints:
        if not isinstance(entry, dict) or set(entry) - {"id", "after_action", "state", "coverage"} or {
            "id", "after_action", "state",
        } - set(entry):
            raise ProtocolError("trace checkpoint requires exactly id/after_action/state, optional coverage")
        checkpoint_id = _id(entry["id"], "checkpoint")
        if checkpoint_id in seen:
            raise ProtocolError(f"duplicate checkpoint id in output: {checkpoint_id}")
        seen.add(checkpoint_id)
        after_action = entry["after_action"]
        if not isinstance(after_action, str) or after_action not in order:
            raise ProtocolError(f"checkpoint {checkpoint_id} follows unknown action: {after_action!r}")
        coverage = entry.get("coverage", {})
        if not isinstance(coverage, dict) or any(
            not isinstance(key, str) or type(value) is not bool for key, value in coverage.items()
        ):
            raise ProtocolError(f"checkpoint coverage must map names to booleans: {checkpoint_id}")
        validated.append({
            "id": checkpoint_id,
            "after_action": entry["after_action"],
            "state": validate_state(entry["state"], checkpoint_id),
            "coverage": coverage,
        })
    return validated


def validate_reference_plan(output, case_input):
    """Strict plan validation for recorded reference outputs; return checkpoints.

    On top of validate_output, requires the checkpoint sequence to equal
    the full input checkpoint plan exactly (count, order, id and
    after_action per entry; without a declared plan, one checkpoint per
    action in action order). Coverage gaps are allowed here so direct
    comparison can report them as unsupported; recording and suite
    validation use validate_reference_output, which additionally rejects
    them. A reference that breaks the plan is malformed evidence.
    """
    validated = validate_output(output, case_input)
    plan = expected_plan(case_input)
    if "checkpoints" in case_input:
        observed = [(point["id"], point["after_action"]) for point in validated]
        if observed != plan:
            raise ProtocolError(
                f"reference checkpoints {observed!r} do not match declared plan {plan!r}"
            )
    elif [point["after_action"] for point in validated] != [after for (_, after) in plan]:
        raise ProtocolError(
            f"reference checkpoints skip actions: {[point['after_action'] for point in validated]!r}"
        )
    return validated


def validate_reference_output(output, case_input):
    """Strict validation for recorded reference outputs; return checkpoints.

    validate_reference_plan plus rejection of any coverage entry declaring
    a domain unobserved. A reference with plan or coverage gaps is
    malformed evidence (ProtocolError): it can never establish agreement.
    """
    validated = validate_reference_plan(output, case_input)
    for point in validated:
        denied = sorted(name for name, allowed in point["coverage"].items() if not allowed)
        if denied:
            raise ProtocolError(
                f"reference checkpoint {point['id']} declares {denied} unobserved"
            )
    return validated


def validate_state(state, checkpoint_id):
    """Validate one checkpoint state; return it unchanged."""
    if not isinstance(state, dict):
        raise ProtocolError(f"checkpoint {checkpoint_id} state must be an object")
    missing = [key for key in REQUIRED_STATE_FIELDS if key not in state]
    if missing:
        raise ProtocolError(f"checkpoint {checkpoint_id} state missing {missing}")
    _int(state["turn"], f"checkpoint {checkpoint_id} turn")
    world = state["map"]
    if not isinstance(world, dict) or set(world) != {"width", "height"}:
        raise ProtocolError(f"checkpoint {checkpoint_id} map requires exactly width/height")
    for key in ("width", "height"):
        _int(world[key], f"checkpoint {checkpoint_id} map {key}")
        if world[key] < 1:
            raise ProtocolError(f"checkpoint {checkpoint_id} map {key} must be positive")
    players = state["players"]
    if not isinstance(players, list) or not players:
        raise ProtocolError(f"checkpoint {checkpoint_id} requires a non-empty player roster")
    roster = set()
    for player in players:
        if not isinstance(player, dict) or "id" not in player:
            raise ProtocolError(f"checkpoint {checkpoint_id} player requires an id")
        player_id = player["id"]
        if not isinstance(player_id, str) or not player_id:
            raise ProtocolError(f"checkpoint {checkpoint_id} has an invalid player id")
        if player_id in roster:
            raise ProtocolError(f"checkpoint {checkpoint_id} duplicates player id: {player_id}")
        roster.add(player_id)
    for domain, required in (("units", ("id", "owner", "x", "y", "prototype")),
                             ("bases", ("id", "owner", "x", "y", "population"))):
        entities = state[domain]
        if not isinstance(entities, list):
            raise ProtocolError(f"checkpoint {checkpoint_id} {domain} must be an array")
        seen = set()
        for entity in entities:
            if not isinstance(entity, dict):
                raise ProtocolError(f"checkpoint {checkpoint_id} {domain} entries must be objects")
            absent = [key for key in required if key not in entity]
            if absent:
                raise ProtocolError(f"checkpoint {checkpoint_id} {domain} entry missing {absent}")
            entity_id = entity["id"]
            if not isinstance(entity_id, str) or not entity_id:
                raise ProtocolError(f"checkpoint {checkpoint_id} {domain} entry has an invalid id")
            if entity_id in seen:
                raise ProtocolError(f"checkpoint {checkpoint_id} duplicates {domain} id: {entity_id}")
            seen.add(entity_id)
            owner = entity["owner"]
            if not isinstance(owner, str) or owner not in roster:
                raise ProtocolError(
                    f"checkpoint {checkpoint_id} {domain} {entity_id} has unknown owner"
                )
            _int(entity["x"], f"checkpoint {checkpoint_id} {domain} {entity_id} x")
            _int(entity["y"], f"checkpoint {checkpoint_id} {domain} {entity_id} y")
            if domain == "units":
                if not isinstance(entity["prototype"], str) or not entity["prototype"]:
                    raise ProtocolError(
                        f"checkpoint {checkpoint_id} unit {entity_id} has an invalid prototype"
                    )
            elif type(entity["population"]) is not int:
                raise ProtocolError(
                    f"checkpoint {checkpoint_id} base {entity_id} has an invalid population"
                )
            if "moves_remaining" in entity:
                _int(entity["moves_remaining"], f"checkpoint {checkpoint_id} unit {entity_id} moves_remaining")
            if "order" in entity and not isinstance(entity["order"], str):
                raise ProtocolError(f"checkpoint {checkpoint_id} unit {entity_id} order must be a string")
    for domain in set(state) - set(REQUIRED_STATE_FIELDS):
        if not isinstance(state[domain], dict):
            raise ProtocolError(f"checkpoint {checkpoint_id} {domain} must be an object")
    return state
