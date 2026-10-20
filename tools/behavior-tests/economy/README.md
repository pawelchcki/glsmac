# Original economy script comparisons

This lane replays original executable observations through the shipped GSE
resource callback. It runs in the WASM interpreter without assets or pixels.
The passing catalog contains 1,080 original observations across the two bounded
contracts below.
It is separate from the native/WASM C++ helper lane; it does not claim a native
application run or complete economy parity.

## `economy.base_square_resources.v1`

All eight input fields are required: `faction_id`, `base_id`, `x`, `y`, `land`,
`river`, `headquarters`, `recycling_tanks`. Extra fields are rejected. The first
four are integers, with booleans and floats rejected; the last four are booleans.
Faction IDs are 1–7; base record IDs are exactly 0, 1 or 7; coordinates are exactly
(0,0) or (2,2) on a synthetic 4×4 staggered map. Terrain is bare land without a
river, bare land with a river, or sea without a river. Headquarters and Recycling
Tanks are independent flags. Output has exactly the integer fields `NUTRIENTS`,
`MINERALS`, `ENERGY`, in resource units per turn from this base square.

The 504 cases exhaust that input matrix. The original fixture supplies
base-square rules (2,1,1), resource-bonus rules (2,2,2), and tank rules (1,1,1).
The target base has one citizen. Omitted base/tile records are synthetic zeroes;
no special terrain, resource bonuses, terraforming, faction economy rating,
events, projects, other facilities or upkeep overrides are active. The fixture
sets each global read by these paths explicitly.

The reference calls original crop, mine and energy yield functions at
0x004E6E50, 0x004E7310 and 0x004E7750. Their permitted original dependencies are
tile-bonus lookup and facility bit lookup. Every resource query has a fresh
emulator. Reads are restricted to initialized fixture/stack bytes; writes are
restricted to the stack and the four-byte energy scratch cache at 0x0090E914.
The yield functions may reuse argument stack slots; the return slot, cdecl stack,
callee-preserved registers, code boundaries and execution budget remain checked.
Other reference contracts retain their read-only image and unchanged arguments.
The executable fingerprint is the same pinned GOG Alien Crossfire v2.0 binary
used by the other original comparisons. `compare.py record` requires two identical
independent runs; no candidate supplies reference answers.

This contract excludes worked-tile yields, special terrain, full base output,
resource consumption/support, production costs, construction, facility upkeep,
AI and social engineering. Replaying a handler with controlled native inputs
does not establish native input routing or rendering. Real construction and
resource changes are exercised separately through browser gameplay.

Capture observations using a caller-supplied unmodified executable:

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/economy/cases/base-square-resources.json \
  --command 'PATH/TO/REFERENCE/PYTHON tools/behavior-tests/original.py --exe ../smac-assets/terranx.exe' \
  --output tools/behavior-tests/economy/observations/smacx-gog-2.0-base-square-resources.json
