# Bounded original behavior contracts

The seven contracts below have original executable observations and production
GLSMAC implementations exercised by the native and WASM candidate adapter.
Agreement is bounded to the recorded cases and fixtures described here.
Each reference probe executes only its
verified original function and permitted original dependencies; game image data
is read-only, data reads are restricted to the declared fixture, and every case
uses a fresh emulator and stack. No Windows or game startup state is inherited.

All fields are required and additional fields are rejected. Integer fields
reject JSON booleans and floats. Outputs contain exactly the indicated field.
The executable fingerprint and emulator version belong to each observation
file. The fixtures describe synthetic state, not the shipped rules database.

## `map.vector_distance.v1`

Input: `{width, height, flat, x1, y1, x2, y2}`.

- `width`: even integer, 4 through 4096, in original horizontal coordinate units.
- `height`: integer, 2 through 4096, in original row coordinate units.
- `flat`: boolean; selects a flat map or a horizontally wrapping round map.
- Each `x` is in `[0, width)` and each `y` is in `[0, height)`. A valid tile has
  equal parity for its `x` and `y`. The two tiles may lie on different rows.
- The fixture initializes the original map width, half-width and shape flag.
  Height bounds the synthetic coordinates; this helper reads no height global.

Output: `{distance: integer}`, the unconverted signed 32-bit return value of
original `vector_dist_2` at `0x005A5910`. Its unit is the original vector score.
It must not be equated with tile steps, movement cost, Euclidean distance, or
the normalized same-row contract. Two horizontal coordinate units describe one
same-row tile spacing in the inputs; the return value is not normalized by two.

The suite includes every ordered tile pair on a 4 by 4 map in both shapes,
different rows, axis and diagonal cases, both wrap directions, half-width
boundaries and large valid coordinates. Terrain, movement and AI decisions are
outside the contract.

## `map.raw_vector_distance.v1`

Input: `{dx, dy}`, with each signed integer from -4095 through 4095. These are
deltas in original horizontal and row coordinate units. The raw helper accepts
vectors of either parity; an input need not connect two valid tiles.

Output: `{distance: integer}`, the unconverted signed 32-bit original vector
score returned by `vector_dist` at `0x004F8090`. No map globals, coordinate
conversion or horizontal wrapping are supplied. The result has the same raw
score units as the coordinate helper, with a different input boundary.

The suite exhausts the 11 by 11 integer delta grid from -5 through 5 and adds
large signed coordinates and uneven components. It tests integer rounding,
component order and sign changes without asserting a distance formula.

## Shared technology fixture

Technology table IDs are 0 through 88. A sparse row is
`{id, prerequisites: [first, second], owners}`. Each prerequisite is an integer
from -2 through 88; negative values are sentinel fixture values. `owners` is an
integer from 0 through 255, representing the original one-byte faction mask;
bit positions correspond to faction IDs. Duplicate table IDs are invalid.

Every omitted technology row has prerequisites `[-2, -2]`, ownership mask zero,
and zero in its remaining scalar fields. Explicit rows override just their two
prerequisite fields and ownership byte. The table is independently reset for
each case. Faction IDs range from 0 through 7; zero exercises the native-life
slot and 1 through 7 exercise playable slots. These probes do not initialize
factions, research progress, facilities, diplomacy or any rules text.

## `technology.has_tech.v1`

Input: `{tech_id, faction_id, prerequisites, owners}`. `tech_id` is an integer
from -2 through 89, `faction_id` ranges from 0 through 7, and the other fields
follow the shared technology fixture. For an in-table ID, the fixture writes
that row and leaves all others at the shared defaults. For an out-of-table
sentinel/boundary ID, no technology row is overridden.

Output: `{has_tech: boolean}`, the original `has_tech` result at `0x005B9F20`.
The suite includes sentinel IDs, the upper table boundary, valid and disabled
prerequisite combinations, every faction slot, exact ownership bits and their
complements. Possession is a separate contract from research availability.

## `technology.category.v1`

