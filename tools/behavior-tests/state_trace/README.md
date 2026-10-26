# All-player scenario traces

Run the same ordered actions against the original game and GLSMAC, capture
state after each action, and report the first differing checkpoint and field.
Both adapters enumerate every actual player, unit and city, including foreign
and hidden entities. Reference answers are never passed to the candidate.

The separate [presentation observer](presentation-contract.md) now records
native scene-animation submissions/removals and lifecycle changes, and writes
an accounting audit for real captures. Its per-checkpoint inventory/event
counts expose omitted observations and retained unknowns; scene evidence and
complete transport do not imply rendered output or original-game agreement.

The [wire schema](schema-contract.md) defines exact comparison and evidence
binding. The [reference profiles](reference-profile-contract.md) define the
observed game fields, units, identity rules, inputs and exclusions.

## Replay the frozen original traces

From the repository root, with an existing compatible WASM engine:

```sh
npm --prefix tools/wasm-tests run test:state-trace
```

This uses the frozen core inputs and observations and the candidate adapter.
It writes `tools/wasm-tests/build/artifacts/state-trace-report.json` and currently
exits 1 for the known strict mismatches. Append options after `--` to override
the inputs, reference, candidate command or report. `WASM_APP_DIR` selects the
candidate engine directory; its default is `build/wasm/bin` under the repository.

The equivalent explicit command is:

```sh
python3 tools/behavior-tests/state_trace/run.py compare \
  --cases tools/behavior-tests/state_trace/cases/natural-startup.json \
  --reference tools/behavior-tests/state_trace/observations/smacx-gog-2.0-natural-startup.json \
  --command 'python3 tools/behavior-tests/state_trace/candidate.py' \
  --timeout 120 --report build/state-trace/core.json
```

`candidate.py --runtime /path/to/GLSMAC.js` selects a cached engine. GSE script
edits need no relink. One scenario executes its complete action/checkpoint
sequence in one engine launch. `run.py --case ID` selects a scenario while
preserving the binding to its original evidence.

Every successful candidate output now also receives exhaustive comparison
accounting in the report's `results[].comparison_audit`. The existing v1 first
divergence and failure details retain their 20-per-domain/50-total limits, while
the audit counts all supplied fields at every paired checkpoint, including later
opponents after those detail limits fill. Domain counters retain shared, missing,
extra and changed entity groups. Every roster member has a separate entry;
unit/base ownership and explicitly player-keyed extension domains attribute
differences to the relevant players. An ownership change counts against both
owners, so player totals must not be added together.

Use `--audit-report /path/to/audit.json` to write a separate
`game.state_trace.comparison_audit.v1` artifact, bound to the same selected suite,
reference and actual candidate identity. It includes up to 1,000 individual
differences per case and an exact `details_omitted` count. Detail limits never
truncate the counts. Console failure output stays bounded; the normal JSON
report always retains the accounting summary without individual audit details.

`observed_fields_exhausted` means all paired supplied state was visited;
`declared_coverage_complete` only summarizes the adapters' coverage declarations.
`state_comparison_complete` requires both, and is false for dropped or misaligned
checkpoints or a declared coverage gap. Unlike checkpoint IDs/actions are never
paired as though they describe the same state. Unsupported/error responses have
`comparison_performed: false`; no empty world or zero-difference claim is invented.
These diagnostics do not attest exhaustive native observation or original-game
agreement, and do not alter strict outcomes or passing totals. Diagnostic-only
fields remain excluded. A failed invocation replaces stale audit success with
explicit error evidence, just as it does for the comparison report.

The expanded `economy-research-v1` profile additionally reads every city's
mineral store, project and Worker/Doctor counts, and every player's technology
ownership, research target and accumulated science. It requires locally
installed game text and executes production configuration and startup:

```sh
python3 tools/behavior-tests/state_trace/run.py compare \
  --cases tools/behavior-tests/state_trace/cases/natural-startup-economy-research.json \
  --reference tools/behavior-tests/state_trace/observations/smacx-gog-2.0-natural-startup-economy-research.json \
  --command 'python3 tools/behavior-tests/state_trace/candidate.py --assets /path/to/installed/game' \
  --timeout 120 --report build/state-trace/economy.json
```

The asset-free core uses the existing declared synthetic first-city source
fixture. That fixture excludes technology/research initialization; the expanded
profile uses installed text and full production initialization instead. Missing
assets make that expanded profile unsupported, never an empty matching world.

Both original traces have three checkpoints, seven players, seven units and
seven cities. Each was captured in two independent original runs. All six
opponent units move on the observed next turn while the held human unit stays.
The original seed control makes its records reproducible. The frozen cases do
not declare a GLSMAC RNG state; candidate coordinates remain uncontrolled and
RNG equivalence is unverified. Candidate repetition/benchmark tests explicitly
supply that engine's own `rng_state` independently.

Production single-player startup now initializes all seven participants and
their owned bases. The recorded ownership-only case matches, and disconnected
computer participants complete ordinary offline rounds. Natural-startup traces
remain strict red probes: starting coordinates, mineral stores and the Spartan
Scout Rover inventory still differ. The historical [issue inventory](known-issues.json)
predates the participant fix; it does not override current comparison results.
Neither natural trace adds passing original cases to release totals. Different
starting coordinates prevent isolating placement/RNG and resource rules.

The separate [setup-controls contract](setup-controls/contract-v1.md) retains
bounded original input/output records for displayed rosters, Random human mode,
explicit duplicate factions and custom-map generation minima. Its independent
manifest preserves provenance without changing earlier reference manifests.
These records guide source-backed regressions and remain outside default
passing replay totals until a versioned public adapter is integrated.

