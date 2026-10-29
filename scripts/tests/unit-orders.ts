import { plan, validate } from "../game/unit-orders.js";
import type { OrderValidationInput } from "../generated/unit-orders.js";

export function snapshot(): OrderValidationInput {
  return {
    schema: 1n,
    live: true,
    caller: 9007199254740993n,
    owner: 9007199254740993n,
    started: true,
    turn: 1n,
    completed: false,
    health: Math.fround(0.1),
    immovable: false,
    locked: false,
    needs_orders: true,
    movement_required: false,
  };
}

export function run(): bigint {
  let checks = 0n;
  const check = (condition: boolean, reason: string): void => {
    if (!condition) throw new Error(reason);
    checks += 1n;
  };
  const input = snapshot();
  check(validate(input).error === null, "Live owned unit must be eligible");
  const cases: readonly [Partial<OrderValidationInput>, string][] = [
    [{ live: false, caller: null }, "Unit identity is not live"],
    [{ caller: null, started: false }, "Unit command requires its owner"],
    [{ caller: 1n, locked: true }, "Unit command requires its owner"],
    [{ started: false, health: 0 }, "Unit command requires an unfinished turn"],
    [{ turn: 0n, locked: true }, "Unit command requires an unfinished turn"],
    [{ turn: -1n }, "Unit command requires an unfinished turn"],
    [
      { completed: true, immovable: true },
      "Unit command requires an unfinished turn",
    ],
    [{ health: 0, locked: true }, "Unit cannot receive movement orders"],
    [{ health: -1 }, "Unit cannot receive movement orders"],
    [{ immovable: true }, "Unit cannot receive movement orders"],
    [
      { locked: true, movement_required: true, needs_orders: false },
      "Unit tile is locked",
    ],
    [
      { movement_required: true, needs_orders: false },
      "Unit has no pending moves",
    ],
  ];
  for (const [change, expected] of cases) {
    const invalid = { ...input, ...change };
    check(
      validate(invalid).error === expected,
      "Guard reason or precedence changed",
    );
    let reason = "";
    try {
      plan({
        schema: 1n,
        validation: invalid,
        target: "HOLD",
        original_order: "NO_ORDERS",
        has_automation: false,
        cancel_work: false,
      });
    } catch (error) {
      if (error instanceof Error) reason = error.message;
    }
    check(reason === expected, "Apply must recheck the same guards");
  }
  check(
    validate({ ...input, needs_orders: false }).error === null,
    "Exhausted units can receive persistent orders",
  );
  for (const target of ["NO_ORDERS", "HOLD", "SENTRY"]) {
    for (const has_automation of [false, true]) {
      for (const cancel_work of [false, true]) {
        const result = plan({
          schema: 1n,
          validation: input,
          target,
          original_order: "TERRAFORM",
          has_automation,
          cancel_work,
        });
        check(result.order === target, "Target order changed");
        check(
          result.cancel_automation === has_automation,
          "Automation cancellation changed",
        );
        check(
          result.cancel_terraforming === (!has_automation && cancel_work),
          "Terraform cancellation precedence changed",
        );
      }
    }
  }
  const ordinary = {
    schema: 1n,
    validation: input,
    target: "HOLD",
    original_order: "SENTRY",
    has_automation: false,
    cancel_work: true,
  };
  check(
    !plan(ordinary).cancel_terraforming,
    "Ordinary orders must not cancel unrelated work",
  );
  let unsupported = "";
  try {
    plan({ ...ordinary, target: "TERRAFORM" });
  } catch (error) {
    if (error instanceof Error) unsupported = error.message;
  }
  check(
    unsupported === "Unsupported ordinary unit order",
    "Unsupported targets must be rejected",
  );
  for (const invalid of [
    { ...input, schema: 2n },
    { ...input, caller: 1 },
    { ...input, owner: 1n << 63n },
    { ...input, health: 0.1 },
    { ...input, health: NaN },
    { ...input, health: Infinity },
    { ...input, extra: true },
    { ...input, locked: 1n },
  ]) {
    let rejected = false;
    try {
      validate(invalid);
    } catch {
      rejected = true;
    }
    check(rejected, "Malformed snapshot accepted");
  }
  check(
    input.health === Math.fround(0.1) && input.owner === 9007199254740993n,
    "Policy mutated its input",
  );
  return checks;
}
