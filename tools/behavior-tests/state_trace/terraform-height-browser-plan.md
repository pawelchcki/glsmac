# Land height browser proof

Status: the second actual browser attempt strictly passed the bounded land Raise
case below. The first failed observation remains preserved. **One candidate
browser case, zero original-agreement cases.**

The isolated case starts from PR35 `7ee4e80b1c1723f60c3349d2d0456aee70f54873`,
native tree `115032ffc7f53ff7f0c3a9f997da12674e25e643`, default source tree
`25ef18d3222f553507291d412330262169b2e418`. It does not change production,
the passing Terraform controls fixture, PR35/PR36 branches, catalogs, lanes or
workflow files.

The intended runtime is immutable local v6:

- JS `e71036c9365a3ac87bf818e7eb49fb2344077a15aa6836371a436572cedf7f82`.
- WASM `b2c7fa273042f2407335169eb4fca51f131f1f30656301d7b7573a201b28f5b7`.
- Initial requested seed `1651011033:1377505029:3019448108:3247278135` enters
  the existing `Game.Start` quickstart seed path. No browser live-RNG getter is
  claimed, and no favorable seed selection is permitted.

## Inputs and observation

`terraform-height-browser.test.mjs` reuses the source-backed seven-owner world
from `terraform-controls-world.gls.js`: seven cities, seven Scouts, one actual
local land Former, 16×16 imported map with 128 real tiles. Opening funding is
the actual source starting reserve plus the real faction bonus. A test-only
asset override changes exactly the twenty installed TERRAIN shared turns fields (index 4) to
one; the parser uses that one field for both land and sea metadata. Names and
prerequisites stay unchanged. Original/overridden file hashes, byte count, actual loader reads and both
manifest identities are separate report fields. This is not a stock-duration
claim.

`fixtures/terraform-height-main.gls.js` supplies only declared initial selection,
read observation and eventual test exit. All work, quote selection, cancellation
and payment use actual SDL keyboard/mouse delivery to mounted controls. The
production default source is loaded without a root-handler overlay.

The actual height popup uses ordinary Buttons and a Window. Modified query P
is not consumed by those Buttons; the Window's existing handler always returns
true. The fixture appends a handler returning the same true result, queues only
scalar owner/actor/turn/session/generation metadata and keeps its native frame
reference outside that metadata. An owned root timer validates the still-current
frame/session, then reads after dispatch returns. It never calls a work or popup
callback. Full quote objects are captured only by the six requested snapshots,
not copied by the lightweight UI-state poll.

The driver uses the proven CDP Fetch main/worker classifier, print-capture
identity barrier, UTF16 append cursor and sealed raw-log collector unchanged.
Every click requires actual semantic/native geometry, intended native hover,
left-down/up ingress and matching completed mouseup dispatch. Query keys require
raw SDL ingress linked to completed normalized dispatch and exactly one fresh
query response. The close boundary requires settled popup state **and** a native
node.hide after the cancellation pointer ingress. No fixed sleeps authorize
state assertions. The entire browser test retains the existing 180-second cap.

## One case and its gates

Six full checkpoints retain all seven players, eight units, seven cities and
every field of all 128 tiles:

1. `before-height`: actual selected land Former and normal opening funding.
2. `raise-quote`: pointer MENU → Terraform → Raise. The live quote is supported,
   source-rendered fee/reserves agree with it, and actual choice zero is Cancel.
   The entire native world equals checkpoint 1.
3. `raise-cancel`: activate the actual OK while Cancel is the default choice;
   wait for its native hide and settled callback. The entire native world still
   equals checkpoint 1.
4. `raise-reopened`: use the retained normal root menu and real Raise row again.
   Its live authoritative quote and complete native world remain unchanged.
5. `raise-payment-draft`: pointer-select the actual source-rendered Expend row.
   Choice one is only a draft; the entire native world remains unchanged.
