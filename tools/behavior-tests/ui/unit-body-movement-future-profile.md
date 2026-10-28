# Future movement capture profile

The portable movement runner prepares a `version: 2`, `profile: current-checkout`
manifest from an explicit clean checkout and supplied runtime/web provenance.
It derives `HEAD:src` and `HEAD:GLSMAC_data/default` with the selected Git binary,
checks the supplied provenance names those trees, and compares the actual
JavaScript/WASM and web bytes with that metadata. A new source commit no longer
has to contain the historical Native23/Defaulta69 trees merely to prepare inputs.
The current reviewed runtime must still implement the case's required APIs.

This is **metadata consistency**, not independent evidence that a compiler
produced the runtime from those sources. Preparation and later reports explicitly
record `runtime_binding: metadata-consistent`,
`independent_compile_proof_verified: false`, and `fidelity_passing_cases: 0`.
A separate source/build review and exclusive execution authorization remain
necessary. No new compiler attestation system or game execution is supplied by
this profile repair.

Run the CLI from the declared checkout, using the actual Python executable:

```sh
/absolute/python3 tools/behavior-tests/state_trace/unit_body_movement_runner.py prepare \
  --source-root /absolute/clean-checkout --expected-head FULL_CURRENT_COMMIT \
  --runtime-provenance /absolute/runtime/provenance.json --web /absolute/web \
  --assets /absolute/installed-assets --artifacts /absolute/NEW-artifacts \
  --dependencies /absolute/node_modules --node /absolute/node \
  --git /absolute/git --python /absolute/python3 \
  --browser /absolute/chromium --fontconfig /absolute/fonts.conf \
  --playwright-browsers-path /absolute/browser-cache
```

This command prepares inputs only. Actual preparation requires the declared
installed-asset profile, matching runtime metadata/bytes, the current source
files, and the existing dependency link; public metadata tests use synthetic
unexecuted bytes and do not claim that full installed-data preparation ran.
The historical constants in the runner describe the old capture, not current
capture requirements. Current committed helper bytes, including
`tools/wasm_assets.py`, are included in the source and postflight pins.

Git and Python are resolved to canonical executable files and hashed at
preparation. Python must be the interpreter actually running the outer runner.
Outer Git checks use that pinned path. The Node producer receives the exact
preflight path/SHA and verifies it before setup; its five Git calls, Python
evaluator, and Python asset server use the canonical paths in that manifest.
Tool hashes are checked before launches and after completion. Child receipts
retain actual requested command paths, PID/spawn/close/wait/status facts and
bounded deadlines. A changed `PATH` cannot redirect these calls. The asset server
also records its requested command, arguments and working directory separately
from its actual PID/exit evidence.

These checks bind executable file bytes and requested paths. They do not attest
executed memory, every shared library, Python's entire standard library, or all
environment-dependent behavior. Existing optimized-Python rejection and real
child error/timeout/cancellation handling remain required. A spawn error with a
misleading `status: 0` is still not an OS exit zero.

The new profile rejects old manifests rather than reinterpreting them. The
historical `66dc0b99` source freeze, equivalent-source map, Node1/APP0 incomplete
outcome, raw evidence bundle and retained-only auditor remain unchanged. That
capture has zero movement/full-browser/Original passing cases and no accepted
final all-owner effect comparison. New profile source/pure tests add no game
credit and do not repair the missing intermediate sample in that capture.

The embedded GSE, map/world bytes, 32-call sampling limit, positive delays,
route/progress predicates, all-owner/F32/effect guards and executable deadlines
are unchanged. The future producer itself has not executed a game.
