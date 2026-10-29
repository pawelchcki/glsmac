# Unit-order policy migration validation

This slice moves command eligibility and Hold/Sentry/Activate cancellation
planning from `unit_orders.gls.js` into `scripts/game/unit-orders.ts`. It preserves
the existing error precedence, ordinary-order targets, exhausted-unit behavior,
automation-before-work cancellation, native write authorization, receipt state
comparison and removed-unit rejection. Native world state and all mutations
remain owned by the host. Production UI and rollback orchestration still use
GSE; a complete TypeScript action lifecycle remains open.

The versioned domain schema generates TS and C++ validators for copied values,
including int64 identities beyond Number's safe range, finite float32 health,
nullable callers and nullable error strings. The combined contract signature
covers every domain schema. Pipeline regressions exercise schema addition,
editing, removal and duplicate types/entrypoints, including rejection of stale
packages and removal of obsolete generated modules.

## Local checks

The locked toolchains are Clang 23.1.3, Emscripten 4.0.22, QuickJS 2026-06-04,
TypeScript 6.0.3 and Oxc 0.156.0. Reports retain exact package and runtime hashes
under `build/scripts`; generated artifacts are ignored.

- Strict type checking, type-aware lint, formatting and all ten pipeline tests
  pass. No source JavaScript duplicate is maintained for the new policy/tests.
- All four native CTest probes pass in normal, ASan/UBSan/LeakSanitizer and
  TSan builds. The runtime probe executes 73 TS policy
  checks, including rejection precedence, direct apply guards, cancellation,
  unchanged inputs and malformed numeric/schema/field values. Generated native
  validation independently checks malformed schema, float and record shapes.
- The same actual C++ runtime probe passes in Node WASM and Chromium, including
  the existing exact TS error location and numeric/ownership/interruption tests.
- The eight unchanged native lifecycle suites complete 88 named scenarios. The
  same eight WASM suites pass 88 scenarios and 937 native assertions, including
  input controls, pending results, activation, Sentry and stale rollback receipts.

All eight real Sentry browser cases match the unchanged original-game traces,
including each recorded order/movement/selection checkpoint and next-turn
persistence. The replay uses locally installed assets and is separate from
asset-free public CI. The tested WASM SHA256 is
`0ded1dd8f6e0417fb9bc7d83e9b53a2e1808993cba14a6f3db2cf42a087fa394`.
Raw logs and final screenshots are retained under the WASM test artifacts.

Seven additional WASM suites pass 99 scenarios/339 assertions: automation
lifecycle and persistence, ordinary menu controls/context, resource rules,
Former work and the expanded TypeScript boundary. Two broader suites,
`terraform-automation` and `terraforming-controls-all`, hit their unchanged
30-second deadlines. Replaying the previous GSE order policy on the identical
WASM binary reproduces those timeouts. Both failing controls are retained outside
passing totals under `build/scripts/failures/unit-orders`.

Five interleaved `unit-orders-events` replays on that same binary, using Node
22.16.0, have median process-plus-test times of 1,439.18 ms for the previous GSE
policy and 2,435.70 ms for the final TS adapter. Each run executes the same eight
scenarios/175 assertions. A separate phase profile observes 759/1,024 ms between
first/last scenario markers and 1,126/826 ms from the summary to engine success
for GSE/TS respectively. The adapter adds execution/copying overhead and process
shutdown timing varies; this is not a performance improvement. The focused
process remains below the five-second target on this machine. These timings are
bounded local measurements, not whole-game performance claims. Raw samples,
frozen-source fingerprints and phase markers are in
`build/scripts/unit-orders-timing-unit-orders-events.json` and
`build/scripts/unit-orders-phase-profile.json`.

These are bounded application checks, separate from original-game matches. No
original observation or existing lifecycle expectation is changed. The new
TS-only policy regression is additionally registered in the existing GSE boundary
suite. Full GSE removal, TS UI/host scheduling, entity-generation command APIs,
all-player/presentation/timing fidelity and native/WASM stack-limit parity remain
open. The pre-existing Former mine browser mismatch documented in
[foundation validation](typescript-validation.md) remains outside passing totals.

## Optimized release packaging repair

After the foundation merged, its first automatic Main CI failed while packaging
`build/wasm-release/bin/GLSMAC.js`: the release optimizer removed the comment
markers used by the post-link package writer. The corresponding debug/test
engine kept those comments, so earlier bounded checks did not expose the defect.
The failing Main run is `40852249960`, job `123374358677`; its log and a red
pipeline regression are retained in the task artifacts.

The repaired loader uses a quoted base64 JSON envelope that survives minification.
An actual Emscripten `-O3` probe passes package mounting, exact Unicode and repeat
publication checks with identical WASM bytes. The new regression fails against
the previous writer and passes with the repair. Both the unit regression and the
real optimized loader probe run in PR CI. Existing debug output refresh remains
supported until its next relink; native/package identity validation is unchanged.

The script-only lifetime check executes the invalidated WASM bundle and requires
nonzero startup plus the same failure message. It no longer searches the raw
bundle for a string that is now encoded. Healthy 7-to-8 edits, cross-generation
rejection and unchanged compiled-WASM identity remain required. The production
Release build and Chromium setup/input/audio/shader checks pass; a real Release
Sentry case matches the unchanged original trace on WASM SHA256
`f1f6442b8cf613d6fbc683b0d4922dda4d5a1b80d4291f08d30fb742a6f7efc0`.