6. `raise-paid-completion`: actual OK, scalar authoritative event receipt and
   settled pending/lock state. Fee is debited once from the real payer; opponents,
   all research and all cities retain their actual state. The actual quote's
   affected canonical elevations/classes and mutation epochs are checked. The
   worker spends its real movement budget, completes work, retains its native
   definition and logical tile, and every other unit remains intact.

The paid checkpoint also runs a complete allowed-diff audit over the entire
native world. It starts with the full before-record and changes only payer
credits/revision, the actor's real movement/order flags and derived exhausted
movement eligibility, quoted canonical centers, and native shared geometry in
the actual patch/adjacent footprint. `TerrainMutation.cpp` preserves neighbor
canonical centers while refreshing shared corners and increments every recorded
affected tile epoch; `Tile::SetCanonicalElevation` clears imported source data
only for edited patch tiles. All unknown fields, payer identity/other energy
fields, actor health/morale/combat/work metadata, all resources in this empty
arid fixture and terrain outside that footprint must remain exact. Numeric
shared-corner values remain observed candidate geometry rather than an invented
original mesh oracle.

`Event.cpp` retains only scalar receipt fields. The driver binds actual
`name/event_id/caller/unit_id/action/confirmed_height` acceptance to the stored
live UI quote and resulting native fee/effect. The nested submitted quote is
not echoed by `event_result`; that payload-echo capability is explicitly
unsupported, never reconstructed from the UI observation.

Five fixed-viewport frames are retained before height work, at the quote,
after cancellation, at the payment draft and after completion. No camera input
is sent between them. Frames are candidate evidence, not original pixel matches
or typed mesh/actor-Z telemetry.

Success additionally requires final Q delivery, the native application's normal
zero-code exit state and actual `#status` text `GLSMAC exited (0).` (recorded as
`native_raw_exit_code: 0`), Node process zero, no late browser/barrier/native errors,
actual main continuation ACK, at least one actual pthread continuation ACK,
first real callback out/err identity and complete sealed raw chunks. Raw GSE
snapshot text remains available because Node's JSON parser folds integral
native Float numbers; movement additionally carries actual native Float32 bits.
The first callback must also prove `runtime_callMain_present === true`, and
every recorded worker request must have a successful continuation ACK.
Final verification scans the complete sealed raw suffix for native errors,
requires `sealed.failure === null` and exact raw/chunk equality. Any final
verification failure marks the artifact failed/partial with unknown-tail scope.
Node comparisons preserve parsed values, including signed zero where the JSON
token provides it. Native integral Float versus Int typing and exact numeric
wire spelling remain in the retained raw GSE JSON; Node does not claim to
distinguish those two native types after parsing.

## Known source lead and remaining scope

An initial pending-request concern was disproved by source inspection:
`menu.close(child)` invokes the shared on-close handlers for child menus too.
The height controller's `root.clear_active()` therefore clears that pending
request while closing the Terraform child. The case still checks the ordinary
cancel-and-reopen path. No production defect or fix is claimed.

Both height and fee are explicitly named functional approximations:
`application.band-slope-height.v1` and `application.band-fee.v1`. This case adds
no original agreement for contour, climate, dome/victim handling or fees. Coastal
and sea-domain transitions, Sea Former production, typed mesh vertices,
resident render-Z/facing, work/tool frames, animation parity, video, sound/music
and original graphics remain outside passing totals. A coastal/sea case needs a
separate plan and grant after this bounded land result.

Pure protocol tests are `terraform-height-observation.test.mjs`; their synthetic
packets validate harness rejection paths only and add zero native/browser passes.

## Preserved first attempt

Frozen height head `51563751fbfb276c83a1094a116299d85f225900` ran against the
pinned v6 engine. The single browser attempt stopped with Node exit 1 after
24.946 seconds: `#clone(preview.height_presentation)` received the initial Null
in the new observer. `src/gse/builtins/Common.cpp:91` allows clone only for
Object/Array. The bounded test-only correction retains actual Null directly and
clones only a present Object. No product change or outcome relaxation follows.