Input: `{weights: [growth, technology, wealth, power]}`. Each signed integer is
from -32768 through 32767. The four values populate the corresponding original
technology AI weight fields in table row zero.

Output: `{category: integer}`, the zero-based category index returned by
`tech_category` at `0x005B9FE0`, in the input field order. The suite exhausts
the 81 weight combinations over `{0, 1, 2}` and includes negative values,
integer boundaries, and ties in different positions. This helper classifies
synthetic weights; it does not exercise AI research selection or AI turns.

## `technology.available.v1`

Input: `{tech_id, faction_id, expansion_enabled, technologies}`. `tech_id` ranges
from 0 through 88, `faction_id` ranges from 0 through 7,
`expansion_enabled` is boolean, and `technologies` is a sparse list of at most
89 shared fixture rows. The expansion flag is initialized explicitly.

Output: `{available: boolean}`, the original `tech_avail` result at
`0x005BAC20`. Cases vary direct prerequisite sentinels, target ownership,
prerequisite ownership and validity, playable/native-life slots, technology IDs
near expansion and table boundaries, and both expansion settings. The contract
covers only this predicate; it does not promise a complete list of research
choices, evaluate desirability or consume research points.

## `technology.prerequisite.v1`

Input: `{ancestor_id, tech_id, max_depth, technologies}`. Both queried IDs are
integers from -2 through 88; `max_depth` ranges from 0 through 5;
`technologies` follows the shared sparse fixture. Cycles are permitted because
the original call has an explicit bounded depth argument. Ownership fields are
still supplied as part of the complete shared row fixture.

Output: `{is_prerequisite: boolean}`, the original `tech_is_preq` result at
`0x005BCB60` for those exact arguments. Cases include empty tables, first- and
second-branch chains, diamonds, disconnected graphs, self and two-node cycles,
depth limits, identity queries, negative sentinels and upper table IDs.
Unbounded reachability, full shipped technology trees and research planning are
outside the contract. The instruction budget is independently capped even for
cyclic fixtures.

## `economy.human_mineral_factor.v1`

Input: `{faction_id, map_size_level, mineral_rule_factor, industry}`.

- `faction_id`: integer 1 through 7, the original faction-mask bit position.
- `map_size_level`: integer 0 through 4, the raw map preset level. This is not
  a width, height or tile count.
- `mineral_rule_factor`: integer 1 through 100, the configured integer mineral
  cost multiplier, supplied explicitly rather than inherited from rules text.
- `industry`: signed integer -8 through 10, the queried faction's social rating.

Output: `{factor: integer}`, the original `cost_factor` result at `0x004E4430`
in mineral mode with base ID -1. It is a cost factor, not an item's total cost.
Zero results for small synthetic multipliers are retained exactly.

The fixture marks only the queried faction as human and initializes every data
read on this path: human faction status, mineral rule multiplier, map preset
level and that faction's industry field. No AI or difficulty branch executes;
no base is supplied. Cases cover all seven playable faction slots, map presets,
industry boundaries, small multipliers and integer rounding. Each capture starts
from fresh original instructions and synthetic state.

AI/difficulty modifiers, nutrient/growth factors, per-base effects, facilities,
the shipped rules database, complete item costs and turn production are outside
this contract. The GLSMAC helper is independently replayed on native and WASM;
this transfer does not yet change the shipped Recycling Tanks cost or implement
social engineering.

## Evidence files

| Suite | Contracts | Cases | Original observations |
| --- | --- | ---: | --- |
| `cases/map-vector.json` | Both vector helpers | 296 | `observations/smacx-gog-2.0-map-vector.json` |
| `cases/technology.json` | Four technology helpers | 632 | `observations/smacx-gog-2.0-technology.json` |
| `cases/human-mineral-factor.json` | Human mineral cost factor without a base | 764 | `observations/smacx-gog-2.0-human-mineral-factor.json` |

All files are captured with `compare.py record`, requiring two identical runs
and binding every case and its input hash. No expected output is calculated by
the case author or the candidate. Existing same-row distance evidence remains
separate and unchanged.
