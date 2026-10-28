# First static cached-body acceptance

Status: one actual static census case passed; see the
[audited capture and its limits](unit-body-census-proof-v1.md). The original
source preparation below preceded that capture. The Native
observer first source `f0dae99a` remains preserved; its first build failed on the
private `Game::GetGame` call (exit 2, 309.108 s). Delivery's reviewed two-line
public-access/non-null readiness repair is
`11532fef4051690a61f23b2f89a48ba939ecceac`, source tree
`23e54d08b7dbb00f6b42d325c180a8c868b30ee2`. The corrected v8 build completed
successfully and its actual runtime hashes are in the proof. This test source
preserves those seven observer paths and the production Default. The separate
portable runner described below has source and pure-test verification only.

The established installed-source stack world is imported from
`unit-stack-order-browser-fixture.mjs`. It has seven owners, seven cities,
nine Scouts and a base-free two-Scout local stack at (8,8), morale 2/1. Source
Default remains `a69dd4e0a9620f90bd12c8eb8636ca22e24ed47c`. Installed manifest
must be `12743b42e275842a7ae3862572ec769c6d86f647394f0edb1ff9db6d104888e3`.
Seed remains `1651011033:1377505029:3019448108:3247278135`; terrain is the existing
declared 16×16 arid fixture. These are synthetic inputs, never original answers.

New entrypoints:

- `tools/wasm-tests/unit-body-census-browser-fixture.mjs`: GSE fixture strings.
- `tools/wasm-tests/unit-body-census-browser.test.mjs`: 180 s outer test,
  existing 120 s native-observation window, canonical fetch/log collector helpers.
- `tools/behavior-tests/state_trace/unit_body_census_proof.py`: strict offline
  parser, world/typed scalar/census/evaluation-envelope validator and CLI.
- `tools/behavior-tests/test_unit_body_census_proof.py`: eleven asset-free
  evaluator boundary checks; zero game/reference credit.

The existing strict decoder `state_trace/unit_body_census.py` remains unchanged.
It reads Native String JSON directly in Python, preserving uint64 strings,
Float text and signed zero; there is no JS re-serialization of the raw worlds.

## Declared flow and acceptance

1. Mount exact immutable installed default scripts plus the established three
   native world observer helpers. Require clean tracked/untracked `src` and
   Default directories, exact source/default trees and explicit immutable runtime
   provenance whose native tree and JS/WASM hashes match the actual web bytes.
2. Wait for initialized frontend using existing Native `focus_owned_base`
   readiness, then issue one ordinary Native tile selection for (8,8). Capture
   actual tile-select and a **new** map `unit_preview` callback after the request
   fence. Require mounted preview payload and rendered identity to bind Scout A;
   explicit-unit selection must be null. A subsequent application timer callback
   supplies the deferred idle read boundary. This is neither a native frame
   timestamp nor a dispatch-quiescence API claim.
3. Immediately serialize the full all-owner world and typed Native Int IDs plus
   health/movement Float32 bits. Call `get_unit_body_census(game)` twice
   synchronously with no action or timer dispatch between them; print each raw
   returned Native String immediately in its own ordinal/event-prefix envelope.
   Immediately serialize the full native world/scalars again. Callback serials
   and actual mounted UI identity must stay unchanged across the entire boundary.
4. Exit normally through `glsmac.exit`. Native application exit 0, canonical one
   main/eight distinct worker hook acknowledgements and real output/callMain
   bindings, exact complete raw/chunk join, browser close, owned asset-server
   child exit/wait and sealed collector are mandatory **before** offline evaluation.
   Server stdout/stderr, process identity/exit and all raw data are retained.
5. Decode every checkpoint with the existing strict terrain v4 schema validator.
   Require all seven owners, seven bases, nine unique Native units and 128 tiles;
   every owner's unit/base inventory, typed scalar identities and exact health/
   movement Float32 bits must match. Require entire before/after worlds and
   typed scalar arrays to be equal, including signed zero.
6. Compare each complete census against the exact Native unit/owner/definition
   projection, including foreign, hidden, absent and never-allocated bodies.
   Require one actual present, submitted and actor-visible cached body for the
   selected Scout A. Check its actual resource/instance relation and all present
   positions against native Float32 normalization with actual destination
   offsets. Reject ambiguous/duplicate resource-instance claims, unavailable
   fields, changed caches/counts or differing synchronous census results.
7. The external driver must also finish with actual Node exit 0 and independently
   confirm owned process reaping and the raw seal. The in-process evaluator
   cannot manufacture that final external exit or a full host process inventory.
   A skip, partial/incomplete observation or setup failure is never a game pass.

No Native world is retained across a later action as FloatPtr-backed data:
checkpoint serialization happens inside each synchronous capture. Plain scalar
metadata is all that the final result references. No new Native wrappers are
copied into GSE array/object literals. The query listener/timer never changes
health, orders, positions, Show/Hide, visibility or resources.

Wrong-thread/uninitialized/different-game cases remain source contracts and
strict decoder negatives, not executed runtime tests here. This first case
creates no additional backend Game or epoch, so it makes no stale-session claim.
The decoder's 1,024-unit/4 MiB bounds are tested synthetically; this nine-unit case
does not claim a measured native bound/performance result.

## Verification before first execution

Source-only checks: 18 existing decoder tests plus eleven new proof checks pass.
Twenty existing terrain-schema tests also pass. The new proof unit tests isolate
its read/exit/purity logic with a deliberately simplified synthetic world and a
mocked terrain schema boundary; a separate test rejects that world through the
actual schema validator. Those mocks never enter the browser/CLI production
validation path. Python and Node syntax checks pass. Direct no-assets launcher
execution records zero passing cases and one explicit skip, zero engines.

The repository now contains the bounded preparation and external process runner:
`state_trace/unit_body_census_preflight.py` and
`state_trace/unit_body_census_runner.py`. From `tools/behavior-tests`, inspect
`python3 -m state_trace.unit_body_census_runner prepare --help` for explicit
source, web/runtime provenance, installed assets, dependencies, tools and fresh
artifact paths. Preparation starts no game. The separate `execute` command
requires the reviewed manifest SHA and an independently authorized exclusive
lease. It preserves actual OS child wait/exit, observed process identities,
source/runtime hashes and the lossless raw/chunk boundary.

This portable successor has never run a game. The actual capture remains bound
to the preserved external `c2a13e` driver and its recorded `0fbb` manifest; its
passing result is not transferred to the new runner. The runner deliberately
accepts only the reviewed v8/source profile. Changed source/runtime needs a new
reviewed profile and evidence. Preserve the first real failure and stop; there
is no automatic retry or oracle change.

This proves at most cached submitted-body identity and stored normalized
coordinates in a static current frontend. GPU pixels, camera/projection/world
copies, actual movement, leg/tool/limb animation, action/frame/cadence, gameplay
facing, audio and original-game appearance/policy remain unsupported. The one
clean original Scout exploration supplies future observation questions only;
there are zero accepted original comparison cases in this proof.
