# TypeScript migration

The first production migration moves tile-improvement yield arithmetic to
`scripts/game/land-resource-yields.ts`. The existing GSE resource handler calls
the standard JavaScript module through a temporary adapter. GSE still observes
native faction technologies and adjacent mirrors. TypeScript computes the yield
plan, requests only the technology checks needed for caps, and resolves the plan.
Existing resource and Former action scenarios remain the acceptance tests.

Ordinary unit-command eligibility and Hold/Sentry/Activate cancellation planning
also run in `scripts/game/unit-orders.ts`. The temporary `unit_orders.gls.js`
adapter resolves the exact live native entity, copies its observations, and
executes the plan under the existing native write authorization. It preserves
native cancellation, complete rollback receipts, stale-entity checks and state
restoration. Validation and planning require the same package generation before
any mutation. Skip and other commands reuse the migrated eligibility policy.

A complete TypeScript action lifecycle, production UI orchestration, timers, and
the remaining GSE application are still pending.
See [foundation measurements and retained failures](typescript-validation.md) and
[unit-order validation](typescript-unit-orders-validation.md).

## Development

Use the locked development shell (`nix develop`), then:

```sh
npm ci --ignore-scripts
npm run scripts:build
cmake --preset native
cmake --build --preset native -j2
npm run scripts:watch
```

Run the independent delivery checks with `npm run scripts:types`,
`npm run scripts:lint`, `npm run scripts:format`, and `npm run scripts:test`.
`tsc --noEmit` uses its own incremental cache. TypeScript 6.0.3 is pinned to
match the supported range of the pinned type-aware ESLint parser.

The Rust Oxc NAPI transformer runs in Node, once per changed module. One compiler
configuration serves development, tests, and packaging. `scripts:watch` retains
the process and debounces filesystem changes. Changing the compiler implementation
invalidates publication and requires restarting that worker. This implementation
does not embed a TypeScript compiler in the game or accept TypeScript mods at
runtime. The native C ABI and browser compiler integration experiment remains open.

Sources use ES modules, explicit `.js` import specifiers, and type-only imports.
The configured subset targets ES2022 with NodeNext resolution, isolated modules,
and verbatim module syntax. Do not use namespaces, ambient const enums, or
decorator metadata requiring whole-program inference. Run type checking separately
from transformation; a successful transform is insufficient for delivery.

## Package and binary lifetime

Generated JavaScript/maps live in ignored `GLSMAC_data/standard-js`. The manifest
records source/config/tool hashes, the exact compiler/options, schema signature,
and every output hash. Per-module transforms live in `build/scripts/transform-cache`.
Publication verifies unchanged inputs and replaces the manifest atomically.
Failed builds remove that manifest and invalidate attached browser packages.

Native builds atomically select the active package in `bin/scripts` and retain
older roots for readers that already selected them. Clean a staged directory only
when no process uses it; fresh packaging workspaces contain one generation.
WASM builds mount the active package through encoded JSON data in `GLSMAC.js`. Subsequent script builds
replace that data; they leave `.wasm` and native executable bytes untouched.
Use `node tools/scripts/build.mjs --runtime-js PATH/GLSMAC.js --stage PATH/scripts`
for custom output directories. The default searches `build/*/bin/GLSMAC.js`.
Production release builds consume JavaScript without running a compiler at startup.
The loader carries a quoted base64 JSON envelope; unlike comments and local
identifier names, its marker survives release minification. Non-ASCII UTF-16
code units are escaped before encoding, so `atob` preserves exact source/map
text. Old unminified development outputs can still be refreshed through their
legacy comment boundary until their next relink. Remove that compatibility path
once those older development runtimes are retired.

`node tools/scripts/release-loader.mjs` links a real Emscripten `-O3` loader,
mounts every package file (plus a Unicode witness), and checks repeat publication
and unchanged WASM bytes. PR CI runs this probe before the browser boundary.

CI always regenerates the current package after restoring an engine cache.
The compiled cache includes the schema, generator and static loader, and excludes
ordinary TypeScript policy sources. Headless source snapshots carry a verified
active package alongside fresh GSE. Package validation requires no npm dependencies
in artifact consumers. A present but invalid local package cannot fall back to an
older native sidecar. Changing a schema requires rebuilding C++; a signature check
rejects a new package against old native validators.

## Runtime and value contract