Artifacts remain at `/tmp/terraform-land-height-v6-first`: exact preflight with
all twenty row ID/name/field/old/new overrides, report, original fixture source,
failed frame, driver log and raw chunks. The actual rules hashes are original
`bb01e3ac23793da0a46713f4851d65e63b599c24aef8300ffe45e7e57b332c42`
and rate-one input
`7abf62aa4f4f562aaa86c785b67b7af2320e122cbda7901287ee3ed0ab4c5bd0`.
Raise source row 16 (`Raise Land`, line 127) changes shared turn field 4 from 12
to 1 for both domain variants; its `EnvEcon` prerequisite and other fields remain unchanged.

The real main continuation and all eight pthread continuations acknowledged;
the first actual callback proved out/err capture and callMain presence. Raw and
joined chunks are exactly 6,783,101 bytes, SHA256
`e8e6450375feaf09d17c00d2d624ece0ac6b3e7978f627d3a601a14903a1bb51`.
They are sealed but partial because the application failed. Native exit code
is unknown. Complete snapshots: 0; height actions: 0; passing cases: 0. Browser,
server and driver were reaped and the heavy lease released. The Null guard
requires a separately authorized actual verification; no retry is automatic.

The original first-attempt preflight called field 4 `land_turns`. That label
was incorrect: `terraforming_rules.gls.js` parses row[4] once and passes the
same turns value to both land and sea variants. The original preflight remains
untouched; its adjacent label-clarification sidecar records this correction.
Neither the executed bytes nor any observed outcome changes.

## Verified second attempt

Executed source `bc8a3e4a113456cce2ada80e7a56d0872911d8a0` retains the same
native/default trees, v6 engine, rules bytes and 180-second budget. The actual
case passed in 84.769 seconds; the outer Node process returned 0. The tool's
actual session 40314 completion, chunk `0ae251`, records that raw return code
independently of TAP. The application also exposed body state `exited` and
actual `#status` text `GLSMAC exited (0).`.

Artifacts are `/tmp/terraform-land-height-v6-second`; the immutable repository
summary is `terraform-height-browser-v6-proof.json`. All six raw snapshots have
seven players, eight units, seven bases and 128 full tiles. The five prepayment
worlds are identical under recursive exact JSON type/value/Float64-bit comparison.
All 96 unit movement/health Float tokens across the snapshots round-trip exactly
to Float32; the actor's movement bits are `1065353216` before payment and `0`
after completion. `terraform_height_browser_audit.py --artifacts PATH` reproduces
the read-only typed audit without launching an engine.

The actual quote names the two approximation policies, charges 4 of the real
10 credits and raises target canonical elevation 240 → 1500 while retaining land
domain. Nine quoted canonical tiles and the 25-tile shared-geometry footprint
account for the complete native difference. The read-only audit classified all
229 changed native fields; no other field changed. Payer revision advances 1 → 2
and its balance 10 → 6. Quote, Cancel, ordinary reopen and Expend draft preserve
the entire observed world. The accepted receipt contains the actual scalar
`unit_id/action/confirmed_height` fields and opaque String event ID, not a
fabricated nested quote echo.

The real main continuation and all eight worker continuations acknowledged.
The first actual callback proved configured out/err and callMain presence.
All raw chunks join exactly to 14,465,994 bytes, SHA256
`7877baed15b88c2700f3042fe5c31f64c6ee66517dcef04541c1ced832bad473`.
The sealed failure is Null, partial is false and late errors are empty.
Delivery independently audited the raw typed worlds, bits, inputs, frames,
receipt, runtime barrier and sealed bytes. Browser, server and driver are reaped.

Five frames are retained with an unchanged viewport, **not a proved fixed camera**.
Completion auto-selects Scout 1 instead of worker 8, and the final frame shows
changed focus/position. Native actor map coordinates stay fixed; resident render-Z,
camera pose, facing and numeric mesh/corner fidelity are not established. No
pixel comparison or unchanged-camera assertion is inferred from the screenshots.

## Next source-only coastal/sea plan

No additional live case is authorized by this document. The next coherent scope
needs a separately reviewed fixture and resource grant:

