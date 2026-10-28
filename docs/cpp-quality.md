# C++ development and quality gates

The first-party application, native embedder and standalone WASM probes target
C++23. CMake requires the standard, disables GNU language extensions and exports
`compile_commands.json`. Vendor projects retain their own language settings. Native Release keeps the
existing host tuning; use `GLSMAC_NATIVE_ARCH=OFF` for a general CPU target.
No new C++23 library APIs are required by this initial migration: the native,
Windows and Emscripten libraries have different feature coverage.

## Locked development environment

On Linux with Nix and the `nix-command flakes` features enabled:

```sh
nix develop
clang++ --version
clang-tidy --version
clang-format --version
cmake --preset native
cmake --build --preset native -j4
ctest --preset native
python3 tools/cpp-quality/run-native.py
```

`flake.lock` pins nixpkgs; `flake.nix` selects LLVM 23 and checks its version
against `tools/cpp-quality/toolchain.json`. The shell includes Clang, tidy,
format, lld, the matching LLVM symbolizer, CMake, Ninja, Python/PyYAML and the native development libraries.
`nix develop --command COMMAND ...` runs the identical environment in CI.
CMake caches its compiler: use a fresh build directory when switching compiler
environments. The initial supported Nix systems are x86_64-linux and aarch64-linux; only systems
with recorded execution evidence should be treated as tested. Nix is optional
for normal builds, but delivery checks require the pinned tool versions.

Upgrade deliberately with `nix flake update nixpkgs`. Check the LLVM version,
update `toolchain.json` if necessary, run the complete matrix, and review the
regenerated diagnostic baseline in the same PR. A lockfile update is not proof
that a newer compiler or standard library is compatible.

The browser SDK remains Emscripten **4.0.22**, installed as described in
[WASM setup](../tools/wasm-tests/README.md). It supplies its own Clang and libc++;
the Nix compiler builds the host embedder. Do not substitute the native compiler
for em++ or use native desktop libraries in the WASM target. Windows keeps the
existing native build/presets; its full build must pass before claiming the
cross-platform C++23 migration complete.

## Formatting and analysis

```sh
python3 -m unittest discover -s tools/cpp-quality -v
python3 tools/cpp-quality/check.py format --base origin/main
cmake --build --preset native --target embed glsmac_version -j2
python3 tools/cpp-quality/check.py tidy --base origin/main --jobs 2
python3 tools/cpp-quality/check.py tidy --all --jobs 2
```

Choose the actual PR base ref/SHA rather than assuming the remote is named
`origin`. Formatting checks changed first-party C++ lines with the existing
`.clang-format`; surrounding syntax may need adjustment. It never rewrites
files. Use `clang-format --lines=START:END -i PATH` for a focused correction.
GSE `.gls.js` files are not JavaScript and never enter these checks.

The native FastDebug tidy lane uses real compilation commands, including defines
and include paths. Standalone native behavior, research, text and texture probes
are registered as CMake targets so their commands enter the same database.
Changed implementation files select their translation units. Included implementation
fragments have an explicit owner map (currently Object.colormap.cpp → Object.cpp). Any changed
first-party header, CMake configuration (including `CMakePresets.json`), toolchain
or analysis configuration selects the full native compilation database. Unknown
implementation files absent from the database fail the check; configure their
actual targets rather than analyzing them with guessed flags. An exact list of
11 platform-specific exceptions in `NATIVE_UNSUPPORTED` records the Debug-only
memory watcher, Windows sockets and WASM-only sources. Each report lists those
paths and reasons outside static-analysis passing totals. A matching platform
database still analyzes them when available. The separate C++23 WASM probe lane
compiles and executes the graphics, platform, threading, buffers, asset bridge,
map and installed-text consumers with Emscripten. This is compiler/runtime
coverage; Debug, Windows and WASM clang-tidy coverage remain gaps. Generated `src/tmp` files, external
translation units and vendor diagnostics are excluded; parsing errors anywhere
are fatal. New first-party standalone targets should be registered in CMake so
they can be analyzed with their actual flags.