QuickJS 2026-06-04 is fetched by SHA256 and compiled as C for both native and
Emscripten. Its libc/OS helper module is absent. Each runtime belongs to its
constructing thread. Windows Clang uses a narrow C11-time compatibility header
and disables upstream's pthread-based Atomics, which policy cannot access on any
platform. Its private closure-kind bitfield uses unsigned storage: the MSVC ABI
otherwise makes the three-bit enum signed and truncates valid kinds 4–7.
Its final link explicitly includes the compiler-selected compiler-rt
archive for BigInt's 128-bit division helper, since CMake suppresses default
runtime libraries on this target. CI compiles and executes both the Clang/MSVC-ABI and existing MinGW
runtime boundaries.
The default JavaScript heap is 64 MiB and the native stack guard is 1 MiB.
Upstream disables that separate stack guard on WASM; its linear-memory stack
is configured to 4 MiB, and independent JS stack-limit parity remains open. The
evaluation deadline is 200 ms for module initialization and function execution.
The complete import graph is resolved first. Trusted setup, JSON parsing and
bytecode compilation have a separate two-second stage limit; host file reads,
source-map decoding and copied-value preparation are outside the execution timer.
Limits apply to the JavaScript runtime; this is not
a claim that the entire application is memory bounded or a security sandbox.

The boundary copies value trees in both directions and freezes script inputs.
There are no borrowed native pointers, native callables, or entity handles in this
first contract. Cycles, proxies/exotic objects, custom prototypes, accessors,
sparse arrays, symbol keys, and asynchronous work are rejected. Native authority,
world mutation, RNG, lifetimes, transactions and scheduling remain in C++/the
unmigrated application. Date and ambient random access are unavailable to policy;
no promise jobs are pumped. Future event/callback APIs must define cancellation,
generation checks and teardown before exposing native state.

Signed int64 values cross as checked BigInt, including values beyond Number's
safe range. Number results must be exact finite float32 values (`Math.fround`
where needed); signed zero is retained. Null and undefined remain distinct.
Plain records, dense arrays, strings and booleans are copied. Nested data is
limited to depth 64 and each collection to 65,536 entries. Arithmetic overflow
rejects the result rather than silently narrowing. This slice introduces no
event ordering, RNG or serialization protocol.

Each `scripts/contracts/*.schema.json` generates its own TS interfaces/runtime
validators and contributes C++ structs/validators to one generated header. The
native/package signature covers the sorted set of schema paths and content
hashes. Adding, editing or removing a domain contract requires a native rebuild;
ordinary policy edits still reuse engine bytes. Removed contracts retire their
generated TS modules. Duplicate type names and entrypoints across domains fail
generation. The yield and unit-order messages are versioned; string, nullable
string and finite float32 fields use the same declared types on both sides. Error classes and reasons survive the adapter; stack locations map
back to original TypeScript. A failed runtime is discarded before another call.
The adapter captures `#js_package()` after planning and supplies it as the fourth
`#js_call` argument during resolution. Publication between these phases rejects
the operation before a different package can consume its plan. A fresh operation
then uses the current package; no result combines two policy generations.

## Verification and removal inventory

`script-runtime-probe` exercises the actual C++ API, numeric bounds, deep copies,
frozen inputs, invalid values, module imports, limits and mapped exceptions. The
native CTest target runs in both sanitizer presets. For the same API in WASM:

```sh
emcmake cmake -S tools/script-runtime -B build/script-wasm -DCMAKE_BUILD_TYPE=Release
cmake --build build/script-wasm -j2
node tools/script-runtime/run.mjs
npm --prefix tools/wasm-tests ci
npx --prefix tools/wasm-tests playwright install chromium
node tools/script-runtime/run.mjs --browser
```

The WASM drivers assert the exact original TS exception line and column and retain
package/runtime identities in `build/scripts/runtime-*.json`. The production GSE
boundary suite additionally checks errors, ownership, wrapped-object rejection,
and lazy technology observations. Existing original observations are unchanged.

Remaining removal work, in dependency order:

1. Define authoritative commands/events, entity ID generations and cancellation.
2. Migrate one complete action through real UI, rollback and retirement.
3. Move resource observation bindings and domain tests to that contract; remove
   `land_resource_yields.gls.js` and the `#js_call` adapter when no caller needs them.
4. Port cohesive game/UI modules, scheduling and GSE-only tests to TypeScript.
5. Migrate existing web/tooling JavaScript incrementally.
6. Remove GSE parser/interpreter, legacy bindings, script GC integration and shims
   after the last domain cutover. Preserve language-independent scenarios and
   recorded reference evidence throughout.

`node tools/scripts/lifetime.mjs --native build/native/bin/GLSMAC --wasm build/wasm/bin/GLSMAC.js`
executes an isolated TypeScript edit in the real engines, checks the resulting
behavior, and verifies unchanged native executable/WASM hashes. It also verifies
that a failed local package cannot fall back to the older native sidecar.
