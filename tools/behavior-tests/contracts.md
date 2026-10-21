# Bounded original behavior contracts

The nine contracts below have original executable observations and production
GLSMAC implementations exercised by the native and WASM candidate adapter.
Agreement is bounded to the recorded cases and fixtures described here.
Each reference probe executes only its
verified original function and permitted original dependencies; game image data
for these C++ helper contracts is read-only, data reads are restricted to the
declared fixture, and every case uses a fresh emulator and stack. No Windows or game startup state is inherited.

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

## Calibrated human cost factors (v2)

`economy.human_nutrient_factor.v2` takes `{faction_id, map_size_level,
nutrient_rule_factor, growth}`. `economy.human_mineral_factor.v2` takes
`{faction_id, map_size_level, mineral_rule_factor, industry}`. Each returns
`{factor: integer}` from actual original `cost_factor` at `0x004E4430` with
base ID -1. Faction IDs are 1..7, named preset levels are 0..4, rule multipliers
are 1..100, and signed rating probes are -8..10. These are factors, not complete
population/item prices. Exact zeros remain observable.

The [initialized social-rating contract](ui/faction-ratings-contract.md)
calibrates names against actual original UI and distinct rule-source overrides:

| Resource | Mode | Rating field (+ faction*0x20CC) | Rule field |
| --- | ---: | --- | --- |
| Nutrients / GROWTH | 0 | 0x0096CC44 | 0x00949750 |
| Minerals / INDUSTRY | 1 | 0x0096CC50 | 0x00949754 |

The historical v1 adapter used the opposite symbolic names. Its inputs and
observations are preserved byte for byte in `factor-v1-historical-catalog.json`.
They remain available for raw numeric replay but are superseded and excluded
from the default passing totals. New v2 answers execute the original again in
two independent identical runs; no old expected answer is renamed or edited.

The v2 nutrient suite has 764 cases. The mineral suites have 4,655 matrix cases
and 1,024 seeded cases with other multipliers. There are also 24 Custom-kind
cases (below) and 20 explicit zero-rating witnesses for installed-rule application tests. Every fixture supplies the queried human mask, raw rule globals,
map kind and rating field. Mode1 preserves the pinned executable's own switch-table bytes from the local verified image; no original bytes are committed.
Existing read/write, instruction, stack and return guards remain enforced.

Native and WASM replay call the same production `NutrientCost.h` and
`ProductionCost.h` helpers. The application now imports initial faction SOCIAL
GROWTH/INDUSTRY from installed faction files and uses them for supported human
owners with known map provenance. Declared mineral rows, growth population rows,
world generation, turn events and UI are separate application checks.

Social-policy choices, other faction bonuses, AI/difficulty, per-base effects,
population booms and whole-item original construction remain outside these
helper contracts. Probe bounds are controlled numeric experiments, not a claim
that every rating is reachable through ordinary play.

## `unit.prototype_base_cost.v1`

Input: `{chassis_id, weapon_id, armor_id, triad, chassis_cost, missile,
offense, weapon_mode, weapon_cost, armor_cost, reactor}`.

- Table slots: chassis ID 0 through 8, weapon ID 0 through 25, armor ID 0
  through 13. These select synthetic original table records; they are not
  semantic component types supplied by the candidate.
- `triad`: integer 0 (land), 1 (sea), or 2 (air).
- Each component cost: integer 1 through 32.
- `missile`: boolean; `offense`: signed integer -1 through 127.
- `weapon_mode`: integer 0 through 14; `reactor`: integer 1 through 4.

Output: `{rows: integer}`, the original `proto_cost` result at `0x005A5A60`
with ability mask fixed to zero. Rows precede map/faction mineral factors and
prototype surcharges; they are not the final mineral cost of a built unit.

Every case resets the selected chassis, weapon and armor records in a fresh
emulator. Only the declared component fixture bytes may be read. Original
instructions may reuse argument stack slots; the return address, stack balance,
preserved registers, code/data boundaries and execution budgets remain checked.
The executable image remains read-only and no original dependencies are replaced.