The selected profile includes Clang's analyzer plus bounded bugprone,
cppcoreguidelines, modernize, performance, portability and concurrency checks.
It does not indiscriminately enable every available check. `-Wall -Wextra` apply
to first-party targets; `GLSMAC_WARNINGS_AS_ERRORS=ON` is available for warning-clean
subsets. Broad warning promotion awaits triage. The selected correctness-related
compiler diagnostics also enter the tidy baseline gate.

`tools/cpp-quality/baseline.json` records existing findings, priorities and source
anchors. New findings fail delivery, including additional identical occurrences.
Line shifts alone do not create findings. Changing the compiler or profile
invalidates the baseline. High-priority analyzer/bugprone/concurrency findings
need correctness triage first; initialization/compiler warnings are medium;
mechanical modernization/performance findings are low. These are triage priorities,
not proof that every warning describes a defect. False positives need a narrow
suppression with a reason and review; do not add blanket disables.

Baseline generation is an explicit maintenance operation, never a CI step:

```sh
python3 tools/cpp-quality/check.py tidy --all --write-baseline --jobs 2
```

Review every addition and retain failing evidence before accepting a baseline
update. Ordinary checks do not rewrite it. Per-translation-unit logs and the
observed diagnostics are written under `build/cpp-quality` and uploaded by CI.
PR analysis checks affected translation units; main, weekly and manual runs
analyze the complete database. Baseline changes themselves trigger full analysis.

## Sanitizers and observed scope

```sh
cmake --preset native-asan
cmake --build --preset native-asan -j4
ASAN_OPTIONS=detect_leaks=1:halt_on_error=1 UBSAN_OPTIONS=halt_on_error=1:print_stacktrace=1 ctest --preset native-asan
ASAN_OPTIONS=detect_leaks=1:halt_on_error=1 UBSAN_OPTIONS=halt_on_error=1:print_stacktrace=1 python3 tools/cpp-quality/run-native.py --binary build/native-asan/bin/GLSMAC
cmake --preset native-tsan
cmake --build --preset native-tsan --target thread-runtime buffer-copy -j2
TSAN_OPTIONS=halt_on_error=1 ctest --preset native-tsan
```

Sanitizers instrument compilation and linking in any build configuration and
stop on the first reported error. ASan/UBSan and TSan use separate build trees;
combining them is not supported. Invalid names and unsupported platform requests
fail configuration. The legacy `-DSANITIZER=ON` maps to address+undefined.
Instrumentation is scoped to first-party targets, including native probes;
external libraries are not claimed to be instrumented.

The CTest probes reuse the production Thread/Class and Buffer implementations:
allocation/copy boundaries, module affinity, callback progress, reverse teardown,
quiescing, collector drain and join. The engine lane additionally runs existing
GC, combat rollback, unit-menu lifecycle and notice-control scripts, covering
script/native lifetime and stale submissions. It checks completion text and
logged test failures because the legacy test process can return zero on failure.
These are bounded checks, not full gameplay or all-thread race coverage. TSan
currently covers the native probes, not the complete application. There is no
standard-JavaScript boundary yet; its ownership tests follow that migration.

LeakSanitizer needs permission to inspect sibling threads; restricted ptrace
sandboxes can prevent it from running. Run on a normal development/CI host and
report environmental failures; do not turn leak detection off to manufacture a
pass. ASan/UBSan does not imply absence of races, and a clean static-analysis
result does not establish game fidelity.

See [recorded validation](cpp-quality-validation.md) for the exact tested matrix,
commands, remaining diagnostics and unsupported cases.

References: [Nix development shells](https://nix.dev/manual/nix/latest/command-ref/new-cli/nix3-develop),
[Clang-Tidy configuration](https://clang.llvm.org/extra/clang-tidy/).
