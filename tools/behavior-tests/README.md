# Original-game behavior comparisons

This harness lets reference research produce tests and lets implementation work
fill them. The reference runner executes a narrowly selected function from a
locally supplied original executable. The candidate runner calls production
GLSMAC code. Only synthetic inputs, observed outputs, build fingerprints and
test infrastructure belong in this directory.

For automatic discovery and replay of **real application UI flows**, including
menu choices, selection defaults, keyboard navigation and cancellation, use the
[dual-application UI harness](ui/README.md). Its default replay executes production
GSE menus and native-backed citizen/unit controls without graphics against 355 recorded original cases. The original
custom-map controller also executes headlessly in Unicorn; an optional
Wine/Chromium lane discovers and checks rendered controls. The strict recorder
requires independent repeated original runs. This is separate from both the
helper contracts and the display-free GLSMAC-only regressions below.
[properties.json](properties.json) tracks the wider transfer scope and explicit
gaps; existing passing case totals do not imply complete SMAC parity.

## Fast parallel gameplay and UI checks

Build the FastDebug WASM app once using [the browser build instructions](../../web/README.md).
After that, changing GSE tests or production GSE scripts needs **no relink**:

```sh
npm --prefix tools/wasm-tests run test:fast -- --jobs 4
```

The current passing lane contains **867 scenarios and 6,417 assertions** across
70 suites. It exercises production movement/combat/spawn events, deterministic
random draws and rollback, base growth/starvation and worker decisions, menus,
map/faction selection, base navigation, turn controls, popups, prompts, timer
cleanup, terrain labels, the visible Skip Turn action, geometry and technology
bindings, facility and Colony Pod production, and technology/production snapshots. Older
assertion-only scripts count as one file scenario; the remaining scenarios have
individual names. This is current
GLSMAC regression/invariant coverage, separate from original-game parity.

The `turn-playability` suite exercises consecutive production event sequences,
movement restoration, healing, completion/uncompletion and stale confirmation
callbacks. `world-startup` controls coordinate draws to check bounded placement,
land/naval starts, spacing and failure before initialization events. These are
GLSMAC regressions; their mocked native boundaries do not establish original
rules or prove the native lifecycle works.

For the actual browser lifecycle, supply your installed original assets:

```sh
SMAC_ASSETS_DIR=/path/to/installed/game npm --prefix tools/wasm-tests run test:gameplay
```

The five synthetic-world cases use current host production scripts,
real rendering/input and read-only backend telemetry. They check terrain labels,
base navigation, Skip Turn, next-turn movement restoration, a keyboard move and
opening the destination base. The production case cancels and confirms the facility picker,
then constructs Recycling Tanks through real turn controls, checking each mineral
credit, completion, overflow and the refreshed base screen. Completion also
raises actual base-square nutrients, minerals and energy by one each and pending
mineral production by one in this reproduction fixture. Two separate paths
move a Colony Pod, check modal blocking, found via B or FOUND BASE, open the new
base and advance another turn after consumption.

The worker-assignment case clicks the actual resource-map diamonds to turn a
Worker into a Doctor, assigns a different productive tile, checks the refreshed
resource labels and all three native worker links, closes/reopens the screen,
and advances a real turn to verify the new food and mineral income. Its declared
imported terrain and normal base initialization are controlled GLSMAC fixtures.

The additional `normal-game.test.mjs` case uses the real New Game menus to
choose Tiny and Gaians, generates terrain through the production world path,
opens Headquarters, skips both owned starting units, advances a turn, verifies
movement replenishment and reopens the base. It then selects a Colony Pod at
size one and follows naturally earned food and minerals through actual growth
and construction, with a fixed 32-turn ceiling. Every credit, population charge,
project clearing and retained overflow is checked. Read-only stage/child-event
observations require growth to settle before the next turn. Both original
starting units survive and a distinct new owned pod appears. Its injected entry
adds read-only telemetry; it supplies no world/map/RNG, population or mineral
override. Run it separately with
`npm --prefix tools/wasm-tests run test:normal-game`. These browser regressions
do not establish original-game agreement. The additional
`colony-production.test.mjs` case starts with three actual workers on controlled
productive terrain and no seeded pods or minerals. It earns 12 minerals toward
Tanks, previews and cancels an active switch, then confirms the recorded
one-mineral loss before finishing a Colony Pod. It checks every mineral credit
and population charge, moves the first
constructed pod and founds a base, then manually constructs a distinct second
pod. Run it separately with `npm --prefix tools/wasm-tests run test:colony-production`.
Browser failures and graphics errors remain failures.