The 5,531 observations include component matrices, cost/reactor boundaries,
missile offense boundaries, slot independence, dense chassis and sea mode11
sweeps, and 1,024 independently seeded samples captured after the candidate
source was frozen. Three additional infantry fixtures check Colony Pod, Former and
Scout component recipes at Fission power, observing 3, 2 and 1 base rows
respectively. These are component calculations, not whole-item construction
observations. Every suite was recorded twice. These samples do not exhaust
the valid input domain. Native and WASM replay call the same production header,
`src/game/backend/unit/PrototypeCost.h`.
The actual unit manager exposes the same read-only helper as
`get_prototype_base_cost(chassis_cost, triad, missile, offense, weapon_mode,
weapon_cost, armor_cost, reactor)`. The binding rejects out-of-contract values,
types and argument counts before computation; the native regression suite also
checks unchanged world snapshots after recorded witness queries.

Abilities, design legality and availability, the shipped component database,
full prototype surcharges, actual construction, and design UI remain outside
this contract.

## Basic production switch loss

`economy.basic_production_switch_loss.v1` takes `{base_id, faction_id,
previous_item, current_item, minerals}`. Base IDs are 0..7; the selected owner is
explicitly human, faction 1..7. Item codes -64..-1 represent basic facilities;
0..511 represent unit slots. Mineral storage is an integer 0..1,000,000. Item
availability, ownership and design legality are outside this helper contract.

The fixture sets default retool strictness 2, penalty 50 percent and a
10-mineral exemption. No facilities, including Skunkworks, are installed.
Each case supplies the previous and current item fields of the selected base,
then executes original `base_lose_minerals` at `0x004E4810`, original `cost_mode`
at `0x004E4700` and the original facility-bitfield dependency at `0x0050BA00`.
No dependency answers are substituted. Code and declared data reads, read-only
image/fixture memory, stack, preserved registers and execution limits remain
guarded. Output `{lost: integer}` is lost minerals; it is not a complete project
switch, UI interaction or state mutation.

The 2,016 repeated original observations are in
`cases/basic-production-switch-loss.json` and
`observations/smacx-gog-2.0-basic-production-switch-loss.json`. They cover same
and differing basic items, threshold/rounding neighbors, two base slots, all
seven human factions and large safe inputs. Projects, orbital facilities,
Stockpile Energy, AI, installed facilities, modified retool rules and original
signed multiplication overflow are excluded. Another 512 independently seeded
cases were recorded twice after the candidate header was frozen, covering all
base slots and additional differing item codes. All 2,528 observations match the
shared production `ProductionSwitchCost.h` helper on native and WASM. These
samples do not exhaust the input domain.

## Evidence files

| Suite | Contracts | Cases | Original observations |
| --- | --- | ---: | --- |
| `cases/map-vector.json` | Both vector helpers | 296 | `observations/smacx-gog-2.0-map-vector.json` |
| `cases/technology.json` | Four technology helpers | 632 | `observations/smacx-gog-2.0-technology.json` |
| `cases/human-mineral-factor.json` | Human mineral cost factor without a base | 764 | `observations/smacx-gog-2.0-human-mineral-factor.json` |
| `cases/human-nutrient-factor.json` | Human nutrient factor without a base | 4,655 | `observations/smacx-gog-2.0-human-nutrient-factor.json` |
| `cases/human-nutrient-factor-held-out.json` | Human nutrient factor, post-freeze samples | 1,024 | `observations/smacx-gog-2.0-human-nutrient-factor-held-out.json` |
| `cases/prototype-base-cost.json` | Ability-free prototype mineral rows | 2,456 | `observations/smacx-gog-2.0-prototype-base-cost.json` |
| `cases/prototype-cost-chassis-sweep.json` | Ability-free prototype mineral rows | 1,536 | `observations/smacx-gog-2.0-prototype-cost-chassis-sweep.json` |
| `cases/prototype-cost-sea-mode11.json` | Ability-free prototype mineral rows | 512 | `observations/smacx-gog-2.0-prototype-cost-sea-mode11.json` |
| `cases/prototype-cost-held-out.json` | Ability-free prototype mineral rows | 1,024 | `observations/smacx-gog-2.0-prototype-cost-held-out.json` |
| `cases/basic-production-switch-loss.json` | Human basic-item switching loss, default retool rules | 2,016 | `observations/smacx-gog-2.0-basic-production-switch-loss.json` |
| `cases/basic-production-switch-loss-held-out.json` | Basic-item switch loss, post-freeze samples | 512 | `observations/smacx-gog-2.0-basic-production-switch-loss-held-out.json` |
| `cases/starting-unit-components.json` | Starting infantry component mineral rows | 3 | `observations/smacx-gog-2.0-starting-unit-components.json` |

