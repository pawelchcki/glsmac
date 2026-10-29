# Architecture and development roadmap

Status: C++ quality and TypeScript runtime foundations delivered; terrain/order policy and unit-order UI decisions implemented. Full action and UI migration remains open. Updated 2026-10-29.

## Decisions

- Replace GSE (`.gls.js`) with TypeScript authored modules running as standard
  JavaScript. The migration is decided; experiments select the compiler, runtime
  and integration strategy, and establish compatibility before each cutover.
- Keep TypeScript as the source of truth for migrated application scripts and
  tests. JavaScript and source maps are generated, ignored build/cache artifacts;
  nobody maintains parallel TS and JS implementations. Existing handwritten web
  and tooling JavaScript can move incrementally.
- Make fast TS-to-JS compilation a first-class requirement. Evaluate a Rust
  transformer integrated into the build or engine loading path. Type checking
  runs separately from the immediate execution path and remains a delivery gate.
- Modernize the C++ core and enforce its quality with compiler diagnostics,
  clang-tidy, formatting, static analysis and sanitizers.
- Preserve observed game behavior, native/WASM support, existing evidence and
  explicit unsupported cases throughout the migration.

## 1. Fast TypeScript pipeline

Initial implementation: pinned Oxc build/watch pipeline, per-module caching,
atomic verified packages, independent type/lint/format checks, and copied-value
QuickJS execution on native, WASM and Chromium. Tile-improvement yield policy now
lives in TypeScript. See [development and remaining migration inventory](docs/typescript-runtime.md).
The compiler C ABI experiment and complete action lifecycle remain open.

- [x] Benchmark Oxc and SWC on representative rules, UI modules and tests. Measure
  cold startup, warm single-module edits, full script builds, memory, output size
  and source-map accuracy. Pin the selected compiler and configuration.
- [ ] Prototype a small compiler service/library boundary. Compare a persistent
  Rust build helper with embedding the transformer through a narrow C ABI for
  native builds and an appropriate WASM module/interface for the browser.
  Verify actual cross-compilation and integration support; do not assume a Rust
  crate can simply link into the Emscripten executable.
- [x] Compile as late as practical: immediately before script embedding or
  packaging for releases, and on changed-module load for development if the
  engine integration wins the benchmark. Release builds consume generated JS
  without paying for compilation at every startup. Decide whether development
  builds/mod loading should also accept TS directly.
- [x] Keep one transform implementation and configuration across development,
  tests and packaging. Cache by TS bytes, logical module path, compiler version,
  options and relevant dependency/configuration inputs. Write outputs atomically;
  reject stale or failed transforms instead of executing earlier output.
- [x] Script-only edits must need neither a C++ rebuild nor a WASM relink. Keep a
  warm compiler/watch process where useful, reuse unchanged modules and retain
  original TS paths/locations in runtime errors and stack traces.
- [x] Use ES modules and explicit type-only imports. Enable `isolatedModules`
  and `verbatimModuleSyntax`; define a supported TS subset without namespaces,
  ambient const enums or decorator metadata that needs cross-file type inference.
  Declare module resolution and the JavaScript target supported by the runtime.