The production suites cover a bounded GLSMAC facility-building policy, separate
from original-game economy comparisons. An owner selects an available unique
facility; subsequent turns credit the nonnegative mineral surplus captured before
growth changes workers. Each turn credits once. Completion installs the facility,
clears the project and retains overflow. Idle bases do not accumulate minerals.
The shipped project is Recycling Tanks, using four declared mineral rows when an
explicit named map preset is known: 32
minerals for Tiny, 36 for Small, and 40 for Standard/Large/Huge under the modeled
human rule10/INDUSTRY0 setting. Unknown or custom dimensions and imported maps retain its
explicit 32-mineral fallback. Its base-square resource bonus is checked separately
against original observations.
A bounded land Colony Pod project is described below. Other unit construction,
queues and hurrying remain absent. Bounded active switching is described below.

`facility-cost-native` and `facility-cost-completion-native` check that actual
Player descriptors and Base completion share the same effective cost. Declared
rows and preset provenance survive their native codecs; unknown dimensions,
imported maps, unmodeled roles and facilities without rows retain declared
mineral costs. Dimension changes clear provenance, and live settings wrappers
stay consistent through native decoding and lobby apply/rollback. The factor
comes from the recorded original contract; row declarations and item completion
are GLSMAC application tests, not additional whole-item original observations.

`base-production-native` uses real Base, Player and registry code with a synthetic
asset-free native world. It checks write guards, integer validation, notifications,
rollback and production snapshots restored into a fresh receiving world. The
fixture supplies graphics and event-loop boundaries. `base-production`
checks production events and turn integration; `base-production-ui` checks the
actual picker and base-screen scripts with controlled display/native boundaries.

`growth-production-sequence` follows an actual native Tiny base from one
worker and zero stored food/minerals through idle food accumulation, growth,
Colony Pod completion and same-turn regrowth. It checks pre-growth mineral
credits, consumed citizen identity and worker links released before reclamation.
Synthetic terrain yields and manual turn delivery are controlled boundaries.
The worker and doctor undo cases execute the shipped growth event against
native objects, restoring food storage and worker links while preserving the
existing monotonic allocation counters. These are GLSMAC application checks,
separate from recorded original factor observations.

`player-copy-native` checks independent native production payload ownership,
descriptor values and removal/destruction lifetimes for the player copies used
by connection notifications. `pop-snapshot-native` restores populated bases with
definition IDs different from display names, checks receiving parent bindings,
variants, next population IDs and production state, and rejects an unknown type
without replacing the receiving world. These bounded codec tests do not establish
complete world save/load.

`base-work-snapshot-native` runs shipped growth, worker and production callbacks
over real native bases, populations, tiles and resource managers with controlled
terrain yields. Fresh deferred decoding preserves accumulated nutrients, pending
production, population IDs and receiving worker/backlink identities. Complete
base batches validate centers and worker claims before attaching them; malformed
references and conflicting later records leave no partial tile assignments.
Ordinary startup preserves IDs, while an explicit empty snapshot restores its
next ID once. These checks cover the current internal snapshot format, not
original save files, old-format migration, complete world replacement, graphical
spawn callbacks or a save/load menu.

The colony suites add functional land expansion: one starting Colony Pod,
shared FOUND BASE/B eligibility, immediate worker assignment or doctor fallback,
and a native transaction that consumes the pod after base initialization. Native
tests check exact pod state, worker links, names, RNG and IDs through failure and
guarded rollback, plus rejection of stale commands, foreign stacks and civilian
attacks. The prototype uses an existing static portrait; authentic vehicle models,
naval pods and original founding/movement rules remain
outside this feature's coverage.

`objects-list-lifecycle` uses native entities and the shipped tile list to check
same-tile founding updates, queued input after removal, live ID resolution and
owned deferred base-screen callbacks.

`async-lifecycle-native` exercises the actual scheduler with controlled equal
deadlines: sibling/self cancellation, replacement, repeat, stop-all and handle
isolation. It does not force concurrent collection. The browser founding flow
exposed an Async GC race; queue processing and rescheduling now share the existing
collection guard, and synchronous timer operations enforce interpreter ownership.

`event-result-native` checks local acceptance/rejection notifications, immutable
scalar request identity, optimistic/deferred response handling and safe outgoing
serialization before commands delete their payload objects. It exercises actual
event processing and connection queues with a synthetic transport; it does not
establish complete multiplayer synchronization.

The `game-modal-input` suite initializes the production game UI and checks modal
consumption, listener cleanup and popup timer cleanup on restart. The
`map-size-keyboard` suite checks both inputs, validation/correction, completion
versus cancellation and the real setup stack. Only the four recorded keyboard
navigation cases establish original agreement; dimension values and limits
remain reproduction regressions.