1. Prepare a declared coastal world with all seven real players and registered
   source recipes. A Sea Former must come through its actual source-composed
   Foil/terraforming-capability recipe and normal production pathway in a
   separate acceptance step. Do not replace production with a fake availability
   answer or treat a disabled original template as enabled. Any bounded input
   for production stock/rate needs its own explicit source hash and scope.
2. On a genuine sea worker's shelf square away from protected cities, preserve
   quote/Cancel/draft purity, then confirm the live approximate Raise plan and
   fee. Capture every affected neighbor, land/sea class and epoch, all players,
   the unit definition and actual naval-recovery state. Its renderer remains the
   real currently supported resource; no invented Sea Former art is introduced.
3. Observe legal reversal through the same initiating worker's actual recovery
   context after a real turn boundary. Retain all seven players' genuine income,
   research and movement differences at that boundary. Separately reject illegal
   docked-port/foreign-resident stranding cases without charging or mutating work.
   Technology bypass must not waive those domain/treasury/geometry restrictions.
4. Resolve camera/resident/mesh observation capability before any numeric visual
   claim. Existing native refresh logs and screenshots are observations only;
   a new read-only renderer getter would need a separate proven need and C++
   lease. Coast/climate/Pressure Dome/victim algorithms, original graphics,
   animations and audio stay outside passing totals until independently observed.

## Reproducible preflight and strengthened read-only re-audit

The actual accepted browser attempt used a separately executed source-only
`preflight.mjs`, retained next to its original artifacts. The original committed
browser driver did **not** emit that file. The existing historical preflight,
report, raw/chunks, worlds and initial audit result remain immutable; new producer
metadata is not attributed retrospectively to that run.

Future captures now call `terraform-height-preflight.mjs` before starting their
asset server or browser. It hashes actual loaded runtime files, source/fixture
bytes and original/executed rules; derives map dimensions/count from the actual
map bytes; records all20 shared-duration old/new fields and both domains; and
writes `preflight.json`, exact main/world input sources and `fixture-map.MP`.
It checks these against the actual capture snapshot, rejects a differing existing
artifact, and makes no native policy claim before runtime. The optional standalone
metadata preparation command starts no browser and evaluates no WASM:

```sh
node tools/wasm-tests/terraform-height-preflight.mjs \
  --scripts-root /path/to/frozen/source \
  --app-dir /tmp/wasmsmac-terraform-pr2-web-v6 \
  --assets-dir /path/to/installed/assets \
  --artifacts-dir /path/to/new/height-artifacts
```

The later normal browser command may consume only a byte-identical preflight
from those same source/runtime/input bindings. An old or changed preparation
fails before engine launch. A metadata-only fresh-directory check on source
238c5f5d produced
`/tmp/terraform-height-reproducible-preflight-only/preflight.json`, SHA
`7ce14a78dbf610f01d57671fbc6e52316389998635ffb71858d669ef3072268a`, with
`candidate_executed:false`. That is a preparation result, not another game case.

The strengthened auditor independently binds all six retained world policies to
actual raw `TH_INPUTS.policy` and requires exact native types/values
`{version:1, ignore_technologies:true}`. Missing, changed, wrong-version or
Int/Bool-substituted policies reject. Existing raw state remains the authority.
Public metadata tests create a fresh directory without an engine; policy mutation
regressions also run against the actual six captured packets when
`TERRAFORM_HEIGHT_CAPTURE` points to the retained artifact directory.

The proof JSON keeps its initial `typed_raw_audit` and original report SHA as
history. Its additive `typed_raw_reaudits` entry identifies the current auditor
source SHA and separate committed `terraform-height-browser-v6-reaudit.json`
output/hash. That read-only replay consumes the unchanged14,465,994-byte raw
capture and original report/preflight, checks all6 worlds/229 changed fields and
96 native Float tokens, and adds zero game/browser cases. No original-world or
expected-answer data was regenerated.

## Explicit envelope and complete finalization audit