- [x] Run incremental `tsc --noEmit` separately, with `strict`,
  `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Add type-aware
  linting for unsafe values, unhandled promises and incorrect API use, plus a
  pinned formatter. Fast transformation is not proof of type correctness.

Acceptance: only TS sources need maintenance for migrated modules; clean and
incremental builds produce reproducible runnable JS and useful source maps.
Initial budgets are warm changed-module transformation p95 below 100 ms and
focused edit-to-test feedback below five seconds on a recorded development
machine. These are targets, not measured results. Publish cold/warm results and
separate transform, type-check, runtime startup and test execution times.

## 2. JavaScript runtime and typed engine boundary

- [x] Evaluate a maintained embedded JavaScript runtime, starting with QuickJS,
  in both native and WASM builds. Pin runtime/version, supported language
  features, module loading, memory limits and interruption behavior.
- [ ] Define one versioned command/snapshot/event schema; generate C++ and TS
  types and runtime validators. C++ owns authoritative world state, entity
  lifetime, authorization, RNG, commits, rollback and serialization. Scripts
  provide policy, calculations and UI orchestration through explicit interfaces.
- [ ] Use immutable observations and entity IDs with lifetime generations at new
  boundaries. Define callback cancellation and teardown; prevent stale script
  callbacks from accessing retired native objects.
- [ ] Specify signed 64-bit integer and float32 behavior, signed zero, missing
  values, event order, deterministic RNG and serialization before porting rules.
  Choose checked conversions/BigInt and float32 operations explicitly; silent
  JavaScript Number coercion is not a compatible substitute.
- [ ] Replace GSE includes and timers with explicit modules and host-owned
  scheduling. Preserve observed cancellation, parent/child lifetimes and action
  ordering; uncontrolled wall clocks, randomness or promise scheduling must not
  alter authoritative simulation results.
Ordinary unit-command eligibility and Hold/Sentry/Activate cancellation planning
now have a typed TS policy, shared generated C++/TS domain contracts, and existing
native/WASM lifecycle coverage. Native identity/write/receipt checks and GSE UI
orchestration remain; this does not complete the full-action milestone below.
Pending-result matching, completion selection, menu closure and activation-dialog
context policy now also run in TS. Native callback lifetime, entity identity,
rendering and effect delivery remain with the current host adapters.

- [ ] Migrate one terrain rule and one full action lifecycle through production
  UI/command handling first, then port cohesive domains. Keep temporary GSE
  compatibility only for unmigrated modules, with a tracked removal inventory.
- [ ] Retire GSE parser/interpreter, script-only GC integration, legacy bindings,
  compatibility shims and duplicated tests after the final domain cutover.
  Preserve useful language-independent scenarios and original observations.

Acceptance: the first slice executes in native, asset-free WASM and real browser
paths with matching declared state, all-player observations, ordering, errors,
rollback and teardown. Each cutover retains existing red probes and coverage.
Completion means production scripts and migrated tests use TS/standard JS, and
normal application/test builds no longer require GSE.

## 3. Modern C++ and automated quality checks

Initial foundation: locked Nix/LLVM 23.1.3 shell, target-scoped C++23 settings,
changed-line formatting, baseline-aware tidy/analyzer checks and native sanitizer
lanes are implemented. See [developer commands](docs/cpp-quality.md) and
[validation and remaining gaps](docs/cpp-quality-validation.md). Two demonstrated
shutdown leaks are repaired; broader platform verification and ownership audits
remain open. These partial results do not complete the matrix-dependent items.

- [ ] Target C++23 for first-party code after verifying the pinned native,
  Windows and Emscripten compiler/standard-library matrix. Upgrade toolchains
  deliberately where needed and record any temporary feature restrictions.
  Adopt newer features for demonstrated clarity or safety rather than novelty.
- [ ] Replace global language/build flags with target-scoped CMake features,
  options and dependencies. Require the selected standard, disable extensions
  where supported and export accurate `compile_commands.json` configurations.
  Extract reusable core/headless targets incrementally.
- [ ] Prefer RAII, rule-of-zero types, explicit ownership and `std::unique_ptr`
  for unique owners. Use shared ownership only when required. Make borrowed
  pointers/views explicit, use bounded views where suitable, initialize state,
  check narrowing conversions and use scoped enums and `[[nodiscard]]` where
  ignored results are errors. Review concurrency, lock ordering and exception
  safety at JS/native and frontend/backend boundaries.
- [x] Add a pinned `.clang-tidy` profile covering selected `clang-analyzer`,
  `bugprone`, `cppcoreguidelines`, `modernize`, `performance`, `portability` and
  concurrency checks. Validate meaningful findings against real compile flags
  and relevant platform configurations; do not blindly enable every check.
- [x] Triage existing diagnostics into a tracked baseline with fix priorities.
  Fail on new actionable findings; fix high-severity existing findings in
  bounded batches. Scope generated/vendor exclusions and document narrow
  suppressions. Review automated fixes as normal code changes.
- [ ] Enforce the pinned clang-format configuration on changed first-party code.
  Introduce target-specific warnings and warnings-as-errors after triage; avoid
  unrelated mass formatting and blanket warning suppression.
- [x] Keep static analysis and native AddressSanitizer/UndefinedBehaviorSanitizer
  lanes; add ThreadSanitizer coverage for supported native concurrency tests.
  Exercise JS/native ownership, stale handles, rollback and shutdown explicitly.
- [ ] Provide matching local commands and CI gates for TS checking/linting,
  C++ formatting/tidy, builds and applicable behavior tests. Schedule full
  analysis separately from fast incremental checks without hiding new findings.

Acceptance: supported builds use the selected modern standard, tooling commands
are reproducible locally and in CI, new actionable diagnostics fail delivery,
and meaningful dynamic checks supplement static analysis. A clean linter result
alone does not establish correctness or game fidelity.

## 4. Faster tests, consistent evidence and session handoffs

- [ ] Profile engine initialization, script transformation/evaluation, observation,
  GC, serialization and shutdown. Benchmark optimized test builds against `-O0`,
  retaining test APIs/checks and separate debug/sanitizer coverage.
- [ ] Consolidate execution, process cleanup, immutable runtime selection and
  evidence validation into one runner with domain plugins. Bind compiled native
  provenance separately from fresh script inputs and generated JS.
- [ ] Reuse the existing scenario traces and all-player/presentation observers.
  Pilot native full-snapshot export when profiling warrants it. Introduce delta
  transport only after reconstructed state matches independent full snapshots.
- [ ] Generate scheduling from one catalog; use bounded, memory-aware sharding.
  Validate dependency-based selection against complete coverage before narrowing
  checks. The existing preparatory Stable selector is not an activated speedup.
- [ ] Generate a small handoff record for current delivered main, task ownership,
  dirty paths, runtime identity, last checks and remaining gaps.

Acceptance: preserve the full coverage union, original-reference isolation,
strict mismatches, failure artifacts and unsupported accounting. Target affected
integration feedback below 30 seconds and ordinary warm PR checks within
five to ten minutes; report execution, queue and review time separately.

## Delivery order

1. Establish the TS transform benchmark, native/WASM runtime spike and typed
   boundary contract; introduce C++ quality tooling and record its baseline.
2. Deliver the first TS action slice with separate type/lint gates; profile and
   improve test execution while keeping current coverage.
3. Port rules, UI and tests domain by domain; modernize touched C++ ownership and
   interfaces with tidy/sanitizer verification.
4. Remove GSE and transitional infrastructure, then verify complete applicable
   native/WASM/browser suites and publish measured iteration costs.

## Tool references

- [Oxc TypeScript transformer](https://oxc.rs/docs/guide/usage/transformer/typescript)
  and [Rust transformer structure](https://oxc.rs/docs/contribute/transformer).
- [SWC transform API](https://swc.rs/docs/usage/core) and
  [WASM TypeScript transformer](https://swc.rs/docs/references/wasm-typescript).
- [TypeScript isolated modules](https://www.typescriptlang.org/tsconfig/isolatedModules.html)
  and [separate checking with noEmit](https://www.typescriptlang.org/tsconfig/noEmit).
- [clang-tidy configuration and compilation databases](https://clang.llvm.org/extra/clang-tidy/).