The worker uses the actual WASM GSE parser/interpreter and production scripts.
Only native managers, display nodes, input events, animation completion and
random inputs are replaced where a fixture needs control. UI tests check
transitions and emitted commands, not pixels, font layout, hit testing or real
browser input routing. Browser smoke tests remain in the existing suite.

Each process gets fresh engine state, a unique prefix and the same immutable
script snapshot. Scripts live under an isolated virtual root, so deleting a
host module cannot accidentally run its old embedded copy. Reports identify
both runtime hashes and the script snapshot hash, and reject a runtime changed
during execution. Rebuild the engine after C++ changes; run builds and tests
sequentially. Default concurrency is at most four workers and can be reduced on
memory-constrained machines. The catalog places longer suites first.

```sh
python3 tools/behavior-tests/fast.py --list
python3 tools/behavior-tests/fast.py --domain ui --jobs 4
python3 tools/behavior-tests/fast.py --suite gameplay-events --suite base-decisions --jobs 2
```

Failures, crashes, timeouts, skipped scripts, zero assertions, missing completion
markers and partially completed scenarios all fail the run. Reports include
named scenarios, actual assertion counts, durations and failure output.

CI has a separate parallel **Fast headless behavior** job. Its engine cache is
keyed by C++ sources, native test bindings, CMake, compiler/toolchain version and
build inputs. A cache miss builds the engine once; script-only changes reuse
the engine but always execute fresh scripts. The full native/WASM/browser jobs
and Pages publishing remain gated, and the headless report is downloadable as
the `headless-behavior` artifact.

## Original observations and implemented contracts

The `map.same_row_distance.v1` contract measures distance between two
valid tiles **on the same row of a round map**. Ninety cases cover all coordinate
pairs on widths 4 and 8, both row parities, wraparound in both directions,
half-width boundaries, widths 80/128/4096 and high row numbers. The checked-in
observations were captured twice from the original GOG Alien Crossfire v2.0
`terranx.exe`, SHA-256:

```text
01901cbf7196b0c5d0df9540a029520f5df8fd9a6b343deef8b5663872805fcf
```

The reference calls original `x_dist` at `0x00579790` and converts its horizontal
coordinate units into tile steps by dividing by two. It initializes all three
map globals read by that function. Each case gets a fresh x86 emulator; the
original entry point is never run. Execution is limited to this function and
its original `abs` dependency, with memory, stack, register, instruction and time
checks. There are no substitutes for original function results in this runner.

GLSMAC's existing distance calculation is shared with its tile manager through
`src/game/backend/map/tile/Geometry.h`. The candidate adapter compiles this same
helper as native C++ or WASM. This extraction preserves the previous arithmetic.
The original's general `vector_dist` has different semantics: the same-row cases
make no claim about arbitrary two-dimensional distances or flat maps. The
separate vector contracts below cover that bounded score. Neither distance
contract measures movement costs, tile yields, combat or AI.

There are also **1,692 additional original observations** across seven versioned
contracts: raw/coordinate vector distance, technology possession, weight
category, research availability, bounded prerequisite queries and the human
mineral cost factor without base effects. Their precise
fixtures and exclusions are in [contracts.md](contracts.md). The C++ helper
reference set also includes **5,531 ability-free prototype cost cases** and
**5,679 human nutrient-factor cases** and **2,528 basic production switch-loss
cases**, making **15,520 cases** in total. These probes cover small rule helpers; they do
not constitute a complete economy, AI turn or research planner.

A separate [economy script lane](economy/README.md) replays **504 original
base-square resource cases** through the shipped GSE callback without rendering
or assets. It transfers Recycling Tanks’ nutrient/mineral/energy increments and
checks Headquarters/river combinations in a precise synthetic fixture. It uses
the WASM interpreter with controlled native inputs and is separate from the
15,520 native/WASM C++ helper cases. Run it with
`python3 tools/behavior-tests/economy/run.py`; CI requires agreement.

All eleven bounded C++ contracts are implemented by shared production GLSMAC helpers.
The vector helpers expose the original vector score separately from tile steps.
The technology table implements possession, weight classification, availability
and bounded prerequisite queries; it does not add a full research planner or
populate the shipped technology rules. The mineral-factor helper transfers the
recorded map-preset and industry behavior. Recycling Tanks now uses its explicit
row declaration with known named presets at rule10/INDUSTRY0; social engineering,
AI/difficulty and per-base cost effects remain outside this integration. The candidate adapter calls these same
helpers for native and WASM replay:

```sh
npm --prefix tools/wasm-tests run test:parity
```

This checks all **15,520 cases**. It runs independent reference suites in
parallel; each result remains bound to its recorded input hashes. Run both
compilation targets with:

```sh
python3 tools/behavior-tests/audit.py --target native
python3 tools/behavior-tests/audit.py --target wasm
```

