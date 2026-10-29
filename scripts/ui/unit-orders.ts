/** Copied UI observations only; native entities and UI lifetimes stay with the host. */
import {
  assertUnitActivationGateInput,
  assertUnitOrderMatchInput,
  assertUnitOrderMenuInput,
  assertUnitOrderSelectionInput,
} from "../generated/unit-order-ui.js";
import type {
  UnitOrderMatch,
  UnitOrderSelection,
  UnitOrderUiDecision,
} from "../generated/unit-order-ui.js";

/** A malformed, foreign or unrelated completion cannot release a pending control. */
export function match(input: unknown): UnitOrderMatch {
  assertUnitOrderMatchInput(input);
  const { pending, event, owner } = input;
  const matched =
    pending !== null &&
    pending.name !== "unit_disband" &&
    pending.name !== "unit_disband_draft" &&
    event.name === pending.name &&
    event.caller === owner &&
    event.unit_id === pending.unit_id &&
    event.success !== null &&
    (pending.name !== "unit_terraform" ||
      (event.action !== null && event.action === pending.action)) &&
    (pending.name !== "unit_terraform_plan" ||
      (event.command !== null && event.command === pending.command));
  return { matched, succeeded: matched && event.success };
}

/** Called only after a successful result and an authoritative live-unit lookup. */
export function selection(input: unknown): UnitOrderSelection {
  assertUnitOrderSelectionInput(input);
  const activating = input.name === "unit_activate";
  const clear = !activating && input.selected === input.unit_id;
  return {
    select_unit:
      activating &&
      (input.selected === input.unit_id ||
        (input.selected === null && input.focus === input.unit_id)),
    clear_selection: clear,
    // The host preserves frontend ready-unit selection; only an idle roster
    // selects the completed unit's actual tile.
    select_idle_tile: clear,
  };
}

/** Native callback tokens are checked before observing this dialog context. */
export function activationGate(input: unknown): UnitOrderUiDecision {
  assertUnitActivationGateInput(input);
  return {
    accepted:
      input.choice !== null &&
      input.turn_active &&
      !input.pending &&
      !input.founding_pending &&
      !input.popup &&
      input.turn === input.request_turn &&
      input.owner === input.request_owner &&
      input.selected === input.request_selected &&
      input.focus === input.request_focus,
  };
}

export function closeMenu(input: unknown): UnitOrderUiDecision {
  assertUnitOrderMenuInput(input);
  return {
    accepted:
      input.success && input.root_open && input.child_open && !input.popup,
  };
}
