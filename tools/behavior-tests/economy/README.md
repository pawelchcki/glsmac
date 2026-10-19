# Original economy script comparisons

This lane replays original executable observations through the shipped GSE
resource callback. It runs in the WASM interpreter without assets or pixels.
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
