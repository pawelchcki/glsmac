# Portable preparation and one-use outer runner

These **new forms have never executed a game**. Public tests use synthetic Git
sources, pure Node input modules and cheap owned Python child processes. They do
not add browser/native/original passing observations. Historical Sea raw/report/
preflight/outcome/proofs remain immutable. The actual earlier candidate tools
were `/tmp/terraform-sea-height-v6-label-v3/preflight.py` (SHA9137e1bb…4d187) and
`run-once.py` (SHA7ee2f069…c27a9). Their hashes are retained as historical context;
the new tools do not pretend to be those executed bytes.

Preparation is separate from execution. It reads the unchanged Sea input module
and `rateOneSource` in a **new clean candidate checkout** containing the original
Sea fixture/driver files. It calls only their pure map/rule functions through
Node, snapshots the map/rule bytes and fixture sources, and pins source trees,
all consumed source files, Default files, runtime provenance/binaries, static web
files, installed assets, the three Node dependency packages, executables and
font configuration. It does not import GSE, start a server, create a browser or
load WASM. It rejects relevant dirty/untracked source and writes only to a NEW
output directory. Existing historical directories must not be repurposed.

Install the existing browser-test npm dependencies in that new checkout before
preparation, following the repository's ordinary lockfile setup. The explicit
`--node-modules` path must be the directory actually resolved from the unchanged
driver. `--server-python` must resolve to the `python3` the driver will find.
The Node executable, actual browser executable/cache path and font configuration
are explicit; no browser is launched merely to query its version. System shared
libraries, kernel scheduling and font-file continuity are not authenticated by
these fingerprints. Node loader/Python path injection variables are removed;
this is not authentication of an arbitrary hostile operator environment.

An operator supplies independently known expected pins. For the historical v6
profile, Native was115032ff, JS e71036…f82/WASM b2c7fa…5b7, rules bb01e3…32c42
and the shared-duration override7abf62…c5bd0. Those are historical profiles, not
a claim about a new source checkout. The exact source HEAD and Default tree must
match the chosen NEW checkout. Do not change expected pins merely to silence a
mismatch, and do not run this example without the necessary execution grant.

```sh
python3 tools/behavior-tests/state_trace/terraform_sea_height_prepare.py \
  --source-root "$SOURCE" --runtime "$RUNTIME" --web "$WEB" \
  --assets "$ASSETS" --node "$NODE" --node-modules "$NODE_MODULES" \
  --browsers "$BROWSER_CACHE" --browser-executable "$BROWSER" \
  --font-config "$FONT_CONFIG" --server-python "$SERVER_PYTHON" \
  --output "$NEW_OUTPUT" --expected-head "$HEAD" \
  --expected-native-tree "$NATIVE_TREE" --expected-default-tree "$DEFAULT_TREE" \
  --expected-js "$JS_SHA256" --expected-wasm "$WASM_SHA256" \
  --expected-rules "$ORIGINAL_RULES_SHA256" \
  --expected-executed-rules "$RATE_ONE_RULES_SHA256"
```

The seed and Node test budget come from the unchanged driver: requested seed
1651011033:1377505029:3019448108:3247278135 and180000ms. There is no separate
native120 override. All20 shared TERRAIN duration fields apply to **both** land
and sea. Native recipe price, actual treasury/quote and every world observation
remain unknown during preparation; map/rule provenance is not native evidence.
The new `terraform-sea-portable-preflight.v1` schema is deliberately distinct from
the historical preflight. The historical-capture auditor does not automatically
support new source heads, captures or external outcome schemas.

Inspecting the prepared proposal does not launch a child:

```sh
python3 tools/behavior-tests/state_trace/terraform_sea_height_run.py \
  --preflight "$NEW_OUTPUT/preflight.json" --expected-preflight-sha256 "$PREFLIGHT_SHA256"
```

Only an explicit `--execute` requests the pinned command. The runner rechecks
all pins and prepared bytes, atomically claims one use, and starts the exact
absolute Node argv with `shell=False`. It records real PID/session/process-group
and `/proc` start identities, binary stdout/stderr, real OS wait/exit and bounded
cleanup. The Node180s test keeps its separate outer200s cleanup guard. No failed
attempt is retried and no marker, preflight or completion file is overwritten.

The ownership implementation is Linux/POSIX `/proc` plus a temporary child-
subreaper flag, restored after use. Only the newly created session/group is
signalled/reaped. Adopted same-group descendants are reaped; unrelated children
are untouched. Escaping sessions are outside this observation/cleanup scope. An unavailable
ownership facility or a group that cannot be reaped within bounded TERM/KILL
waits is unsupported/failure, not proof that all possible processes disappeared. A process-group absence is
not a universal browser resource census.

Post-execution hashes, source pins, actual report input bindings and reported
native exit are retained separately from the real Node OS exit. Node0 never
implies APP0. Missing report/native status remains unknown. Timeout, nonzero,
spawn/lifecycle errors, forced cleanup, pin changes and unknown exits cannot
produce a success-shaped result. Even a process/APP0 result has **zero complete-
browser passing credit**: exact per-callback message identity remains unsupported
for the unchanged hook, and the runner cannot manufacture its caller's external
tool session/chunk receipt. A genuine operator/tool witness must be supplied
separately; neither TAP nor an invented historical `raw-outcome.json` substitutes.
The new completion is `terraform-sea-portable-external-completion.v1`, not a fake
legacy witness. No existing auditor is silently taught to trust it.

Public verification (no installed assets or game):

```sh
python3 -m unittest discover -s tools/behavior-tests \
  -p test_terraform_sea_height_runner.py -v
```

Tests exercise actual preparation without driver launch, immutable outputs,
source/runtime/rule/dependency/metadata rejection, one-use claims, Unicode byte
retention, real zero/nonzero/spawn-error/timeout waits, cleanup after a record
write failure, same-group orphan adoption and unrelated-child preservation.
They are source/lifecycle tests only. CI/catalog/publication remain Delivery-owned.
