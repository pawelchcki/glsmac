"""Shared scenario/state-trace framework (algorithm game.state_trace.v1)."""

from state_trace.compare import compare_outputs, compare_states, compare_suite, select_cases
from state_trace.schema import (
    ALGORITHM,
    expected_plan,
    validate_input,
    validate_output,
    validate_reference_output,
    validate_reference_plan,
)

__all__ = [
    "ALGORITHM",
    "compare_outputs",
    "compare_states",
    "compare_suite",
    "expected_plan",
    "select_cases",
    "validate_input",
    "validate_output",
    "validate_reference_output",
    "validate_reference_plan",
]
