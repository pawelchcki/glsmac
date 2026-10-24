# All-player scenario traces

Run the same ordered actions against the original game and GLSMAC, capture
state after each action, and report the first differing checkpoint and field.
Both adapters enumerate every actual player, unit and city, including foreign
and hidden entities. Reference answers are never passed to the candidate.

The [wire schema](schema-contract.md) defines exact comparison and evidence
binding. The [reference profiles](reference-profile-contract.md) define the
observed game fields, units, identity rules, inputs and exclusions.

## Replay the frozen original traces

From the repository root, with an existing compatible WASM engine:

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

These traces currently fail strictly: GLSMAC initializes only the human player
and its starting mineral store differs. [Known issues](known-issues.json) retain
the gaps; neither trace adds passing original cases to release totals. Different
starting coordinates also prevent isolating placement/RNG and resource rules.
The next comparison scope is a shared explicit initial world loaded into both
engines before replay, while preserving these natural-startup probes.

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

Movement/order counters are currently diagnostic, so matching core state does
not establish Hold or movement-cost fidelity. Nutrient interpretation, complete
terrain, RNG draws, general AI decisions, diplomacy and combat remain outside
these two profiles. The original identity contract also rejects unobserved
birth/deletion/compaction cases. The separate native exporter regression covers
movement, detached snapshots, deletion and reused-handle birth identities.
