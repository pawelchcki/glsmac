import {
  activationGate,
  closeMenu,
  match,
  selection,
} from "../ui/unit-orders.js";
import type {
  PendingUnitOrder,
  UnitActivationGateInput,
  UnitOrderMatchInput,
  UnitOrderMenuInput,
  UnitOrderSelectionInput,
} from "../generated/unit-order-ui.js";

const owner = 9007199254740993n;
const unit = 9223372036854775807n;
function result(): UnitOrderMatchInput & { pending: PendingUnitOrder } {
  return {
    schema: 1n,
    owner,
    pending: { name: "unit_hold", unit_id: unit, action: null, command: null },
    event: {
      name: "unit_hold",
      caller: owner,
      unit_id: unit,
      action: null,
      command: null,
      success: true,
    },
  };
}
function activation(): UnitActivationGateInput {
  return {
    schema: 1n,
    choice: unit,
    turn_active: true,
    pending: false,
    founding_pending: false,
    popup: false,
    turn: 2n,
    owner,
    selected: null,
    focus: unit,
    request_turn: 2n,
    request_owner: owner,
    request_selected: null,
    request_focus: unit,
  };
}

export function run(): bigint {
  let checks = 0n;
  const check = (condition: boolean, reason: string): void => {
    if (!condition) throw new Error(reason);
    checks += 1n;
  };
  const reject = (callback: () => unknown): void => {
    let rejected = false;
    try {
      callback();
    } catch {
      rejected = true;
    }
    check(rejected, "Malformed copied UI record must be rejected");
  };
  for (const name of [
    "unit_hold",
    "unit_sentry",
    "unit_activate",
    "unit_skip_turn",
    "unit_terraform",
    "unit_terraform_plan",
  ]) {
    const data = result();
    const pending = {
      ...data.pending,
      name,
      action: "farm",
      command: "auto_former",
    };
    const event = {
      ...data.event,
      name,
      action: "farm",
      command: "auto_former",
    };
    const input = { ...data, pending, event };
    const accepted = match(input);
    check(
      accepted.matched && accepted.succeeded,
      "Successful own completion must match",
    );
    check(
      match({ ...input, event: { ...event, success: false } }).matched,
      "Rejected command must release matching pending UI",
    );
    check(
      !match({ ...input, event: { ...event, success: false } }).succeeded,
      "Rejected command must never select",
    );
    for (const change of [
      { name: null },
      { name: "other" },
      { caller: null },
      { caller: owner - 1n },
      { unit_id: null },
      { unit_id: unit - 1n },
      { success: null },
    ]) {
      const actual = match({ ...input, event: { ...event, ...change } });
      check(
        !actual.matched && !actual.succeeded,
        "Unrelated or malformed completion must retain pending UI",
      );
    }
    if (name === "unit_terraform") {
      for (const action of [null, "road"])
        check(
          !match({ ...input, event: { ...event, action } }).matched,
          "Wrong primitive must not complete work",
        );
    }
    if (name === "unit_terraform_plan") {
      for (const command of [null, "auto_roads"])
        check(
          !match({ ...input, event: { ...event, command } }).matched,
          "Wrong automation command must not complete work",
        );
    }
    const frozen = Object.freeze({
      ...input,
      pending: Object.freeze(pending),
      event: Object.freeze(event),
    });
    match(frozen);
    check(
      frozen.pending.name === name && frozen.event.success === true,
      "Copied matching inputs remain unchanged",
    );
  }
  check(
    !match({ ...result(), pending: null }).matched,
    "No pending command must remain inert",
  );
  for (const name of ["unit_disband", "unit_disband_draft"]) {
    const data = result();
    check(
      !match({
        ...data,
        pending: { ...data.pending, name },
        event: { ...data.event, name },
      }).matched,
      "Retirement belongs to its existing controller",
    );
  }

  const select: UnitOrderSelectionInput = {
    schema: 1n,
    name: "unit_hold",
    unit_id: unit,
    selected: unit,
    focus: unit,
  };
  for (const name of [
    "unit_hold",
    "unit_sentry",
    "unit_skip_turn",
    "unit_terraform",
    "unit_terraform_plan",
  ]) {
    check(
      selection({ ...select, name }).clear_selection,
      "Completed selected order must release selection",
    );
    check(
      selection({ ...select, name }).select_idle_tile,
      "Completed selected order may fall back to actual idle tile",
    );
    check(
      !selection({ ...select, name }).select_unit,
      "Ordinary completion must not reactivate",
    );
    for (const selected of [null, unit - 1n]) {
      const actual = selection({ ...select, name, selected });
      check(
        !actual.clear_selection &&
          !actual.select_unit &&
          !actual.select_idle_tile,
        "Completion must retain a later frontend selection",
      );
    }
  }
  for (const [selected, focus, expected] of [
    [unit, unit, true],
    [unit, null, true],
    [null, unit, true],
    [null, null, false],
    [null, unit - 1n, false],
    [unit - 1n, unit, false],
  ] as const) {
    const actual = selection({
      ...select,
      name: "unit_activate",
      selected,
      focus,
    });
    check(
      actual.select_unit === expected &&
        !actual.clear_selection &&
        !actual.select_idle_tile,
      "Activation must use exact selected/focused identity",
    );
  }

  const gate = activation();
  check(
    activationGate(gate).accepted,
    "Unchanged live activation context must accept",
  );
  for (const change of [
    { choice: null },
    { turn_active: false },
    { pending: true },
    { founding_pending: true },
    { popup: true },
    { turn: 3n },
    { owner: owner - 1n },
    { selected: unit },
    { focus: null },
    { focus: unit - 1n },
    { request_turn: 1n },
    { request_owner: owner - 1n },
    { request_selected: unit },
    { request_focus: unit - 1n },
  ])
    check(
      !activationGate({ ...gate, ...change }).accepted,
      "Changed dialog context must reject",
    );
  check(
    activationGate({ ...gate, selected: unit, request_selected: unit })
      .accepted,
    "Exact retained selection may activate",
  );

  const menu: UnitOrderMenuInput = {
    schema: 1n,
    success: true,
    root_open: true,
    child_open: true,
    popup: false,
  };
  check(
    closeMenu(menu).accepted,
    "Successful visible menu completion closes active menu",
  );
  for (const change of [
    { success: false },
    { root_open: false },
    { child_open: false },
    { popup: true },
  ]) {
    check(
      !closeMenu({ ...menu, ...change }).accepted,
      "Failure or changed menu/modal state must retain presentation",
    );
  }

  for (const input of [
    { ...result(), schema: 2n },
    { ...result(), owner: Number(owner) },
    { ...result(), event: { ...result().event, success: 1 } },
    { ...result(), pending: { ...result().pending, unit_id: 1n << 63n } },
    { ...result(), event: { ...result().event, unit_id: Number(unit) } },
    { ...result(), extra: true },
  ])
    reject(() => match(input));
  reject(() => selection({ ...select, selected: Number(unit) }));
  reject(() => selection({ ...select, schema: 0n }));
  reject(() => activationGate({ ...gate, choice: Number(unit) }));
  reject(() => activationGate({ ...gate, turn_active: 1 }));
  reject(() => activationGate({ ...gate, request_turn: 1n << 63n }));
  reject(() => closeMenu({ ...menu, popup: null }));
  reject(() => closeMenu({ ...menu, extra: false }));
  return checks;
}
