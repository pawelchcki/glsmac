# Original-game behavior comparisons

This harness lets reference research produce tests and lets implementation work
fill them. The reference runner executes a narrowly selected function from a
locally supplied original executable. The candidate runner calls production
GLSMAC code. Only synthetic inputs, observed outputs, build fingerprints and
test infrastructure belong in this directory.

The first working contract is `map.same_row_distance.v1`: distance between two
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
The original's general `vector_dist` has different semantics: these tests make
no claim about arbitrary two-dimensional distances, flat maps, movement costs,
tile yields, combat or AI.

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

The CI workflow runs the native checks and the WASM comparison from the recorded
observations. It does not download or execute the original game.

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