[All-player identity evidence](all-player-identity/contract-v1.md) separately
freezes both authored-name cases for a duplicate-Gaia roster. The candidate
isolates each participant's mutable identity from its catalog template and
opponents. Observed duplicate collision suffixes remain an explicit difference;
the evidence adds no passing identity comparison or full-parity claim.

## Shared explicit-world comparison

The separately frozen [v2 contract](explicit-world-contract-v2.md) supplies the
same seven-player map, base, unit, technology and research initial controls to
both engines. Its three scenarios were recorded twice independently in the
original game. The [explicit-world manifest](explicit-world-reference-manifest.json)
binds those records and the rejected assembly attempts; the preexisting
18-file original manifest remains byte-identical.

```sh
python3 tools/behavior-tests/state_trace/run.py compare \
  --cases tools/behavior-tests/state_trace/cases/explicit-seven-world-v2.json \
  --reference tools/behavior-tests/state_trace/observations/smacx-gog-2.0-explicit-seven-world-v2-native-defaults.json \
  --command 'python3 tools/behavior-tests/state_trace/candidate.py --assets /path/to/installed/game' \
  --timeout 120 --report build/state-trace/explicit-world.json
```

Actual candidate execution matches the human move and Hold scenarios while
observing every player, unit, base and declared economy/research field. The
bounded [offline opening production controller](computer-production-contract.md)
now makes all six opponent Formers projects agree while retaining current-turn
mineral income. The end-turn scenario remains a strict mismatch: University
technology ownership is `[6]` instead of `[3, 6]`. The total is **2 matched, 1 mismatched, 0 unsupported,
0 errors**. No expected post-action state is supplied to the candidate, and no
AI algorithm is inferred from this single declared world. Natural placement,
starting stocks, faction inventory and full AI remain separate gaps.

## Fast checks and measurement

```sh
# Pure harness checks; native candidate tests run when an engine is installed.
python3 -m unittest discover -s tools/behavior-tests -p 'test_state_trace*.py' -v

# Shared exporter against real native managers, including a foreign player.
python3 tools/behavior-tests/fast.py --suite state-trace-snapshot --jobs 1

# Repeatable local timing; compares every corresponding semantic/native observation.
python3 tools/behavior-tests/state_trace/candidate_benchmark.py \
  --iterations 3 --output build/state-trace/batching-benchmark.json
```

`STATE_TRACE_RUNTIME` selects the engine for candidate unittests and
`STATE_TRACE_ASSETS` enables their optional installed-source check. The exporter
regression is in the hot lane; framework, candidate and immutable-reference
integrity checks also run on PRs. Integrity checks execute no original game and
claim no candidate agreement.

Current startup verification passed the full Python harness (796 tests run,
35 optional skips), all 32 hot regression suites (297 scenarios, 2,192 assertions)
and all eleven hot UI references (44 matched cases, zero mismatches, unsupported
cases or errors). The complete 152-script GSE run including native C++ engine
tests is still pending and is not included in those passing totals.

The [local benchmark](benchmarks/batching-v1.json) used one immutable runtime,
matching source fingerprints and three alternating-order samples. Four
checkpoints took a median 5.240 seconds in one launch, versus 17.565 seconds
across four fresh prefix replays. Every corresponding semantic snapshot and
native diagnostic counter agreed exactly. This measures that local 16x16 GSE
scenario; browser, original-game and general CI speed are unmeasured.

## Recording and strictness

The optional original recorder needs the supported locally supplied executable,
installed assets and reference dependencies. It rejects other executable
fingerprints. See `original.py --help` for its local Wine options:

```sh
python3 tools/behavior-tests/state_trace/run.py record --cases /path/to/new-suite.json \
  --reference-command 'python3 tools/behavior-tests/state_trace/original.py --assets /path/to/installed/game' \
  --output /path/to/new-observations.json
```

Recording defaults to two independent identical runs. The frozen
[reference manifest](reference-manifest.json) binds all accepted files and the
complete rejected unseeded runs; rejected records are outside passing totals.
Original adapters are maintained separately from implementation work.

Exit codes: **0** complete agreement, **1** mismatch or unsupported,
**2** malformed evidence or execution error. Entity arrays match by persistent
logical IDs. Every checkpoint, semantic field, exact type and missing/extra
entity matters. Diagnostics alone are excluded. Duplicate identities, missing
reference checkpoints and declared reference coverage gaps invalidate evidence.
A failed invocation replaces a stale report with error evidence; execution flags
distinguish an actually started process from an invalid command or failed launch.

Movement/order counters remain diagnostic in the two natural-startup profiles,
so matching their core state does not establish Hold or movement-cost fidelity.
The explicit-world profile additionally compares verified `none`/`hold` orders;
spent movement counters still remain diagnostic. Nutrient interpretation, complete
terrain, RNG draws, general AI decisions, diplomacy and combat remain outside
these profiles. The original identity contract also rejects unobserved
birth/deletion/compaction cases. The separate native exporter regression covers
movement, detached snapshots, deletion and reused-handle birth identities.


The opt-in [presentation observer prototype](presentation-contract.md) captures
native UI mutations and overlapping audio requests between checkpoints. Raw
engine events remain diagnostic; the separate `presentation.trace.v1` runner
supports pre-world menu/intro sessions without inventing map/player state.
Both pinned presentation cases currently remain unsupported for complete
semantic coverage. They add no passing original cases.
