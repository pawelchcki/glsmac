# Queued GSE producer progress

Periodic collection previously took the pending-producer mutex and then waited
for an owner accumulation. The startup test fixture can synchronously join a
producer while holding that owner accumulation. Its producer needs the pending
mutex, forming a reachable wait cycle. No historical CI thread stacks were
captured; this is a source-backed cycle demonstrated by a real GC regression,
not evidence of an identical normal-gameplay join.

`Space::Collect` now tries the owner mutex after taking the pending mutex. If
busy, it returns without touching roots or objects and releases the queue by
RAII. A later ordinary GC tick retries. Mutex ordering, collection cadence,
heap limits, fixture inputs and deadlines are unchanged. The no-mutex mode's
`try_lock` succeeds, matching its existing no-op lock/unlock behavior.

The finite-latch regression always leaves the owner accumulation and joins both
threads before reporting an error. Root retention, exactly-once callback and
cleanup, and reclamation checks run before its final progress assertion. The
old runtime passed 24 registered tests and failed only that progress assertion.
The fixed runtime passed all 25 registered tests, including the selected
functions script, with an actual zero worker exit and Native success footer.
The first fixed-run outer verifier exited 2 because it incorrectly expected the
failure-only numeric summary. That result remains preserved. Six verifier
checks reject the old failure and missing/duplicate success evidence; one
authorized corrected run obtained genuine zero worker and outer exits.

The unchanged startup script then passed all 15 scenarios and 168 assertions
under its existing 120-second worker deadline. Both checks used Node22.16.0,
the same FastDebug configuration and unchanged 2GiB configuration, with actual
waits, no forced cleanup, and matching post-run hashes.

[The manifest](gc-queued-progress-proof-v1.json) pins each source/runtime and
raw outcome separately, including the verifier failure. The regression is
registered by the normal multi-thread Native built-in test runner; it is
explicitly excluded from unsupported single-thread concurrency mode. Build the
current engine and run the standard complete GSE tests to reproduce its normal
registration. The focused script can also run with `fast.py --suite
world-single-player-setup --timeout 120 --jobs 1 --runtime PATH/GLSMAC.js
--node PATH/node`.

Fresh complete affected-partition and PR gates remain required before delivery.
Passing these bounded checks does not establish Main health or full game fidelity.

## Exact-head full GSE evidence

The separately retained [full GSE audit](gc-queued-progress-full-gse-v1.json) records run [40601834211](https://github.com/pawelchcki/wasmsmac/actions/runs/40601834211) at head `38045387a976589bec83f0e84b178f716fe6c4dc`: all four partitions and coverage passed, with the exact 189-script union (48/47/44/50), the concurrent progress regression registered in each native run, and all 15 startup cases passed in partition 1. Six downloaded ZIP hashes match GitHub artifact digests. Actual CI Node was v22.16.0; the runtime hashes were measured from the downloaded bytes. The cached engine artifact has no compiler-source manifest, so the binding is the exact-head workflow/cache recipe and executed current-source regression, without assuming equality to the local runtime. Worker exit zero is supported by the executed strict close-status assertion before each completed report and successful step; no separate OS-status artifact was emitted.

This append preserves the old red and local green evidence. It records historical verification only; fresh CI, review, and required review-check publication remain mandatory for the resulting head. No Main-health or gameplay-deadlock conclusion follows from this artifact audit.
