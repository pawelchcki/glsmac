# Terrain capture collection boundaries

Main CI [40864157142](https://github.com/pawelchcki/wasmsmac/actions/runs/40864157142)
failed on `bb3f70592c019788de708a33165337e4d036842e`: the all-player
terrain probe exhausted the unchanged 2 GiB WASM heap while approaching its last
checkpoint. The preceding 80 hot suites and the other underlying Main jobs
passed. The same binary sometimes passed locally, so a retry would not establish
memory headroom.

All ten full observations previously ran inside one accumulating GSE call. That
call holds the collector lock. The probe now uses native script staging v1,
already used by the other large observation probes. Each checkpoint releases its
local snapshot before the existing collector runs; only fixture, observer and
actual command state cross boundaries. `ScriptStages.cpp` performs collection
without interpreter, timer, backend or game progress. The scenario reports success
only after all stages and native cleanup finish.

The 16×16 world, seven players, 128 tiles, nine units, seven bases, ten checkpoints,
three actual moves and 217 assertions are retained. No expected observations,
timeouts, runtime memory limits, production code or original evidence changed.

## Controlled comparison

Both versions executed serially with Node 22.16.0, identical downloaded Main
runtime bytes, current host packages and native RNG state `1:2:3:4`:

| Probe | Peak process RSS (KiB) | Wall time (seconds) |
| --- | ---: | ---: |
| Main's accumulating capture | 2,419,608 | 63.91 |
| Staged capture | 752,676 | 67.14 |

These are single local `/usr/bin/time -v` samples including Node, rather than
measurements of WASM heap size. Peak process memory dropped 68.9%; this sample
establishes memory headroom, not a speed improvement.

Every field of all ten snapshots, native bookkeeping, movement evidence,
coverage, unsupported inventory and native scenario/assertion summary compared
identically. An additional unseeded staged run passed with peak RSS 742,520 KiB.
The 37 terrain observation, capture corruption and terraform action harness tests
passed. The staged probe also passed in the native engine, with every corresponding
report field identical to the fixed-seed WASM run. Original-game agreement and unsupported presentation/action behavior
remain outside these passing totals.

Pinned SHA-256 values:

- Runtime JavaScript: `176d701de2c8b34462738f3a440563d1ae056d58bb08e567ded983f0159e6d58`
- Runtime WASM: `1dc1aa070430d8055dcf596e2ab2c5f8ca807b03ef0866748a17ae72e4f7d2af`
- Original probe: `064e209ca695bd9171925284c9eee932fe21ea52a24294c8f176a7263fa7e00e`
- Staged probe: `bf813eee630bd82b5dab2e6222d3cd98d9f65ed58ea7bbeffc24675898e42576`

To reproduce, obtain the original probe from the recorded Main revision and use
`state_trace.native_capture.capture_script(runtime, probe, initial_seed='1:2:3:4')`
for each version, wrapped in `/usr/bin/time -v`. Audit each log with
`state_trace.terrain_capture.audit`, then compare the complete `snapshots`,
`native_bookkeeping`, `movement_evidence`, `coverage`, `native_summary` and
`unsupported` report fields. Keep the runtime and package bytes fixed throughout;
random startup placement prevents an unseeded cross-run equality claim.
