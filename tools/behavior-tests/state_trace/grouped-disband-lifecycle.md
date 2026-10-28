# Grouped disband lifecycle checkpoint

The original published seven-case disband controls body and its 47 assertions
remain byte-for-byte unchanged in `_unit_disband_regression_cases.gls.js`.
Its single accumulation exhausted the unchanged 2 GiB WASM limit in CI after
body markers, before strict completion. The separate `6f6603a8` experiment
staged each unchanged case with separate empty BEGIN and deferred PASS callbacks.
It produced 22 stage callbacks. A read-only process diagnostic preserved its
120-second timeout. A separately authorized 240-second **observational** run
completed normally in 237.036 seconds with seven scenarios / 47 assertions and
`All tests passed`; this is not a passing 120-second CI check or a timeout fix.

That observation showed CPU-active finite progress. Even empty bookkeeping
callbacks were followed by multi-second boundaries; their timestamps include
commit, collection and dispatch, so they are not isolated GC timings. Historical
full environments and the ephemeral original fast-worker prefix were not saved.
The diagnostic pins the original worker and complete GSE snapshot hashes, records
known launch differences and marks WASM capacity unavailable. An earlier supplied
host hook accessed a non-exported Emscripten property and aborted; that invalid
attempt remains excluded from causal evidence.

`_behavior.group_staged` uses the existing public test-stage APIs. Every real
case runs in its own top-level callback: BEGIN, unchanged body, and a completion
flag bound to that case. One deferred callback verifies every completion before
emitting the seven PASS markers. The worker's existing final summary callback
remains separate. Cleanup and normal `GSE::Finish` must succeed before either
callback runs. This reduces this producer to nine callbacks while preserving
all seven genuine case collection boundaries, names, order, inputs, observations,
inline UI cleanup and strict native shutdown. No C++ collector algorithm,
production cadence, heap limit or global timeout changes.

The existing `script-stages` native fixture additionally exercises grouped FIFO,
real unit/UI/callback identity, exact movement bits, no implicit event/timer
progress, and cleanup-before-completion. Two underscore expected-negative probes
cover an actual grouped-body exception and a cleanup exception with real native
snapshots and owned repeating timers. Optional runtime-backed Python checks
require their exact intended failure, actual cleanup, normal failing-test return,
and the absence of PASS, summary and success markers; these are not passing game
cases. Actual verification is recorded below.

## Bounded independent packets

The grouped nine-callback attempt also preserved all seven cases / 47 assertions
but timed out at the unchanged 120-second gate after its summary at 112.996
seconds. It remains a failed gate. Therefore the logical catalog suite must run
three independent packets selecting original indices `[0,3)`, `[3,5)`, `[5,7)`.
The complete canonical script remains available for direct native callers.
Packet scripts are underscore producers, not duplicate default-native tests.
Each uses the same helper and actual original case entries, with an explicit
indexed-value materialization required by GSE's ArrayRef semantics.

Every packet gets an unchanged 120-second isolated worker and 2 GiB limit. This
is explicitly up to three worker budgets / 360 seconds of serial worker time,
plus launch/report overhead, not a larger global timeout. The logical suite can
pass only after all three workers report their actual native success footer and
raw zero exits, with exactly the original seven names in source order and 47
assertions in aggregate. No joined output is reparsed as a fabricated single
native run, and no synthetic native footer is emitted. A packet never serializes
or recreates a live case halfway through: each original case already constructs
and removes its own fixture. Dynamic IDs remain obtained from that case's real
native entities. Cross-case chronology across different workers is not claimed
as gameplay timing; the ordered logical corpus and each case's action sequence
are preserved.

## Group helper verification

On the exact published cloud engine (native tree `115032ffc7f53ff7f0c3a9f997da12674e25e643`),
the expanded `script-stages` regression completed normally: three scenarios,
23 assertions, raw zero exit and native success footer in 1.900 seconds.
Both optional Python negative checks were executed with the absolute runtime
provided (zero skips), passed in 3.885 seconds, and retained the real failing-test
outputs. Their intentional body/cleanup errors completed naturally, ran the
native-checked owned cleanup, stopped repeating timers and emitted no deferred
PASS, summary or native success. These two expected failures are harness checks,
not additional passing gameplay cases. Retained source/runtime bindings and raw
logs are in `/tmp/terraform-pr35-grouped-helper-proof`.

The first grouped-control registration attempt exposed GSE's indexed-append
ArrayRef behavior and is retained separately. Materializing the original entry
before appending fixed that test-only registration error. The subsequent grouped
whole-corpus attempt reached all nine stage ends and its 7/47 summary but still
failed the original 120-second gate; it is not reported as a completed suite.
The initial source checkpoint left actual packet completion pending; the final
verified dispatcher result is recorded below.

The first logical packet attempt naturally completed its first three native
bodies and native success footer, but the strict protocol rejected its mismatched
summary (1 scenario / 37 counted assertions versus three completion markers).
A nested relative include had instantiated a second `_behavior` module under a
`././` spelling, leaving the worker's outer summary on different mutable state.
Packet and negative-probe producers now obtain the outer instrumentation once
and pass that actual object to their helper. No global module-cache behavior,
case body, expected count or native shutdown check is relaxed.

## Strict logical completion

The immutable full proof host `1d248a66c28cedb87fdabde60fa29a7b23cc1703`
completed the official `--suite unit-disband-controls --jobs 1 --timeout 120`
dispatch against the published cloud engine. All three workers returned raw zero,
their actual native success footer and exact ordered scenario inventories:

| Original indices | Scenarios / assertions | Worker elapsed |
| --- | --- | --- |
| `[0,3)` | 3 / 26 | 55.765 s |
| `[3,5)` | 2 / 7 | 29.711 s |
| `[5,7)` | 2 / 14 | 30.947 s |

The logical result is **7 scenarios / 47 assertions**, all three packets passed,
119.828 seconds including orchestration. Each unchanged 120-second worker gate
passed independently; the declared maximum serial worker budget remains 360
seconds. The original case factory SHA-256 remains
`7407e78beddc606c20263dc233a4530e7af1333d07ae38d6a5f41f5545affc01`.
The complete GSE snapshot hash is
`202127e5bcf7af4cc24bd695c30c1d22412bf50bc7da6aa87748fc818dd260eb`.
Runtime JS/WASM hashes are respectively
`acbc76fbc94b2306a01bce0fa2acf9c30f43f43addea915802f8d07142e5e3ec` /
`83767fa8acce5c776be47f6298f0e24c5828f2e290722a4d341001f4ecb09a24`.
The official report retains per-packet raw output, hashes, execution prefixes,
exit statuses and source/runtime bindings at
`/tmp/terraform-pr35-disband-logical-packets-v2.json`.

After the instrumentation-object injection, both changed expected-negative
checks were rerun: **2/2 passed, zero skips**, in 3.978 seconds. Both real error
paths completed naturally with native-checked cleanup and without PASS, summary
or native-success markers. The unchanged positive helper test was not repeated.
Evidence is retained in `/tmp/terraform-pr35-grouped-negative-proof-v2`. All
workers were reaped. These bounded results repair the disband producer resource
problem; they do not establish a cause or completion for the separate capacity
timeout, nor broad game-fidelity agreement.