All files are captured with `compare.py record`, requiring two identical runs
and binding every case and its input hash. No expected output is calculated by
the case author or the candidate. Existing same-row distance evidence remains
separate and unchanged.

## Base-square resource script contract

`economy.base_square_resources.v1` is a separate production GSE callback contract.
Its 504 original observations and exact fixture are documented in
[economy/README.md](economy/README.md). It compares per-turn base-square nutrient,
mineral and energy returns across selected base records, positions, land/sea,
river, Headquarters and Recycling Tanks flags. The reference permits only an
explicit four-byte energy scratch write; return address, preserved registers,
code/read/write boundaries and execution budgets remain guarded.

Replay uses the real WASM GSE interpreter and shipped resource handler with
controlled native inputs, without assets or pixels. It is not included in the
15,544-case native/WASM C++ helper totals and does not establish native application
execution, worked-tile yields, construction costs or complete base economy.

## Fixed Custom map factors

`economy.custom_map_nutrient_factor.v2` and
`economy.custom_map_mineral_factor.v2` use the corresponding v2 inputs without
`map_size_level`; native kind99 is explicit. The 24 fresh original cases cover
selected signed ratings and multipliers, including exact zero factors. These
exclude ordinary custom-dialog navigation, terrain, AI and per-base effects.
Their historical v1 predecessors remain only in the provenance catalog.

## Bounded Former work state

`game.former_work.v1` compares native work orders, movement spent in thirds,
work counters and four improvement flags at every action checkpoint. Six
independently repeated original traces cover edited mine completion, normal
farm cancellation/resume, ordinary Road, edited Forest completion, retained-work
task switching and accepted Farm-to-Forest replacement on flat arid non-base
land with one healthy ordinary Former. All match the production work scripts, actual native unit/tile state
and native turn advancement without graphics or original assets. Synthetic
equivalent installed declarations, initial placement and explicit turn
acknowledgements are fixture inputs. They do not compute work effects.

This is separate from the C++ helper totals and establishes no parity for
other terrain, partial movement, advanced abilities, multiple workers,
replacement dialogs or UI labels. See [the exact contract](ui/former-work-contract.md).

## Bounded in-game menu presentation

`ui.ingame_menu_trace.v1` compares twelve independently repeated original traces
and 63 native/visible checkpoints in one declared healthy Scout/Former/Colony
Headquarters fixture. It covers all nine root headers, source-driven labels,
ordered child rows, separators, light/dark text classes, child Escape, switching
and the MENU toggle. An edited GAME title and two source rows establish source
consumption. Identical synthetic menu and TERRAIN declarations feed both apps.

The [exact contract](ui/ingame-menus-contract.md) describes native state guards,
normalization and display/event boundaries. Display-free replay executes the
production GSE controls and native parser; the browser lane drives real pointer
controls and SDL Escape. This presentation contract excludes row effects,
accelerator binding, enabled semantics, other game contexts and complete menu/game parity. These
cases are separate from the native/WASM C++ helper totals.

`ui.unit_menu_orders.v1` records six Action-menu source-slot command sequences
under two synthetic source profiles, with thirty menu/native checkpoints and
two independent original captures. Slots 26/29/30 observe Sentry/Hold/Skip and
the subsequent Tab path. The [exact contract](ui/unit-menu-orders-contract.md)
limits the claim to the declared healthy, unspent Scout and unchanged city/year.
The frozen pre-fix candidate retains six mismatches and no probe errors. All six
now match production/native display-free replay and actual browser pointer/SDL
Tab controls. Nineteen application scenarios/443 assertions separately cover
source identity, existing order handlers, native receipt authority, failed
submissions, popup/pending guards, stale callbacks and context row restoration.
The separate fresh-worker `unit-menu-context-orders` application regression adds
one Former/Hold restoration scenario and eleven assertions.
The complete [Action-menu context reference](ui/unit-menu-context-contract.md)
contains twelve independently repeated inputs and 78 complete checkpoints:
Former and Colony Sentry/Hold/Skip under synthetic and edited source wording.
All twelve match strict current-production/native replay. Five selected context
cases have actual browser pointer/SDL verification; this does not claim a full
twelve-case rendered replay. The Former/Colony Action children retain twenty and
twenty-two rows with observed light source labels and four/five separators.
The full reference supersedes three immutable pilots: nine additional inputs
are counted, with no duplicate pilot passes. Other rows, initial orders, spent
movement, active work and turn effects remain outside the contract.
