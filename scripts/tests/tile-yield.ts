import { apply } from "../game/land-resource-yields.js";
import type { TileYieldInput } from "../generated/tile-yield.js";

export function snapshot(): TileYieldInput {
  return {
    schema: 1n,
    tile: {
      is_land: true,
      rockiness: 1n,
      elevation: 1362n,
      jungle: false,
      river: false,
      bonuses: { nutrient: false, minerals: false, energy: false },
      improvements: {
        farm: true,
        mine: false,
        forest: false,
        solar: false,
        soil_enricher: false,
        condenser: false,
        borehole: false,
        road: false,
      },
    },
    rules: {
      forest: { NUTRIENTS: 1n, MINERALS: 2n, ENERGY: 1n },
      ocean: { NUTRIENTS: 1n, MINERALS: 0n, ENERGY: 0n },
      improved_sea: { NUTRIENTS: 2n, MINERALS: 1n, ENERGY: 3n },
      borehole: { NUTRIENTS: 0n, MINERALS: 6n, ENERGY: 6n },
      farm_nutrients: 1n,
      mine_nutrients: -1n,
      mine_without_road_limit: 1n,
    },
    existing: { NUTRIENTS: 2n, MINERALS: 0n, ENERGY: 0n },
    caps: { NUTRIENTS: true, MINERALS: true, ENERGY: true },
    sea_mine_bonus: false,
    mirrors: 0n,
  };
}

export function run(): void {
  const input = snapshot();
  if (apply(input).NUTRIENTS !== 3n || input.existing.NUTRIENTS !== 2n)
    throw new Error("Farm policy or copied ownership changed");
  const solar = {
    ...input,
    tile: {
      ...input.tile,
      improvements: { ...input.tile.improvements, farm: false, solar: true },
    },
  };
  if (apply(solar).ENERGY !== 2n)
    throw new Error("Solar integer elevation division changed");
  if (
    apply({ ...input, caps: { ...input.caps, NUTRIENTS: false } }).NUTRIENTS !==
    2n
  )
    throw new Error("Owner resource cap changed");
  for (const invalid of [
    { ...input, schema: 2n },
    { ...input, mirrors: 1 },
    { ...input, extra: true },
  ]) {
    let rejected = false;
    try {
      apply(invalid);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("Malformed resource snapshot accepted");
  }
}
