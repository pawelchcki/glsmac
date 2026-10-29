/** Pure policy: native code retains world state, ownership and commit authority. */
import {
  assertTileYieldInput,
  assertYieldResolutionInput,
} from "../generated/tile-yield.js";
import type {
  Caps,
  TileYieldInput,
  YieldPlan,
  Yields,
} from "../generated/tile-yield.js";
export type { TileYieldInput, Yields } from "../generated/tile-yield.js";

const resources = ["NUTRIENTS", "MINERALS", "ENERGY"] as const;
const max = (a: bigint, b: bigint): bigint => (a > b ? a : b);
const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);

/** GSE's signed integer division truncates toward zero, as BigInt division does. */
function prepare(input: TileYieldInput): YieldPlan {
  const { tile, rules, existing } = input;
  const {
    farm,
    mine,
    forest,
    solar,
    soil_enricher,
    condenser,
    borehole,
    road,
  } = tile.improvements;
  const result: Yields = { ...existing };
  const extra: Yields = {
    NUTRIENTS: (tile.bonuses.nutrient ? 2n : 0n) + (tile.jungle ? 1n : 0n),
    MINERALS: tile.bonuses.minerals ? 2n : 0n,
    ENERGY: (tile.bonuses.energy ? 2n : 0n) + (tile.river ? 1n : 0n),
  };
  for (const name of resources) result[name] -= extra[name];
  if (!tile.is_land) {
    if (rules.ocean === null)
      throw new Error("Ocean resource declaration is missing");
    for (const name of resources) result[name] = rules.ocean[name];
    if (farm || mine || solar) {
      if (rules.improved_sea === null)
        throw new Error("Sea improvement resource declaration is missing");
      if (farm) result.NUTRIENTS += rules.improved_sea.NUTRIENTS;
      if (mine)
        result.MINERALS +=
          rules.improved_sea.MINERALS + (input.sea_mine_bonus ? 1n : 0n);
      if (solar) result.ENERGY += rules.improved_sea.ENERGY;
    }
  } else if (borehole) {
    if (rules.borehole === null)
      throw new Error("Borehole resource declaration is missing");
    for (const name of resources) result[name] = rules.borehole[name];
  } else if (forest) {
    for (const name of resources) result[name] = rules.forest[name];
  } else {
    if ((farm || condenser) && tile.rockiness < 3n)
      result.NUTRIENTS += rules.farm_nutrients;
    if (soil_enricher && farm && tile.rockiness < 3n)
      result.NUTRIENTS += rules.farm_nutrients;
    if (solar)
      result.ENERGY +=
        min(4n, max(1n, 1n + tile.elevation / 1000n)) + input.mirrors;
    if (mine) {
      if (result.NUTRIENTS > 0n)
        result.NUTRIENTS = max(1n, result.NUTRIENTS + rules.mine_nutrients);
      const minerals = road
        ? tile.rockiness >= 3n
          ? 3n
          : 1n
        : rules.mine_without_road_limit + (tile.rockiness >= 3n ? 1n : 0n);
      result.MINERALS += minerals;
    }
  }
  return {
    uncapped: result,
    extra,
    needs_caps: {
      NUTRIENTS: result.NUTRIENTS > 2n,
      MINERALS: result.MINERALS > 2n,
      ENERGY: result.ENERGY > 2n,
    },
  };
}
function finish(plan: Readonly<YieldPlan>, caps: Readonly<Caps>): Yields {
  const result: Yields = { ...plan.uncapped };
  for (const name of resources) {
    if (result[name] > 2n && !caps[name]) result[name] = 2n;
    result[name] += plan.extra[name];
  }
  return result;
}
export function plan(input: unknown): YieldPlan {
  assertTileYieldInput(input);
  return prepare(input);
}
export function resolve(input: unknown): Yields {
  assertYieldResolutionInput(input);
  return finish(input.plan, input.caps);
}
export function apply(input: unknown): Yields {
  assertTileYieldInput(input);
  return finish(prepare(input), input.caps);
}
