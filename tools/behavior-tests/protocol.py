"""Shared, strict JSON protocol for behavior probes. No game rules live here."""

import hashlib
import json
import re
import sys


MAX_BYTES = 16 * 1024 * 1024
MAX_CASES = 10000


class ProtocolError(ValueError):
    pass


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ProtocolError(f"duplicate JSON field: {key}")
        result[key] = value
    return result


def _invalid_constant(value):
    raise ProtocolError(f"non-finite JSON number: {value}")


def decode_json(text):
    if len(text.encode("utf-8")) > MAX_BYTES:
        raise ProtocolError("JSON exceeds 16 MiB")
    try:
        value = json.loads(text, object_pairs_hook=_unique_object, parse_constant=_invalid_constant)
        # Also catches finite-looking JSON literals that overflow Python's float.
        canonical(value)
        return value
    except (ValueError, RecursionError) as error:
        raise ProtocolError(f"invalid JSON: {error}") from error


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)


def fingerprint(value):
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def _fields(value, required, optional=()):
    if not isinstance(value, dict):
        raise ProtocolError("expected a JSON object")
    if set(value) - set(required) - set(optional) or set(required) - set(value):
        raise ProtocolError(f"expected fields {sorted(required)}, optional {sorted(optional)}; got {sorted(value)}")


def _version(value):
    if type(value) is not int or value != 1:
        raise ProtocolError("unsupported protocol version (expected integer 1)")


def validate_cases(request):
    _fields(request, {"version", "cases"}, {"name", "description"})
    _version(request["version"])
    cases = request["cases"]
    if not isinstance(cases, list) or not 1 <= len(cases) <= MAX_CASES:
        raise ProtocolError(f"expected 1..{MAX_CASES} cases")
    ids = set()
    for case in cases:
        _fields(case, {"id", "algorithm", "input"}, {"description"})
        case_id = case["id"]
        if not isinstance(case_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", case_id):
            raise ProtocolError("invalid case id")
        if case_id in ids:
            raise ProtocolError(f"duplicate case id: {case_id}")
        ids.add(case_id)
        if not isinstance(case["algorithm"], str) or not re.fullmatch(r"[a-z0-9][a-z0-9_.-]{0,95}", case["algorithm"]):
            raise ProtocolError(f"invalid algorithm for {case_id}")
        if not isinstance(case["input"], dict):
            raise ProtocolError(f"case input must be an object: {case_id}")
    canonical(request)
    return cases


def probe_request(suite):
    """Pass only inputs to runners, never reference outputs or suite annotations."""
    return {"version": 1, "cases": [
        {key: case[key] for key in ("id", "algorithm", "input")}
        for case in validate_cases(suite)
    ]}


def validate_distance_input(data):
    _fields(data, {"width", "x1", "x2", "y"})
    if any(type(value) is not int for value in data.values()):
        raise ProtocolError("distance inputs must be integers, not booleans or floats")
    width, x1, x2, y = (data[key] for key in ("width", "x1", "x2", "y"))
    if not 4 <= width <= 4096 or width % 2 or not 0 <= y <= 4095:
        raise ProtocolError("invalid map width or row")
    if not (0 <= x1 < width and 0 <= x2 < width) or x1 % 2 != y % 2 or x2 % 2 != y % 2:
        raise ProtocolError("coordinates must be valid tiles on the same row")


def load_request():
    request = decode_json(sys.stdin.read(MAX_BYTES + 1))
    validate_cases(request)
    return request


def validate_response(response, request):
    _fields(response, {"version", "implementation", "results"})
    _version(response["version"])
    metadata = response["implementation"]
    if not isinstance(metadata, dict) or any(not isinstance(metadata.get(key), str) or not metadata[key] for key in ("name", "kind")):
        raise ProtocolError("implementation requires name and kind")
    if not isinstance(response["results"], list):
        raise ProtocolError("results must be an array")
    expected_ids = {case["id"] for case in validate_cases(request)}
    results = {}
    for result in response["results"]:
        if not isinstance(result, dict) or not isinstance(result.get("id"), str):
            raise ProtocolError("invalid result")
        case_id = result["id"]
        if case_id not in expected_ids or case_id in results:
            raise ProtocolError(f"unexpected or duplicate result: {case_id}")
        if result.get("status") == "ok":
            _fields(result, {"id", "status", "output"})
            if not isinstance(result["output"], dict):
                raise ProtocolError(f"output must be an object: {case_id}")
        elif result.get("status") in ("unsupported", "error"):
            _fields(result, {"id", "status", "reason"})
            if not isinstance(result["reason"], str) or not result["reason"]:
                raise ProtocolError(f"missing reason: {case_id}")
        else:
            raise ProtocolError(f"invalid result status: {case_id}")
        results[case_id] = result
    if set(results) != expected_ids:
        raise ProtocolError(f"missing results: {sorted(expected_ids - set(results))}")
    canonical(response)
    return results


def write_response(implementation, results):
    print(canonical({"version": 1, "implementation": implementation, "results": results}))
