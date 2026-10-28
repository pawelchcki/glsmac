# C++23 quality foundation validation

Work started from `pawelchcki/wasmsmac:main` at
`d05fb1dcf724fcbd7c1330dfe0e64f32cfd6610c` on 2026-10-28, in an isolated
worktree. The original checkout's unrelated changes, GSE sources and original
observations were preserved. This is the initial C++/tooling batch for roadmap
section 3; it does not complete the JavaScript migration or every ownership audit.

## Toolchain and platform evidence

- Nix input: `f05535a0efcb2134c478d1e88434fadf486d42b5` (2026-10-27), locked
  with its NAR hash in `flake.lock`.
- Native: x86_64 Linux, Clang/tidy/format/symbolizer 23.1.3, libstdc++ 16.2.0,
  CMake 4.4.4, Ninja 1.13.2. Linux native builds and the sanitizer probes execute
  in that shell. LLVM 23.1.3 is the stable LLVM release packaged by this input;
  tools do not drift with a moving channel during ordinary development.
- Browser: Emscripten 4.0.22, SDK revision
  `bebaf7e50e31865b0724f17eaa52e161e2dfef5a`, SDK installer commit
  `15915cad554b707837024dc2758b6a1c5b94b036`, SDK Node 22.16.0. Full FastDebug
  application compiles/links with `-std=c++23`. The shared feature probe executes
  in actual WASM and reports `C++ 202302; libc++ 200100`.
- Windows: the added CI probe pins Clang 23.1.3 and records its C++23 library
  floor on windows-2025. CI verified `C++ 202302; MSVC STL 145` with Clang
  23.1.3, runner image windows-2025-vs2026/20261021.278.1. The existing complete
  Windows application build remains a separate unverified item. The Windows SDK/STL comes
  from the runner image and is not independently locked by the Linux flake.
- aarch64 Linux, macOS, Portable32 and full-application TSan are unverified.
  Supported configuration syntax is not counted as an executed platform test.

The feature floor checks scoped enums, `std::to_underlying`, and
`string_view::contains`. Production currently requires no additional C++23
library features; add matrix probes before depending on them.

C++23 compilation exposed and fixed an invalid null string initializer, an
incomplete vector element declaration and dependencies on transitive C-library,
mutex and exception declarations. Normal first-party CMake targets no longer
mutate `CMAKE_CXX_FLAGS`. Language/warning/instrumentation settings stay off
vendor targets. Portable vendor targets receive explicit ABI options so their
architecture still matches the application, while the embedder remains a host
tool. Broad portable/Windows build verification remains necessary.

## Recorded static-analysis baseline

The first complete analysis covered **326 distinct translation units** and
recorded **192 diagnostic occurrences**. This includes headers, with duplicates
from multiple translation units removed. The initial baseline contains:

| Priority | Occurrences | Follow-up |
| --- | ---: | --- |
| High | 44 | Analyze reachable paths, native lifetimes and concurrency assumptions first |
| Medium | 144 | Review 138 initialization findings and six compiler warnings |
| Low | 4 | Three deprecated C headers and one boolean literal modernization |

High-priority categories are 16 constructor/destructor virtual calls, 14
thread-unsafe C APIs, seven apparent GC allocation leaks, and seven other analyzer
reports. These are preserved findings, not 44 proven bugs. In particular:

- `VALUE` allocations register with the embedded collector; analyzer leak reports
  in BaseRename/TileManager need the custom GC ownership model considered.
- Research validation returns an error string before rejecting invalid priority
  shifts; the analyzer's trace assumes that returned string is empty. Existing
  application validation tests remain authoritative.
- ScriptStages queue indices originate in three fixed callback registrations;
  its enum-range warning still needs that call graph considered.
- Texture region arithmetic, nullable camera handling and raw Buffer invariants
  remain explicit audit items. Passing bounded probes does not settle every
  hypothetical call.

