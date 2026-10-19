# Original-game behavior comparisons

This harness lets reference research produce tests and lets implementation work
fill them. The reference runner executes a narrowly selected function from a
locally supplied original executable. The candidate runner calls production
GLSMAC code. Only synthetic inputs, observed outputs, build fingerprints and
test infrastructure belong in this directory.

For automatic discovery and replay of **real application UI flows**, including
menu choices, selection defaults, keyboard navigation and cancellation, use the
[dual-application UI harness](ui/README.md). Its default replay executes production
GSE menus without graphics against 328 recorded original cases. The original
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

The current passing lane contains **345 scenarios and 2,382 assertions** across
26 suites. It exercises production movement/combat/spawn events, deterministic
random draws and rollback, base growth/starvation and worker decisions, menus,
map/faction selection, base navigation, turn controls, popups, prompts, timer
cleanup, terrain labels, the visible Skip Turn action, geometry and technology
bindings, facility production and technology/production snapshots. Older
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

This uses a synthetic map and starting world, current host production scripts,
real rendering/input and read-only backend telemetry. It checks terrain labels,
base navigation, Skip Turn, next-turn movement restoration, a keyboard move and
opening the destination base. It also cancels and confirms the facility picker,
then constructs Recycling Tanks through real turn controls, checking each mineral
credit, completion, overflow and the refreshed base screen. It does not validate
normal world generation or original-game behavior. Browser failures and graphics
errors remain failures.

The production suites cover a bounded GLSMAC facility-building policy, separate
from original-game economy comparisons. An owner selects an available unique
facility; subsequent turns credit the nonnegative mineral surplus captured before
growth changes workers. Each turn credits once. Completion installs the facility,
clears the project and retains overflow. Idle bases do not accumulate minerals.
The shipped project is Recycling Tanks, using its existing declared cost of 32;
its resource bonus, unit production, queues, switching and hurrying remain absent.

`base-production-native` uses real Base, Player and registry code with a synthetic
asset-free native world. It checks write guards, integer validation, notifications,
rollback and production snapshots restored into a fresh receiving world. The
fixture supplies graphics and event-loop boundaries. `base-production`
checks production events and turn integration; `base-production-ui` checks the
actual picker and base-screen scripts with controlled display/native boundaries.

`player-copy-native` checks independent native production payload ownership,
descriptor values and removal/destruction lifetimes for the player copies used
by connection notifications. `pop-snapshot-native` restores populated bases with
definition IDs different from display names, checks receiving parent bindings,
variants, next population IDs and production state, and rejects an unknown type
without replacing the receiving world. These bounded codec tests do not establish
complete world save/load or restore script-managed worker assignments.

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

There are also **928 additional original observations** across six versioned
contracts: raw/coordinate vector distance, technology possession, weight
category, research availability and bounded prerequisite queries. Their precise
fixtures and exclusions are in [contracts.md](contracts.md). The total original
reference set is **1,018 cases**. These technology/category probes cover small
rule helpers; they do not constitute a complete AI turn or research planner.

All seven bounded contracts are implemented by shared production GLSMAC helpers.
The vector helpers expose the original vector score separately from tile steps.
The technology table implements possession, weight classification, availability
and bounded prerequisite queries; it does not add a full research planner or
populate the shipped technology rules. The candidate adapter calls these same
helpers for native and WASM replay:

```sh
npm --prefix tools/wasm-tests run test:parity
```

This checks all **1,018 cases**. It runs independent reference suites in
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