```

Replay checked-in evidence after building the FastDebug engine once:

```sh
python3 tools/behavior-tests/economy/run.py --jobs 2
# or: npm --prefix tools/wasm-tests run test:economy-parity
```

The candidate receives only inputs, captures the production tile-resource
handler, and mocks the native registration, tile, base and player inputs. Each
batch runs in an isolated WASM filesystem with one immutable host script snapshot;
reports bind the script template and runtime JS/WASM hashes. Worker failures,
30-second timeouts, malformed/duplicate/reordered/missing results and runtime
drift fail the replay. Expected values never reach the GSE callback. The default
two workers replay all 504 observations in a few seconds without original assets.
CI requires this lane independently of the C++ helper and menu comparisons.

`--validate-only` checks evidence hashes without running the candidate and never
reports agreement. Selected `--case ID` replays still validate the full reference.
`generate_cases.py` regenerates only synthetic inputs and contains no answers.


## `economy.land_worker_resources.v1`

The 576 original queries cover a non-base land square on an explicit 4×4 map.
Inputs select faction 1 or 7, coordinates (0,0) or (2,2), rainfall and rockiness
0 through 2, one of eight improvement states, a default or altered rule profile,
and ownership of one declared synthetic cap technology. Faction 1 uses (0,0),
and faction 7 uses (2,2); these are paired inputs, not a cross-product of locations.
Rainfall 0/1/2 means arid/moist/rainy, and rockiness 0/1/2 means flat/rolling/rocky.
Candidate native descriptors use the engine's corresponding 1/2/3 ordinals.
Outputs are integer resource units per turn from the queried square. Improvement states are
bare, farm, mine, mine/road, farm/mine, farm/mine/road, forest and forest/road.
Rocky farm states are controlled editor-style inputs; this does not establish
that the original allows building a farm directly on rocky ground.

Each case queries original crop, mine and energy routines in fresh emulators.
The empty context base is elsewhere; the target tile has no base bit, river,
bonus, fungus or special terrain. The fixture explicitly supplies base/bonus/Tanks
rules, zero economy rating, absent facilities/projects/events, a valid synthetic
technology and its ownership mask. Crop/mine/energy may read only initialized
fixture/stack bytes. Writes are restricted to stack arguments and two declared
per-query scratch integers (energy and terraform reduction). Scratch values are
not outputs of this contract. The existing facility/bonus lookup routines and
original `has_tech` are the only permitted dependencies. No original dependency
is replaced with a calculated answer.

The default profile supplies forest (1,2,1), farm nutrient increment 1, the
mine-without-road rule 1, and mine nutrient effect -1. The altered profile supplies
forest (2,3,2), farm increment 2, mine rule 0 and mine nutrient effect 0. These are
input coefficients, not resource answers. All three original cap fields use the
same declared synthetic technology and ownership mask. Independent token ownership
is checked separately in application regressions. Food and mineral cases cross the cap;
forest energy inputs are only 1 and 2, so the energy-cap boundary is unobserved.
Two independent complete recordings agree. The reference SHA-256 is
`cc5fb5ef8504865cef6271f0959d74956d841d9125df3671c23669f2f2acec3c`.

Initial strict replay matched 132 and mismatched 444 cases, with zero unsupported
cases or errors. The production callback now matches all 576 unchanged outputs.
It consumes equivalent synthetic installed RESOURCEINFO/RULES text through the
native parser and shipped land-resource consumer. Tile/player/faction descriptors
and callback registration are controlled. The runner validates its own contract,
uses the same isolated worker protocol, and includes current source/runtime
hashes. Public CI requires both economy suites:

```sh
python3 tools/behavior-tests/economy/run.py --jobs 2
```

The application consumer imports forest RESOURCEINFO row 3, farm row 5 and RULES
rows 8, 9, 53, 54 and 55. Actual startup loads these from installed `alphax.txt`.
Mine rule inputs other than 0/1 are explicitly rejected. Concrete faction
starting-tech tokens provide current ownership; acquired research technologies
and their lifecycle remain unimplemented. Native faction regressions check
independent food/mineral gates and changing ownership. Browser checks use real
imported farm/forest/mine tiles, two native assigned workers, actual base labels,
and the following turn's food storage and production credit under both profiles.
Those application fixtures have a larger map and a real HQ; they are separate
from original query counts. The altered browser fixture uses `None` cap tokens
to permit the same yields as the owned synthetic technology.

Solar, fungus, sea, special terrain/bonuses, later facility/project effects,
complete base economy, unit terraforming orders, work progress, graphics changes
on completion and original map-loading climate behavior remain outside this
contract. Existing special-terrain additions are retained as application policy;
this suite does not establish their interactions with improvements.

Capture new evidence only from a caller-supplied pinned executable:

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/economy/cases/land-worker-resources.json \
  --command 'PATH/TO/REFERENCE/PYTHON tools/behavior-tests/economy/worker_resources_original.py --exe ../smac-assets/terranx.exe' \
  --output tools/behavior-tests/economy/observations/smacx-gog-2.0-land-worker-resources.json
```