The WASM target requires the Emscripten SDK and Node.js. To validate all recorded
evidence without executing a candidate, use the explicitly separate operation:

```sh
python3 tools/behavior-tests/audit.py --validate-only
```

Evidence validation reports no parity score. CI strictly compares all recorded
contracts on native and WASM candidates. Never change original observations to
match the candidate.

Gameplay scripts can call `game.geometry` for the three distance queries and
`game.technologies` for table definitions and technology predicates. Technology
mutation keeps the engine's event write guard; restarting a game clears the
table, and world snapshots carry its definitions, weights and ownership. Faction
arguments are original ownership-mask IDs (0 for native life, 1–7 for factions),
separate from GLSMAC player slot indices. The `behavior-rules` suite exercises
these production bindings, lifecycle reset and snapshot validation.

## Fixed gameplay and UX regressions

The five previously failing probes now run in the required passing catalog and
the default GSE suite. Their expanded cases cover the original failures and
related dismissal, retry and rollback paths:

| Suite | Fixed behavior |
| --- | --- |
| `base-growth-regression` | Growth with no unworked tiles creates a doctor |
| `combat-rollback-regression` | Restoring a casualty preserves its spawn descriptor |
| `faction-retry-regression` | A chosen faction survives a rejected start and error dismissal |
| `popup-sound-regression` | Replacing a quit popup stops its owned speech exactly once |
| `popup-resize-regression` | Resizing during popup exit delivers the pending result exactly once |

```sh
npm --prefix tools/wasm-tests run test:regressions -- --jobs 3
```

`test:known` remains an alias for this focused regression command. There are no
remaining red probes from this set. Keep future confirmed defects in a separate
`known-issues.json` catalog until fixed; the worker executes non-underscore
aliases for those probes to avoid the engine's underscore skip rule. A skip
never counts as an expected failure or a pass.

## Compare without the original game

Run from the repository root. Python 3 and `g++` are sufficient for the native
comparison; no Python packages or original assets are required:

```sh
python3 tools/behavior-tests/compare.py compare \
  --cases tools/behavior-tests/cases/map-distance.json \
  --reference tools/behavior-tests/observations/smacx-gog-2.0-map-distance.json \
  --command 'python3 tools/behavior-tests/glsmac.py --target native' \
  --report tools/behavior-tests/.build/native-report.json
```

To run the same cases against actual WASM, activate the project's Emscripten SDK
and use Node.js:

```sh
python3 tools/behavior-tests/compare.py compare \
  --cases tools/behavior-tests/cases/map-distance.json \
  --reference tools/behavior-tests/observations/smacx-gog-2.0-map-distance.json \
  --command 'python3 tools/behavior-tests/glsmac.py --target wasm' \
  --report tools/behavior-tests/.build/wasm-report.json
```

`EMXX` can select an Emscripten compiler path. Each candidate invocation builds
in its own temporary directory, so comparisons do not share stale binaries.
Exit status is **0** for complete agreement, **1** for mismatches or unsupported
candidate algorithms, and **2** for invalid evidence, malformed responses,
crashes or other execution errors. Reports identify each case and differing
JSON paths. Outputs are compared exactly, including field presence, types and
trace order. Unsupported or missing cases never count as passing.

The CI workflow runs native checks and the implemented WASM comparison from
recorded observations. It does not download or execute the original game.

## Capture or compare with the original

Install the optional reference dependencies into a local virtual environment:

```sh
python3 -m venv tools/behavior-tests/.venv
tools/behavior-tests/.venv/bin/pip install \
  -r tools/behavior-tests/requirements-reference.txt
```

Supply your own unmodified supported executable. Paths below are examples for
an installation outside the checkout:

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/cases/map-distance.json \
  --command 'tools/behavior-tests/.venv/bin/python tools/behavior-tests/original.py --exe ../smac-assets/terranx.exe' \
  --output tools/behavior-tests/.build/new-original-observations.json
