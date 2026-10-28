# TypeScript foundation validation

This batch migrates tile-improvement yield calculations and establishes the
compiler/runtime boundary. It does not complete GSE replacement or the first
full TypeScript action lifecycle. The removal inventory is in
[TypeScript development](typescript-runtime.md).

## Compiler selection

Measured 2026-10-29 on Linux 6.17.7, AMD Ryzen 9 7900 (24 logical CPUs), Node
22.16.0. The seven-module corpus contains production yield policy, UI/test fixtures,
boundary tests, an initialization-loop probe and generated contract validators.
Its source fingerprint is
`e91e32586b5f73dee506b00570a25c6f0d85f7d5466abdb7a0f93efe2a937610`.

| Transformer | Cold p95, ms | Warm edit p95, ms | Warm full p95, ms | Peak RSS, MiB |
| --- | ---: | ---: | ---: | ---: |
| Oxc 0.156.0 | 589.79 | 2.798 | 11.618 | 64.3 |
| SWC 1.16.20 | 1874.68 | 7.572 | 11.106 | 83.6 |
| SWC WASM 1.16.20 | 1317.02 | 13.413 | 8.185 | 118.2 |

Each backend runs in five fresh Node processes. Cold time includes process
startup, import and the first full transform. Each worker measures 200 changed
module transforms and 50 complete transforms. Warm figures above are the largest
worker p95; RSS is the largest process peak. These are measurements of this small
corpus, without competing local build/browser workers, rather than guarantees for
the future full application. Source maps retain identical original source text.
The shared workstation was busy: load averages observed immediately afterward
were 98/95/106. An earlier six-module baseline measured Oxc cold p95 70.65 ms and
warm edit p95 0.103 ms. This spread illustrates why CI retains measurements rather
than asserting machine-specific latency; adding one tiny fixture does not explain
the variation by itself.

Oxc produces 9,532 code bytes and 20,645 map bytes; SWC produces 11,445/23,794;
SWC WASM produces 11,445/21,399. All three retain original TS locations and reject
malformed TS. The selected Oxc path meets the initial 100 ms warm transform
budget with substantial margin. Rust runs behind Node's NAPI in the build/watch
helper; an embedded native/browser compiler ABI has not been demonstrated.

Separate TypeScript 6.0.3 processes took 2,209.71 ms with an empty incremental
cache and 688.57 ms with that cache populated. These times are outside the
execution path. Reproduce with `npm run scripts:benchmark`; raw source identities,
worker summaries, sizes and type-check times are written to
`build/scripts/transform-benchmark.json`. CI retains that artifact without
asserting machine-specific timing thresholds.

The real warm edit-to-test driver measured 11.77 ms packaging plus 1,079.34 ms
native execution, and 9.26 ms packaging plus 1,704.54 ms WASM execution (Node
22.23.4). Both are below the initial five-second focused-feedback target. These
include engine process startup and assertion execution, and exclude the watcher's
20 ms debounce. Identical executable/WASM hashes are checked before and after.

Five interleaved runs of the unchanged 17-scenario native resource fixture had
median process-plus-test time 1,082.13 ms before migration and 1,088.43 ms after it.
The fixture SHA256 is
`48e79329b410961cac07b134b855a7581cc3d9aa15c94aef65ba89e5269c9fba`.
This small comparison does not establish a game-wide performance improvement.

## Runtime and production coverage

The toolchains are locked Nix Clang 23.1.3/libstdc++ 16.2.0 and Emscripten 4.0.22.
QuickJS 2026-06-04 is fetched with SHA256
`b376e839b322978313d929fd20663b11ba58b75df5a46c126dd19ea2fa70ad2a`.
The standalone C++ boundary probe executes on native, Node WASM and Chromium.
Its original exception location is `scripts/tests/runtime.ts:28:13`. Reports
record runtime/package hashes and the actual Node/Chromium versions.

Verified checks include:

- Four native CTest probes under normal, ASan/UBSan/LeakSanitizer and TSan builds.
  The runtime probe covers signed int64 limits, float32/signed zero, null versus
  undefined, owned/frozen copies, modules, invalid shapes, limits and mapped errors.
  Delayed-reader/transitive-import regressions exclude graph loading from the
  evaluation timer; infinite initialization and function loops still require
  interruption. Compilation uses its own two-second stage limit.
- Seven pipeline tests covering incremental reuse, deterministic publication,
  staging, compiler-worker changes, failed transforms, tampering and all three
  source-map implementations; independent strict types, type-aware lint and format.
- Twenty-one frozen-snapshot tests and 35 fast-runner/real-loader tests.
- Five GSE/TypeScript boundary scenarios with 18 assertions; unchanged resource
  integration (17 scenarios/48 assertions) and Former integration (30/60) in WASM.
- All 576 unchanged recorded land-worker resource observations: matched, zero
  mismatches, unsupported cases or errors within that bounded contract.
- Two complete production resource browser cases, default and altered source
  rules: native tile yields, actual worker assignments, city intake, displayed
  labels, next-turn income and production. These use installed assets and are
  separate from asset-free public CI.
- Real native and WASM script-only edits change observed behavior from 7 to 8
  with identical executable/WASM hashes. A malformed subsequent edit invalidates
  publication, including rejection of a stale native sidecar fallback. Lifetime
  reports separate build and actual engine execution time.
- A deterministic real-WASM test publishes another complete package between
  production `plan` and `resolve` calls. The old plan is rejected before the new
  resolver runs, and a fresh call observes the new package. The same package-token
  check is exercised through the native GSE adapter.

The resource browser fixture needed the unrelated installed TECHNOLOGY block to
reach current startup. Its synthetic resource rows and numerical expectations are
retained. The label assertion now includes the visible `= ` prefix, independently
supported by immutable original
[HUD observations](../tools/behavior-tests/ui/observations/smacx-gog-2.0-base-resource-hud.json).
No original observations were edited.

The complete local static-analysis run was discarded because source/compile
inputs changed during it. New runtime, bridge and probe units had zero diagnostics
in that run; this is not a passing stable full analysis. The delivery CI gate
independently requires a stable full run against the unchanged existing baseline.
The optional complete native GSE run was stopped to reserve resources for browser
checks; only its completed focused checks are counted. Full GSE CI partitions
must cover the complete current inventory and native engine tests.

## Retained failures and remaining scope

The existing asset-backed `former-mine-source` browser trace expects order `mine`
after its shortcut, but observes `bunker` (movement spent 3, work units 2, no
terrain improvement). Both the TypeScript adapter and unchanged legacy GSE rules
reproduce that same mismatch on identical production WASM bytes
`f9cb713e6a57ebe78251f4bee7e068c4668b2fb1b749d6333070ed2b0c17952f`.
The GSE source fingerprints are respectively
`5c190a9b3a9597e6551296ec12bfc0ff62e666f4271a3e441feec87fa5516587` and
`31482598bb8b2a45a99f00c46356b7bbd07a056a9b8f1593a0a9d44df22bbdfb`.
`WASM_SCRIPTS_ROOT` permits that controlled source comparison in the Former fixture.
The older separate WASM artifact timed out at readiness and is not equivalent
evidence. All failing logs are retained under the task's build artifacts; the
strict original trace remains unchanged and outside passing totals.

Production UI orchestration, command/event generations, cancellation, rollback
and retirement remain GSE/C++. Foreign-owner cap scenarios are covered, but this
batch does not establish complete all-player, presentation, timing, RNG or game
fidelity. These remain requirements for the full action/domain migrations.
Upstream disables its separate JavaScript stack check in Emscripten builds;
the configured native 1 MiB guard is not a WASM stack-limit guarantee. The WASM
build has a 4 MiB linear-memory stack. Independent JS stack-limit parity remains
unverified and is outside these passing numeric, memory and interruption checks.