The current re-audit recognizes exactly two preflight envelopes. The explicit
`terraform-height-producer-preflight.v1` schema must contain its required fields,
source/input hashes and report digest binding. The **one historical** kind-less
`prelaunch-input-binding` record is recognized by its complete declared shape and
immutable SHA791b078a…64622; absence of `kind` is not a generic fallback. Both
paths bind available captured source/helper hashes, exact fixture files, head and
runtime, requested seed/budget, shared-duration rows and actual native Raise
metadata. An unknown/null kind or a stripped V1 kind rejects. No historical
preflight or expected world is rewritten.

`terraform-height-browser-v6-reaudit-finalization.json` is a further, separately
identified read-only re-audit. Older initial and v2 results remain recorded.
It checks the complete sealed raw/chunks and UTF16 offsets, reported lengths and
hashes, no read/close/browser/late barrier errors, full final-suffix fatal scan,
main and all8 pinned-runtime worker continuation ACKs, actual first and recorded
callback capture identities, actual native Q ingress/dispatch/exit request, and
actual retained body/status/native code0. Native-field-only `audit_records` has
**zero full browser case credit**.

Full browser credit additionally requires genuine completion evidence from the
external launching tool/process. It can never be inferred from native DOM status,
TAP, the report's `status`, or a producer writing its own assumed future exit.
For this historical capture the retained actual tool receipt is pinned to
session40314/chunk0ae251, raw process0, reaping, and its original raw/report/
preflight/head bindings. The external artifact SHA6ab902e…0673d is unchanged.

```sh
python3 tools/behavior-tests/state_trace/terraform_height_browser_audit.py \
  --artifacts /tmp/terraform-land-height-v6-second \
  --outer-outcome /tmp/terraform-land-height-v6-second/raw-outcome.json \
  --output /path/to/separate/read-only-audit.json
```

`--outer-outcome` defaults to `ARTIFACTS/raw-outcome.json`. Missing external
evidence fails the full audit and adds no browser case. Future externally supplied
records use explicit `terraform-height-external-process-outcome.v1`, retain actual
launch command, tool session/chunk and original completion result, native exit and
reaping, and bind exact capture `raw_sha256`, `report_sha256`, `preflight_sha256`
and `host_head`. The supplied completion must be an actual external observation;
the auditor/producer does not create it or authenticate arbitrary operator files.
Wrong-run, unknown-schema, missing/nonzero completion or unreaped records reject.
The existing historical receipt is not reusable for another capture.

## Continuous journal and physical-route re-audit v4

`terraform-height-browser-v6-reaudit-route.json` separately identifies the current
read-only audit. Historical initial/v2/v3 auditors, results and their hashes remain
unchanged in the proof ledger. The original14,465,994-byte raw/report/preflight,
external session40314/chunk0ae251 and native/Node exits are reused without a new
game or browser run. This audit adds no original-game or new browser case.

The recorded936 actual Module output callbacks cover UTF16 offsets0…14465994
continuously, with the original newline after each append and no missing middle
callback or final suffix. This successful pinned bootstrap begins with an empty
log; its normal `onExit` updates status only. Continuous coverage is a contract
of this capture, **not a universal claim that bootstrap direct-log/error paths
must use Module callbacks**. A future genuine unjournaled bypass needs separately
supported evidence; callbacks must never be invented to fill a gap.

All50 presentation drains report enabledtrue/dropped native Int0. Their82661
native event sequences are unique and continuous from1, validated before any
lookup map can overwrite a duplicate. Coverage ends at the observed final drain;
unobserved UI work after exit is not implied. Every native energy revision is
an exact Int in all6×7 player records before fee/revision arithmetic, excluding
Python Bool-to-Int coercion.

The actual Q ingress, begin and matching end are joined by native ingress ID;
end has no code field. Their carrier packet is raw line844 before the line845
exit marker (zero-based), after the final native checkpoint. This partial order
is supported specifically by this fixture: its timer drains on source line131,
then prints `TH_EXIT_REQUEST` and exits on132. It is not a general claim that a
drained event's raw packet always precedes an exit inside another handler.