```

Capture requires two identical runs, rejects unsupported reference cases, binds
the whole suite and each case to hashes of their exact inputs, and records the
executable fingerprint and adapter/emulator versions. It refuses to overwrite
existing evidence unless `--force` is supplied. A modified executable, including
a differently patched build, is rejected before execution. Supporting another
build requires separately verified addresses and separate observations.

For a live comparison, replace `--reference FILE` in the comparison command
with:

```sh
--reference-command 'tools/behavior-tests/.venv/bin/python tools/behavior-tests/original.py --exe ../smac-assets/terranx.exe'
```

Commands are parsed into argument arrays and run without a shell from the
repository root. Quote paths containing spaces inside the command string.
Runners read one JSON request from stdin and write one JSON response to stdout;
diagnostics go to stderr. The request includes only case IDs, algorithm names
and inputs. It never includes expected outputs.

## Work from tests to implementation

1. **Reference research:** identify a bounded behavior, its inputs, relevant
   world state and observable outputs. Disassembly may reveal missing boundary
   conditions or which state must be initialized. Keep disassembly, pseudocode
   and research notes outside the checkout.
2. **Test authoring:** write synthetic scenarios and make the original adapter
   execute them. Save outputs with `record`; do not infer expected values from
   the current GLSMAC implementation or hand-edit reference answers. Confirm
   the results repeat after resetting the complete fixture state.
3. **Implementation:** give an implementation agent the case contract, recorded
   observations and existing GLSMAC source. Start it with a fresh context that
   excludes reverse-engineering notes and original/reconstructed source. It
   changes GLSMAC until the candidate passes, then adds more cases to challenge
   the solution. Keep the reference runner independent of candidate changes.
4. **Verification:** rerun new cases against the original, replay all recorded
   cases on native and WASM candidates, and retain every confirmed mismatch as
   a regression case. Never regenerate expected outputs from the candidate.

This is a separation of research and implementation work, not a guarantee about
the legal status of any particular reverse-engineering activity.

For stateful behavior, compare both the returned decision and the relevant
state changes. Use a sequence of actions when one action is insufficient to
expose the behavior. A matching final state can otherwise conceal different
decisions. Random behavior needs controlled random state or an explicit draw
sequence and recorded draw consumption; a seed alone is insufficient if the
implementations consume different numbers of draws. Do not add broad numeric
tolerances to conceal rule or rounding differences.

These are the next contracts to investigate, **not implemented reference probes**:

| Contract | State that must be explicit | Outputs to observe |
| --- | --- | --- |
| Tile yields | Moisture, rockiness, sea/land, features, improvements, bonuses, faction, technologies, base/facilities, rules | Nutrients, minerals, energy, including caps and rounding |
| Movement | Unit prototype/domain/abilities, remaining moves, source/destination terrain and improvements, owners, neighbors/ZOC, rules, randomness | Allowed/successful move, movement consumed, resulting position and flags |
| Growth/production | Base population, storage, intake, support, facilities, faction/difficulty modifiers, queue, rules | Population, storage, completed item and resulting state after one turn |
| AI choices | Complete relevant world snapshot, available choices, faction/personality, difficulty, rules and controlled randomness | Selected action/target, action sequence, state changes and random draws |

An algorithm name is a versioned contract. Define its JSON fields, units,
coordinate mapping and exclusions before adding an adapter. Unknown contracts
must return `unsupported`; they must never fall back to a guessed formula.

## Test the harness

```sh
python3 -m unittest discover -s tools/behavior-tests -p 'test_*.py' -v
```

This checks evidence binding, nondeterministic references, mismatches, missing
results, unsupported cases, subprocess failures and the real native candidate.
With the optional dependencies installed, use the virtual environment's Python
to also run emulator guard tests. Those tests contain explicitly synthetic x86
instructions and need no original executable; without Unicorn they report
skips. They are separate from the genuine game observations.

## Ability-free prototype base costs

The original-game replay additionally checks **5,531** synthetic unit component
cases against `src/game/backend/unit/PrototypeCost.h`, on native C++ and WASM.
The output is mineral rows before map/faction factors and prototype surcharges.
The fixtures cover land, sea, air, reactor and component ranges, missile offense
boundaries, selected weapon modes and table-slot independence. A further 1,024
of these cases were recorded after the implementation was frozen.

See [contracts.md](contracts.md) for exact bounds and evidence. The full
C++ helper lane also includes nutrient factors and totals 15,520 original cases; resource callback and UI traces remain
separate. This arithmetic transfer does not establish full design, ability or
production parity; the bounded Colony Pod application lifecycle below is separate.

`prototype-cost-native` also exercises the real unit manager's read-only
`get_prototype_base_cost` binding with recorded witnesses, unchanged-world
checks and invalid bounds/types/argument counts. The public query accepts eight
component properties; original table slot IDs belong only to the reference
fixture. Regenerate synthetic inputs with
`python3 tools/behavior-tests/generate_prototype_cost.py --suite all`;
observations require separate repeated original execution.

## Installed world-size integration

Three additional suites add 29 scenarios and 303 assertions. Complete synthetic
world-size tables pass through the production parser into native ordered
choices, with names, descriptions, dimensions and stable preset identities.
Native selection updates dimensions and provenance together, refreshing retained
map wrappers. Copies, historical/current codecs, malformed aggregate records,
saved callable lifetime and actual valid pre-world State transfer are covered.

The shipped picker and full animated menu controller use native labels and
dimensions on both random/custom routes, including cancellation and remembered
selection. Lobby controls use ordinal IDs so equal dimensions remain distinct;
real settings application/rollback and receiving-control updates are exercised.
Display-only legacy fixtures explicitly declare their native-rules boundary.

With installed assets, `npm --prefix tools/wasm-tests run test:world-sizes`
checks loaded Standard defaults on CLI Quick Start and all five alternate
generated worlds through real setup/faction controls, production and turns.
These source-data/application checks add no original terrain observations;
existing original menu, economy and helper comparisons remain separately gated.
Descriptions are preserved as data; original custom-dimension units and
conditional dialog formatting remain gaps. See the
[world-size contract](../smac-data/world-size-contract.md).

## Installed mineral rule and settings transfer

Six additional suites cover 61 scenarios and 578 assertions. The real parser
feeds the mapped mineral scalar into native rules independently of nutrient
data. Both startup paths validate both values before committing either. Current
rules carry both values; exact empty and nutrient-only records retain their
declared compatibility. Copies, aliases, destruction and actual pre-world State
wire remain native application checks.

The shared declared-price resolver applies the loaded factor to facilities and
Colony Pods, including descriptor, preview, selection, exact completion and
retained overflow. Tests preserve exact zero prices on Tiny/rule-one settings,
next-turn completion and population holding. Real native choices also pass the
shipped base picker and command validator/apply, including zero labels, preview,
cancellation, ownership, installed/invalid exclusions and positive-price recovery.
Multiplication is checked against
the actual factor; overflow rejects through script-call boundaries before
production changes. This transfers the existing recorded factor arithmetic;
row declarations and whole-item construction add no original parity cases.

The actual mineral panel handles zero rows without geometry division, clears
old cells and recovers positive prices. Funded projects report one turn even
without new income; unfunded projects retain NO SURPLUS and population-blocked
pods retain NEEDS POPULATION. Synthetic display boundaries do not establish
original rendered UI parity.

A separate 23-scenario suite transfers every exposed map property, difficulty
and game name through real native codecs. Assigned wrappers and fresh wrappers
must match the serialized receiving state. Rejected map/global records preserve
all fields; unregistered full-width difficulty values reject before mutation,
including a value that would narrow into a valid mapped key. These checks do
not claim malformed whole-State/faction atomicity or complete save/load.

With installed assets, `npm --prefix tools/wasm-tests run test:mineral-rules`
loads distinct nutrient/mineral values through normal manifest verification,
checks Quick Start and generated Standard gameplay, the actual picker and
selected-project prices, then advances a real production turn. See the
[source-data contract](../smac-data/mineral-rule-contract.md).

## Installed nutrient rule integration

Five additional suites add 33 scenarios and 218 assertions. Synthetic rules
reach native settings and the shipped growth/food-grid code; aliases, object
lifetime, copies, legacy/current codecs and valid pre-world State transfer are
checked without rendering. Invalid nested rules and truncated late fields leave
GlobalSettings unchanged. This does not establish whole-State malformed-packet
atomicity or original growth/UI parity.

The probes exposed and now guard zero-column food-grid division, partial
GlobalSettings mutation on rejected records, and lost GSE function returns in
classic `for` loops. The language suite checks return values, nested loops,
side effects and existing break/continue behavior. Failing baselines were
preserved before fixes; fixed probes are promoted into the passing catalog.

With installed assets, `npm --prefix tools/wasm-tests run test:nutrient-rules`
checks actual Quick Start initialization and ordinary Standard menus, world
generation, native factors and the displayed growth label using a verified
synthetic rules asset. See the [source-data contract](../smac-data/nutrient-rule-contract.md).
These are application regression tests; original parity totals are unchanged.

## Human nutrient cost factors

The original helper replay includes **5,679** human nutrient-factor observations,
with explicit preset, rule multiplier and GROWTH inputs. The implementation
was inferred independently from recorded outputs, then checked against 1,024
samples using multipliers absent from its initial matrix. Native and WASM replay
call the same production header. See [contracts.md](contracts.md) for bounds,
original switch-table handling and exclusions.

Regenerate inputs with
`python3 tools/behavior-tests/generate_nutrient_factor.py --suite all`.
Original answers require separate repeated executable captures. These helper
cases do not establish population booms or whole-base growth behavior.

`nutrient-factor-native` and `growth-factor-integration` additionally check the
actual per-base query, shipped growth/reset callbacks and food-grid cells.
Supported human owners with explicit named presets use the recorded factor at
modeled rule10/GROWTH0; procedural custom climate still supports a named size.
Unknown/custom dimensions, imported maps and unmodeled owner roles retain the
existing area-based fallback. Growth thresholds and food-grid capacity share
the same factor. Population row counts, events and UI checks are GLSMAC
application coverage, separate from original factor observations; faction
traits, social engineering, per-base modifiers and population booms remain gaps.


## Renewable Colony Pod construction

The `glsmac.unit_production.v1` application contract extends the actual production
registry, event, base screen and native completion to a declared land Colony Pod
recipe. It uses three mineral rows, with supported human preset costs of
24/27/30/30/30 and an explicit 30-mineral fallback for unknown provenance. The
component rows and human mineral factor each have recorded original evidence;
whole-item construction is not an additional original comparison.

An owner selects the project through CHANGE. Subsequent turns credit the existing
nonnegative surplus once. Completion consumes one actual citizen, releases its
worker assignment, spawns one real owned pod at the base center, keeps overflow
and clears the project. Manual reselection allows another pod. A size-one base
retains its credited project until another citizen exists; the original game's
abandonment dialog remains unimplemented. Produced movement, health and morale
follow the reproduction's existing spawn defaults, not a new original contract.

Native completion owns the unit, citizen and production transaction. Spawn
callbacks observe that state under a scoped native mutation guard. Consumed
citizen references reject later mutation; receipt undo preserves the same
citizen identity. Arbitrary script closure state and configuration or handler
registry changes are outside this native journal.
Its tests exercise callback failure, identity-sensitive undo, receiving-world recipe
resolution, prices and invalid mutations. Script tests check owner validation,
duplicate turns, optional unit receipts and the actual picker/display with a
controlled display boundary. These are GLSMAC application tests. Fresh-world unit definitions resolve morale through the receiving manager,
including the associated backend manager used by frontend definition requests.
Unit support, home-base rules, abandonment, automatic repeat/default selection, queues and
whole original completion ordering remain outside this batch.

## Basic production switching

The original helper lane includes **2,528** human basic-item switch-loss cases
at default retool rules, with no installed facilities. The 512 held-out cases
were generated after the candidate header was frozen. Native and WASM call
the same production helper; [contracts.md](contracts.md) records exact bounds.

The separate `glsmac.basic_production_switch.v1` application contract allows
active Recycling Tanks↔land Colony Pod switching for modeled human owners,
without Skunkworks and within bounded mineral storage and project costs. The
actual picker previews each target's mineral loss; cancellation preserves the
project and credit. Confirmation debits only the loss and marks the current
turn so switching cannot credit production again. Aliases of the same actual
project preserve all state. Native tests check both directions, thresholds,
read-only previews, exact event rollback and atomic rejection of unsupported
contexts. The picker displays an unavailable message for those contexts.

This application policy, including installed Headquarters, rollback and UI,
is separate from the original helper observations. It does not establish whole
original switching behavior, AI/social modifiers, projects, orbitals, Stockpile
Energy, queues or hurrying.

## Deferred growth and population event lifecycle

`queued-base-turn-native` sends commands through the actual native host event
queue with shipped handlers and validation. Its natural Tiny sequence reaches
a population-constrained pod project, then grows into a food deficit. On the
following turn, production consumes the new worker before growth decides whether
starvation is needed. The separate `process_base_growth` event reads this updated
state, retaining 43 minerals and one nutrient with no stale population removal.
Terrain yields and manual turn delivery remain controlled fixture boundaries.

The native fixture now consistently identifies its economy host as slot zero
for the player, slot and event caller. No authorization validator is replaced.
Controlled immediate-dispatch fixtures remain separate from native queue tests.
The growth stage validates host, current turn and completed active production;
only the master queues population child events. Its undo restores nutrient
storage; population children retain their independent event lifecycle. Manual
production receipts are unchanged. This does not provide atomic whole-turn undo
or complete multiplayer synchronization.

`remove-base-pop-native` checks actual worker/doctor removal and undo. Surviving
citizens retain their identity and links; undo recreates the removed citizen
through the existing monotonic allocator. It does not rewind citizen identity,
variant randomness or allocation counters.

`pop-membership-native` checks that actual citizen identity is required by
`Base.destroy_pop`, including foreign bases/worlds with matching per-base IDs.
Rejection leaves both snapshots, RNG, counters, notifications and worker links
unchanged; a fresh wrapper for the actual local citizen remains accepted. The
queued turn suite additionally grows and starves a genuine worker while idle,
checking successful host removal and the surviving worker graph. These are
GLSMAC API/lifecycle invariants, separate from original-game helper evidence.

`base-work-events-native` checks actual shipped work/unwork handlers using real
Base/Pop/Tile objects: owner and world membership, eligible noncenter tiles,
Worker/Doctor transitions and receipt undo restoring the previous job and tile.
Rejected requests preserve snapshots, RNG, IDs and native notifications.
`base-worker-ui` executes the real resource-panel mouse handler and weighted
selector without graphics, covering request ordering, diamond hit tests, empty
populations, refresh to another base and panel removal. Its local display
boundary models native Container.clear handler cleanup. These are application
regressions; the separate citizen-job contract below transfers bounded starting-job UX and the Doctor bonus.


## Citizen job controls and Doctor Psych

`ui.citizen_job.v1` adds 14 independently recorded original sequences and 67
checkpoints: the starting Worker/Doctor choices, selected job, draft/confirm/
cancel behavior, clamped arrows, ignored Home/End and visible Psych bonus.
The actual original chooser reports +2 Psych for Doctor; confirmation changes
the displayed bonus from zero to two, while drafts and cancellations preserve
it. The native-backed candidate initially failed because portraits had no input
handler and real Doctors still displayed a zero bonus. Both failures remain
strictly represented by the recorded cases; see [the UI scope](ui/README.md).

`base-specialist-bonus-native` checks shipped energy payloads for actual native
citizens, unchanged native snapshots/RNG/IDs/notifications on reads, and real
unwork receipt undo. Summing multiple Doctors is separately labeled GLSMAC
application policy, beyond the original one-citizen recordings.
`citizen-job-lifecycle` executes the shipped portrait, chooser and base screen
with native identities and real work/unwork validators. It checks draft-only
selection, stale controls, ownership/removal/consumed-citizen handling and a
no-square Worker restoration guard. Display, terrain and immediate event
delivery are controlled boundaries. The browser case separately drives actual
mouse/keyboard input, queued commands, all three worker links, rendered Psych,
close/reopen persistence and unchanged food/minerals/project/population.

Only Worker/Doctor and the bounded visible Doctor bonus have original evidence
here. Other jobs/unlocks, drones/talents, energy allocation and rounding, and
original Worker square selection remain gaps. The latter uses the reproduction's
existing best-vacant-square policy.

The first actual chooser browser run also exposed a display-boundary mistake:
native Window does not forward the ChoiceList factory. The shared mock now
models its actual forwarded factories; the same recorded replay fails without
an inner panel, preserving this as a display-free regression. The chooser uses
that supported panel and an explicit zero-height header for its own layout.


## Installed rules, menu and dialog data

The production main-menu controller now loads `alphax.txt`, `xscript.txt` and
`menu.txt` through the native asset resolver and shared cached parser. TOPMENU,
MAPMENU and SCENARIOMENU labels/captions decorate their existing callbacks.
The parsed rules and in-game definitions are available to further consumers;
loading data does not implement their unmodeled mechanics or commands.

`smac-text-loader` adds eight asset-free native binding scenarios with 72
assertions. `smac-data-menu` adds nine production UI scenarios with 41 assertions,
using alternate synthetic labels to verify actual callbacks, strict malformed
input handling and loading once per controller. The existing original menu lane
also executes the consumer with explicitly declared synthetic data. Actual
installed-file startup remains a separate rendered integration check.

See [the shared-parser tests and installed-file audit](../smac-data/README.md).
Its nine C++ synthetic scenarios/67 assertions run on native and WASM in CI.
The optional audit compares installed source records and projections without
running the original executable; those counts are never original-game parity.

## Recorded unit orders

The default UI replay includes 13 frozen original `ui.unit_orders.v1` traces and
45 checkpoints, recorded twice in fresh original processes with paused turns.
They verify visible Hold/Activate/Skip effects, exhausted-unit selection, two
explicit turns, idle Space opening a base, actual OK closing and modal key
blocking. The candidate executes native units, actual turn advancement and
shipped controls/events without pixels or original assets:

```sh
python3 tools/behavior-tests/ui/run.py --suite unit-orders
```

Three additional regression suites provide 36 scenarios and 320 assertions for
native order persistence/readiness, strict command validation, exact rollback,
legacy/corrupt snapshot handling, frontend request propagation, pending controls,
modal guards, focus restoration and callable/DOM lifetime. They are GLSMAC
application invariants, separate from original-executable parity.

Five optional browser paths replay recorded expectations through SDL, actual
frontend selection and event transport on a declared synthetic one-Scout world:

```sh
SMAC_ASSETS_DIR=/path/to/installed/game npm --prefix tools/wasm-tests run test:unit-orders
```

They add no original-input parity cases. The companion `test:buffers` command
checks independent copied-buffer reads and appends under native AddressSanitizer
and WASM. The allocator regression was found by the actual unit-codec probe.
The browser checks caught a separate frontend refresh defect that cleared
explicit exhausted-unit focus; the selected unit must now settle along with
the native order and visible labels before another command is sent.
See the [bounded order contract](ui/unit-orders-contract.md) and
[transfer inventory](properties.json) for exclusions. The pending catalog is
currently empty; future red probes remain separate and never count as matches.