No blanket disables or automatic expected-output changes were introduced. The
profile includes selected performance, portability and bugprone checks even when
they currently emit no finding. New findings and extra identical occurrences
fail the gate. The regression suite exercises the real clang-tidy executable,
proving an introduced warning fails after the original baseline passes. Source
or compile-command changes during analysis invalidate that run, including
preset and toolchain configuration edits. Native standalone behavior, research,
text and texture probes now also export actual compile commands. The native
FastDebug report separately inventories 11 platform-specific sources absent
from that database; Debug-only, Windows and WASM static analysis is not counted
as passing native analysis. WASM sources receive their own C++23 compiler/runtime
probe lane. Unknown missing native sources still fail the incremental gate.

## Sanitizer failures preserved and repaired

`tools/cpp-quality/sanitizer-before.json` records the failing runtime SHA-256 and
the original leak totals. Full failure reports were retained locally under
`/tmp/glsmac-cxx23-failing-evidence`:

| Existing application scenario | Before repair |
| --- | --- |
| unit_menu_order_lifecycle | 16,056 bytes in 141 allocations leaked after all assertions passed |
| starvation_notice_controls | 16,898 bytes in 137 allocations leaked after all assertions passed |

Two concrete owner losses were traced with the matching LLVM symbolizer:

1. UnitManager erased removed definition pointers. Removed definitions and morale
   sets now have `unique_ptr` owners until `Clear`, preserving existing borrowed
   lifetimes and releasing them after units, including their render metadata.
2. Parsed switch cases outlived their temporary Scope allocation. Switch now owns
   that Scope with `unique_ptr`; the Scope destroys cases once, preserving their
   order and the interpreter's borrowed case list.

A review also reproduced GCC UBSan retaining unrelated Engine.cpp RTTI in the
thread probe. An engine-free logging adapter now links and executes the actual
Thread/Class probe without unrelated GC/Config definitions; no sanitizer checks
are disabled. UUID package selection verifies the OSSP API rather than accepting
util-linux uuid.pc, and included C++ fragments select their owning translation
unit.

The same existing scripts are the sanitizer regressions; their observations and
assertions are unchanged. All four focused engine scripts, including both
previously leaking lifecycle scenarios, pass ASan/UBSan with leak detection after
these repairs. Normal buffer/thread CTest probes passed under both
ASan+UBSan and TSan before these engine failures were discovered. Final repaired
engine results are recorded in the delivery/CI evidence; earlier probe passes do
not count the leaking engine scenarios as passes.

Nix's SDL2 package is an SDL3 compatibility layer. ASan's dlopen interception
loses the caller's SDL3 RUNPATH; the shell explicitly supplies that dependency's
library path. The engine then starts with instrumentation and leak detection
active. LeakSanitizer itself cannot inspect threads inside this session's ptrace
sandbox; executions outside it passed the probes. Neither leak detection nor
sanitizer error recovery is disabled by the lane.

## Reproducible checks and remaining scope

Commands are in [the developer guide](cpp-quality.md). Local evidence is written
under `build/cpp-quality*` and uploaded by the C++ quality workflow. The complete
GSE suite uses the existing four disjoint partitions and coverage aggregation,
including native engine tests and immutable runtime hashes. CMake changes also
trigger those existing PR jobs. Browser checks run after competing local heavy
workers finish.

The initial native allocation/concurrency probes pass; focused ordinary engine
checks pass for GC, rollback, menu lifecycle and notice controls. Texture
regressions pass 415 FLIC and 7,345 CVR assertions; the native installed-text
consumer passes nine scenarios/67 assertions. Exact final build, sanitizer,
full-GSE, formatting and analysis outcomes must be read from the final delivery
record and current-head CI, rather than inferred from this baseline inventory.

Remaining roadmap work includes the complete Windows/toolchain matrix, aarch64
execution, the 192-finding triage backlog, warning-clean target expansion, reusable
core extraction, broader ownership/concurrency audits and the future standard-JS
boundary's stale-handle/rollback/shutdown tests. TS type/lint gates belong to that
separate migration. None of these unsupported cases is included in passing game
fidelity totals.