Full browser credit also requires the retained eight physical pointer receipts:
MENU → TERRAFORM → raise → default Cancel/OK → TERRAFORM → raise → Expend →
confirm/OK. The auditor replays actual native node creation/parent/semantic roles,
text, visibility and effective geometry at each source fence. It checks exact
source command/choice semantics, enabled raise rows/native widgets, native-to-CSS
conversion using retained viewport/canvas bounds, positive intended-node or
descendant mouseover, matching left ingress/down/up and completed dispatches.
Each reported receipt must equal its actual native event, and each whole click
must precede the fresh next observation input. Resulting checkpoint states alone
cannot substitute for those input observations. The existing scalar payment ACK,
all-player purity/effects/fee/epochs, raw native types/F32 bits, complete sealing
and genuine external Node completion checks remain required.

Asset-free and retained-capture mutations cover loss/duplicate/reordered events,
missing callbacks/suffix, exit-carrier ordering, non-Int revisions, omitted or
reordered pointers, wrong semantic action, geometry/CSS/hover/ingress/point/
completed-end/choice and native-disabled widgets despite an enabled source packet.
These are negative protocol tests, not additional gameplay observations or an
original UI, mesh, animation, audio or Sea agreement claim.

## Exact native pointer identity types v5

`terraform-height-browser-v6-reaudit-pointer-types.json` is a separate subsequent
read-only replay, retaining v4 and every earlier result unchanged. Native pointer
ingress and dispatch-begin buttons must be exact Int1; all ingress/begin/end
ingress IDs must be exact Int before equality. This matches the producer's
strict `button===1` checks and prevents Python BoolTrue from masquerading as1.
Coherent raw/report Boolean counterexamples were accepted by the previous v4
validator and are rejected by this version, including both down and up paths.
The accepted original capture still passes unchanged; no new browser case or
native input was executed and no historical callback/receipt was fabricated.

## Complete input, source and artifact binding v6

`terraform-height-browser-v6-reaudit-inputs.json` is a further independent
source-versioned read-only replay. Earlier source/result hashes and all capture
files remain unchanged. The exact six P-query ingress/begin/end triples each
belong to one native drain carrier: this fixture prints `TH_NATIVE` **before**
that `TH_TRACE` in the same owned timer. The audit requires Native < carrier <
next Native (or exit for the final query), never a fictional key-packet-before-
Native order. Events retain their actual native sequence; unrelated bootstrap
drains are not forced into checkpoint intervals.

Every raw pointer down/up ingress/begin must be exhausted by the recorded eight
physical clicks. Extra unreported button actions cannot be hidden by keeping
only the expected report entries. Actor8's native owner joins payer0's logical
identity; exact Int actor coordinates join the quoted8,8. Actual opening source
reserves10 plus Gaian bonus0 must equal the initialized native payer energy10,
with captured last-income turn0. No changed source-funded treasury is inferred.

The admitted installed-asset profile requires actual override readsInt1 and the
captured original/executed opaque manifest IDs12743b42…888e3→740c1c9f…3ae10,
alongside its original/executed rule hashes, source-driver and20 shared-duration
rows. No missing historical manifest payload is synthesized; other asset
profiles need explicit support. All five named PNG files must exist and match
their actual SHA256. This validates file bytes, not original pixels or pose.

The future metadata producer rejects relevant dirty tracked/staged Native,
Default, fixture/helper or driver source, including relevant untracked and
ignored loader-visible inputs, before emitting any HEAD-labelled artifacts.
Real temporary Git tests exercise clean and dirty full producer calls; unrelated
notes can stay dirty. The old historical preflight remains immutable: its
tracked-diff/source bindings are retained, but it receives **no invented proof
of an untracked-clean worktree**. The new guard does not run a browser or game.

