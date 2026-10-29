/** Order policy consumes copied observations; the host owns identity and writes. */
import {
  assertOrderPlanInput,
  assertOrderValidationInput,
} from "../generated/unit-orders.js";
import type {
  OrderPlan,
  OrderValidationInput,
  OrderValidationResult,
} from "../generated/unit-orders.js";

function rejection(input: OrderValidationInput): string | null {
  if (!input.live) return "Unit identity is not live";
  if (input.caller === null || input.owner !== input.caller)
    return "Unit command requires its owner";
  if (!input.started || input.turn <= 0n || input.completed)
    return "Unit command requires an unfinished turn";
  if (input.health <= 0 || input.immovable)
    return "Unit cannot receive movement orders";
  if (input.locked) return "Unit tile is locked";
  if (input.movement_required && !input.needs_orders)
    return "Unit has no pending moves";
  return null;
}

export function validate(input: unknown): OrderValidationResult {
  assertOrderValidationInput(input);
  return { error: rejection(input) };
}

/** Recheck the snapshot before producing a plan, including direct apply calls. */
export function plan(input: unknown): OrderPlan {
  assertOrderPlanInput(input);
  const error = rejection(input.validation);
  if (error !== null) throw new Error(error);
  if (
    input.target !== "NO_ORDERS" &&
    input.target !== "HOLD" &&
    input.target !== "SENTRY"
  )
    throw new Error("Unsupported ordinary unit order");
  return {
    order: input.target,
    cancel_automation: input.has_automation,
    cancel_terraforming:
      !input.has_automation &&
      input.cancel_work &&
      input.original_order === "TERRAFORM",
  };
}