The final check set passed124 Python cases with zero skips (63 public protocol,
61 actual retained mutations), plus6 metadata-only Node cases. Public CI should
select its public classes explicitly, including `FrameFileTests`, rather than
counting private skipped classes. Corrected test-fixture carrier selection uses
the recorded P fence's containing packet, not the first bootstrap drain. Old-
accept/new-reject counterexamples cover foreign/remote actors, contradictory
funding, relocated query carriers, unreported buttons, loader identity loss,
missing frames and ambiguous source cleanliness. These add no new capture,
native execution, original agreement or Sea coverage.


## Current wrap-up acceptance: partial bounded evidence, full browser credit0

The v7 read-only result and `terraform-height-browser-v6-wrapup-scope.md`
supersede earlier complete-browser/exact-callback identity claims. Historical
raw, report and derived audit files remain unchanged. Exact per-call messages or
digests were not captured; contiguous offset metadata cannot establish exact
callback identity/count. The current audit therefore retains one bounded
state/receipt case and awards **zero complete-browser passing cases**. No
producer/hook change or replacement browser run was used to hide this gap.

All48 physical modifier/command keyboard edges for K/six P/Q, every one of the
eight pointer clicks, native coverage capabilities, exact supported modern
external command, five decoded PNGs and the existing typed source/world/exit
checks are now required. Modern message/digest positives and legacy unsupported
classification are public protocol checks, not future actual observations.
The final134 Python checks passed with zero skips (72 public,62 retained),
including new `ProtocolKeyboardRouteTests`. The unchanged real14MB replay
returns explicit partial scope/full0/bounded1. Publication and CI remain
Delivery-owned; no new feature batch starts after this wrap-up.


### Final source-derived Raise footprint audit

The later read-only audit requires the producer report to state Boolean candidate
execution before assigning any credit. It derives the fixed land Raise plan
from BEFORE native centers/topology and the installed band/slope policy, then
requires all nine canonical edits and the exact25-tile affected region. Shared
Native corner integers are derived from the four incident post-batch centers
with C++ signed division; neither the live quote nor AFTER geometry supplies
expected answers. This checks Native state fields, not rendered mesh vertices.

The unchanged retained capture still passes229 exact field changes and96 Native
Float checks. All140 public/retained checks pass (75public/65retained, zero
skips), including coherent one-patch/remote/wrong-slope/missing effects that the
previous audit accepted. The new additive result is
`terraform-height-browser-v6-reaudit-footprint.json`; prior results remain
historical. Missing per-callback message identity remains unsupported: complete
browser count0, bounded state/receipt count1, no new Native or browser execution.

The assertion-based auditor explicitly rejects optimized Python at module entry.
Real file CLI, `-m`, import, `-O`/`-OO` and `PYTHONOPTIMIZE` negatives confirm the
guard, while normal commands remain unchanged. A final actual read-only replay
passed with the guarded source; the compact `reaudit-guard.json` receipt binds
and exactly reconstructs its result from the preceding result plus its sole
source-hash change. No Native or browser run was added.

## Current capture preparation and evidence scope

Future land captures require a runtime provenance manifest (WASM_RUNTIME_PROVENANCE, or build/provenance.json) whose source_head resolves to the current native source tree and whose JS/WASM digests match the actual runtime files. Active Default scripts are hashed separately. Missing or stale manifests fail before launch. Preparation and capture may share one fresh directory only when its prepared inputs match exactly; the atomic capture claim consumes that directory even after a failed attempt. Retained run output is never overwritten.

The latest historical re-audit observes six typed worlds and bounded state/receipt facts, with one independently recognized legacy execution receipt. Complete entity/world and complete browser counts remain zero: v4 detail rows lack native raw identity echoes and callback metadata lacks exact per-call content. Self-declared modern outcome JSON does not establish an independent OS execution witness. Historical captures, source/runtime versions and earlier result files remain unchanged.

## Current publication qualification

The current source/runtime manifest is a declared consistency record, explicitly UNVERIFIED compile attribution. The latest scope is `terraform-height-current-observations-only-scope.json`: every emitted native/execution/bounded/browser passing-case counter is0. Private historical journal facts remain recorded observations, not a public retained replay or published passing credit. This supersedes positive credit terminology in the older versioned proofs without rewriting them.
