# Unit graphics and Workshop: separate candidate proof tracks

## Existing-design Workshop browser entrypoint

`tools/wasm-tests/unit-workshop-browser.test.mjs` is an optional installed-data
candidate application test. It is prepared in a separate follow-up branch; the
verified Workshop production freeze at `87d22ffe` remains unchanged. It requires
that freeze plus the shared cursor and native print-hook APIs accepted through
delivery source `256bff5c` (or their independently reviewed successors). The
follow-up source does not edit or copy those shared helpers.

After source review and an exclusive browser grant, the smallest real execution
is one serial test with an immutable compatible native/WASM runtime and matching
web shell, source root and installed assets:

```sh
SMAC_ASSETS_DIR=/path/to/installed/game \
WASM_APP_DIR=/path/to/immutable/web-shell \
WASM_SCRIPTS_ROOT=/path/to/combined-reviewed-source \
WORKSHOP_BROWSER_ARTIFACTS_DIR=/tmp/unit-workshop-browser-attempt-1 \
node --test tools/wasm-tests/unit-workshop-browser.test.mjs
```

This is one launch with the existing 180-second test limit. Missing source,
runtime API, resource fingerprint, geometry, input receipt, state or rendered
evidence fails closed. A retry must use a new artifact directory and source
freeze. Source syntax/adapter checks are not a browser pass; neither the new
GSE fixture nor this complete flow has executed yet.

Source preparation replayed 79,810 retained actual native presentation events
from the earlier Terraform capture through the adapter, checking eight live-node,
label, bounds, visibility and sequence boundaries. Ten additional synthetic
protocol-boundary checks cover scoped dialog/list membership, selected/modal/
focus fields, ambiguous text, missing keys, destroyed rows, hidden ancestors and
dropped events. These are parser/adapter checks with zero engine/browser runs;
they do not turn the earlier incomplete Terraform attempt into a Workshop pass.
The reproducible local source check and exact hashes are retained at
`/tmp/unit-workshop-adapter-check.mjs` and
`/tmp/unit-workshop-adapter-source-check.json`.

The synthetic 16×16 world retains all seven native owners, seven cities, eight
units and all 128 tiles. Its production inventory registers actual installed
basic/optional naval recipes, prices and population requirements. This is an
explicit input inventory, not an inferred technology result. Source rules,
technology/research/energy, city production/citizens and every unit/tile remain
observed by the existing complete native observer.

The fixture focuses its owned city through the existing native projection API,
then the browser physically clicks that reported map point. It opens production
and WORKSHOP through real mounted native controls. Every later button comes from
one visible native dialog, its actual `$button`, mounted text and effective
bounds. A chooser row additionally requires native `semantic.choice` membership
with its stable key, label and node. No source ordinal, invented coordinates,
guessed viewport or direct controller call authorizes input. Shared
`nativeToCanvas`, `nativeHover` and `completedNativeClick` connect actual geometry
to SDL ingress and completed application dispatch. Focus/modal state is retained
as observation, independently of inferred visibility or selection.

The flow checks the full inventory, source name/cost/stats, stock Former preview,
pointer Cancel, physical Escape, draft-only SELECT, normal production OK, stale
base refresh and base hide/reopen cleanup. UI-only stages compare complete native
snapshots unchanged and forbid production receipts. Normal OK requires exactly
one accepted production event and the chosen native project; only that city's
project/minerals/processed-turn fields may differ, with switch loss read from the
actual existing native query. Other native fields remain exact. Stale-context
setup arms a declared native `game.select_base` refresh after a live Workshop has
been observed. It never calls `screen.set`, `hide`, `choose` or any production
handler. The selected base's normal reconciliation still runs and is observed.

A separate declared black-backed pixel control loads authentic `VT.cvr` through
the normal installed asset bridge/loader. Its accepted source SHA is checked in
the actual remote manifest. Dynamic native geometry and the actual canvas box
identify both pixel regions; the Workshop must contain the component's observed
physical palette. Full screenshots, acquisition times and native region metadata
are retained. This is a candidate resource/preview relation, not original camera,
composition, color/shading or pixel agreement.

## Observation and input handling audit

Modal Windows consume root query keys. The observer therefore attaches one
read-only query listener to each actual base/Workshop Window, retained until its
normal native destruction. `popup.gls.js`'s created Window key handler and
`base_screen/workshop.gls.js`'s Window key handler already return `true` for every
key path. `src/gse/Wrappable.cpp::Trigger` copies the ordered callback map and
runs every callback; the final return wins. The observer also returns `true`
for every key, preserving the existing result and every existing callback.
It does not add a root listener that returns `false` after handled Escape.

Reserved Ctrl+Alt+P increments a query and queues observation. The actual native
keydown ingress/begin/end must complete. The owned timer reads fresh native
state after the callback returns; it never snapshots during input dispatch or
uses a world snapshot taken before mouseup. `Input::ProcessEvent` emits dispatch
end after the UI callback stack returns; GSE timers run from the later
`GLSMAC::Iterate`/GSE async iteration. The timer then prints the observation and
drains actual presentation packets. Browser acceptance retains both the native
query receipt and the uniquely advancing query number. Ctrl+Alt+J arms only the
declared native context invalidation; Ctrl+Alt+Q queues native exit for teardown,
which is explicitly not an original quit-dialog comparison.

Window attach/remove records, native show/hide/destroy, modal/focus/selection,
actual effective geometry and input events are distinct observables. Production
default, observer fixture, world input, observer helpers, shared helper files,
runtime JS/WASM and web shell have separate hashes. The existing test-only print
hook installs before the unmodified native runtime captures its configuration.
The cursor retains every UTF-16 suffix and raw chunk, closes the producer before
sealing, and marks incomplete capture honestly. Raw exit zero, normal bootstrap
`exited` status, complete fresh snapshots, no dropped native events and retained
logs are required for a real pass.

## Existing unit graphics: reachable ordering witness

Source-only audit identifies an application inconsistency, not yet an executed
visible failure or original comparison:

1. On a base-free tile, create two owned healthy Scouts A/B with movement and
   NO_ORDERS, morale 2/1. `Unit::GetSelectionWeight` gives A weight 272 and B 270
   (active 200, the current Scout category term 60, morale 4/2, health 8).
2. Select/preview that populated tile through the ordinary frontend path. A call
   to `Tile::GetMostImportantObject` or `GetMostImportantUnit` warms
   `GetOrderedUnits` and `GetOrderedObjects`, storing A first.
3. Issue a legitimate Hold or Sentry to A and wait for actual native ACK plus
   `FR_UNIT_UPDATE`. `Unit::SetOrder` flags refresh; `Unit::Refresh` recomputes
   A's active state. A now weighs 72; B remains 270. Tile membership, morale,
   health and positions are unchanged.
4. `UnitManager::RefreshUnit` calls `Game::RenderTile`, which calls
   `Tile::Render` and computes a fresh local `GetUnitsOrder`. It does not
   invalidate the two cached order flags. Those flags are only changed by
   AddUnit/RemoveUnit and base membership paths, not this weight change.
5. `Game::SelectTileOrUnit` fallback, `Game::UpdatePreviews`,
   `Game::GetSelectedTileMostImportantUnit` and `UnitManager::DeselectUnit` then
   consume the stale cached first unit A. Re-selecting the tile can fall into
   tile selection/preview A even while active B has greater current weight.

The smallest meaningful executed probe must use real frontend units and this
actual caller sequence, pin A/B native IDs, warm the cache before the order
change, retain the native order receipt, then capture actual unit-select versus
tile-select events and the mounted preview's unit ID/order after re-selection.
It must check all seven owners' native state and allow only A's legitimate
order/readiness change. A complementary health-only case can change weight
without membership or turn advancement. A later cache-invalidation fix must
make the same pre-recorded probe agree with fresh current priority, without
changing the source weight policy, original observations or UI expectations.

There is currently no public frontend telemetry for the rendered map instance's
unit identity, cached order vector, facing or animation frame. Pixel/body identity
and cache introspection are explicit gaps; a read-only seam would need a separate
file lease, review and fresh native build. This follow-up changes no C++ and
claims no executed cache defect yet.

The earlier `ShowFakeBadge(!instance_id)` lead is latent under current callers.
`Tile::Render` is the only production caller of `ShowFakeBadge`; before rebuilding
it hides and clears every retained fake badge. Move/despawn/tile-transfer paths
also clear them. Thus the replacement-ID branch has no demonstrated reachable
production path. It remains unchanged instead of being counted as a visible fix.

## First runtime attempt and native receipt type audit

The first real attempt used execution head `ca170322`, immutable production
`87d22ffe`, native `115032ff`/v6 and byte-pinned shared CDP helpers from the strict
Terraform run at `0322db43`. Its Node test exited 1 after 23.171 seconds during
startup: the new observer incorrectly added integer zero to the native transaction
String `0_1`. No Workshop control or native snapshot was reached. Browser/server
cleanup completed, raw chunks joined exactly, and logs were sealed/partial.
`/tmp/unit-workshop-browser-v1/outcome.json` retains the exact failure and hashes.
This is a fixture failure, with zero Workshop/original passes and no established
native exit-zero result. The shared transport itself acknowledged the actual
main runtime and eight pthread runtime requests.

The bounded fix preserves the complete transaction String, validates all native
receipt scalar types and prints the first observed type record. It changes no
production source, expected observation, identity scheme or game behavior.
`Game::NotifyEventResult` constructs name/event_id as String, caller as Int and
success as Bool. `Event::GetId` and its serialized field are String; the current
generator combines slot and sequence into a token, which the observer never
parses or numerically normalizes. The whole new flow was audited separately:

| Field | Actual identity/type | Treatment |
| --- | --- | --- |
| Receipt event_id | Opaque native transaction String | Preserve exact String; never equate to entity ID |
| Receipt caller | Native participant Int | Materialize Int |
| Live unit/base id | Native entity Int | Use Int to reacquire current native registry object |
| Production choice id | Source production String | Match the existing native available inventory |
| Production descriptor unit_id | Definition String, e.g. Formers | Match template identity, not a live unit handle |
| Unit order request unit_id | Live native entity Int | Kept distinct from the descriptor field of the same name |
| Presentation node ID | Native presentation String | Exact lookup; no arithmetic or source-ordinal substitution |
| Query/watch/Workshop tokens | Separate script lifecycle Int counters | Fence their own sessions only |

The first failed execution source remains unchanged. A separately frozen
second attempt and its distinct observer failure are recorded below.

Independent review also caught a pre-run keyboard matcher defect: raw SDL ingress
contains keycode/scancode/SDL modifier bits, while dispatch BEGIN contains the
normalized GSE code/modifiers. The bounded key matcher now checks normalized
fields only on BEGIN, links the preceding raw ingress by identical ingress ID and
event type, and requires the matching later END. Raw fields remain unchanged.
Actual pinned P/R packets and wrong-ID/type/fence/completion negatives cover this
boundary. Replaying the full strict `0322db43` ledger matches all 32 complete
keydown triples; its final observer-I BEGIN has no retained END and is correctly
rejected as incomplete. This missing observer completion is outside passing
input totals. The independently queued Workshop snapshot protocol is designed
to drain after dispatch, and still needs its actual first successful execution.

## Second runtime attempt and quote/source-domain repair

The second attempt at execution head `ad0ad724` exited 1 after 21.527 seconds,
before any Workshop controls or native snapshots. It proved native receipt
scalar types, then the observer called `get_production_switch_loss` for the
inland city's globally visible Sea Former recipe. The native guard correctly
rejected that quote. The observer incorrectly assumed every global inventory
entry had a valid quote at every city. Sealed/partial raw output, exact source
and runtime identities remain at `/tmp/unit-workshop-browser-v2/outcome.json`;
zero Workshop/original passes and no established native exit-zero are retained.

The test-only shared reader now preserves every global owner unit recipe and
records each city's actual native quote as `{accepted,loss,reason}`. Rejections
retain the native reason and do not filter rows or imply broader buildability.
Meaningful post-catch validation/collection lets iteration reach a later land
recipe. Normal production OK continues to use the actual authoritative API;
only the selected land Former's accepted quote supplies the loss assertion.
The dedicated `workshop_observation_native.gls.js` probe is prepared to exercise
real inland land → rejected Sea → land collection and immutable world/update
state, the same Sea quote on a real native coastal fixture, and source linkage
with a Native-parsed synthetic weapon table whose Terraforming row is shifted.
Its passing status requires an actual separately recorded native execution.

The old browser-only `weapon:2` expectation came from the compact three-row
synthetic source table. Production's existing VT guard never pins that ordinal.
The observer now uses the game's actual `load_smac_text('alphax.txt','rules')`
API to link the Former's actual UNITS weapon token to the indexed WEAPONS token
and role. The bounded prototype/chassis/armor/reactor/movement/combat guard and
Terraforming role9 remain unchanged. No installed ordinal is invented, no
production guard or artwork changes, and actual installed-source/initial-query
browser validation remains pending.

## Third runtime attempt and actual base-bar scope

The third frozen execution `d5e6ec84` exited 1 after 35.400 seconds. The normal
installed loader linked the Former to actual weapon row18/token `Formers`/role9.
All four global recipes survived, including the separately observed inland Sea
quote rejection. A real SDL base click, completed Window query key and one fresh
native snapshot reached the seven-owner/seven-base/eight-unit/128-tile guards.
These are bounded startup observations, with zero completed Workshop browser or
original passing cases and no established native exit-zero. Exact sealed/partial
raw evidence remains at `/tmp/unit-workshop-browser-v3/outcome.json`.

The next failure was an observer ancestry assumption. Actual visible native
CHANGE button `n484` is beneath queue panel `n480`, bottom-bar area `n466`, and
root `n1`. It is a sibling of the base Window `n208`. This matches production
`base_screen/bottom_bar.gls.js`, which constructs its frame with `p.ui.root.area`;
`bottom_bar/queue.gls.js` creates CHANGE below that frame. Visibility, text and
native bounds were present. They are not changed or inferred by the repair.

The test observer tags only the actual `screen.sections.bottom_bar.frame` with
a base-ID/session-specific source and links it to the actual base Window through
`presentation_part`. Both are existing bound Native methods: Object.cpp118 calls
`TraceRole`; Method561 registers the callable as read-only; TraceRole330 changes
the actual object's role/source and TraceRegistration350 emits its native DOM ID.
`presentation_part` validates Native UI wrappers and emits the actual part ID,
Window owner ID and relation. The browser requires the current base/session,
visible base Window, exact observed part owner/relation, live scoped native
button/text/bounds, hover and completed native click. It still uses ordinary
Window scope for WORKSHOP/production OK and the actual Workshop Window for its
SELECT/CANCEL/preview; source audit confirms these are Window descendants.

The tracked `unit-workshop-native-base-queue.json` contains 31 exact retained
native events, selected from the 84,449-event third-run ledger. Offline replay
proves the actual sibling ancestry and reproduces the old lookup rejection.
Twelve named pure boundary cases cover current scope, wrong/foreign/stale or
duplicate scope, sibling labels, visibility, destruction, missing bounds, native
owner/relation, same-bar Window-owner replacement and packet loss/replay.
The observer re-tags on actual bar, base or owning Native Window identity change;
closed state clears all cached handles so a fresh session is linked on reopening. The new role/part annotations in these
pure cases are explicitly synthetic. Actual emission of the new annotation and
Workshop interaction remain unverified until a separately granted execution.

## Fourth runtime attempt and exact component material mask

The fourth frozen execution `aa6874bb` exited 1 after 89.601 seconds. It proved
actual base-bar role emission for base1/session1 and the actual Native part owner
Window ID before the real CHANGE click. WORKSHOP and Former-row clicks worked;
three fresh queued snapshots, source stats and `VT.cvr:crop(0,0,99,74)` binding
were observed. Cancel/normal confirmation/cleanup were not reached, and native
exit-zero was not established. The failed `>3` nonblack-control-color condition,
sealed/partial raw output and frame remain at
`/tmp/unit-workshop-browser-v4/outcome.json`. Completed browser/original passes
remain zero.

The palette-diversity condition was an unsupported observer assumption.
`Caviar::RasterPart` writes actual voxel palette colors; `Preview` guarantees no
minimum number of distinct visible colors. Exact replay of the frozen pixel-crop
formula finds two control colors: 2,879 pixels of `184,192,96` and 44 pixels of
`192,172,24`. All 2,923 pixels match the Workshop's corresponding locations/RGB,
with no missing, wrong or extra reference-palette pixels. Both crops are100×74.
All three retained seven-owner native world snapshots also compare unchanged
when UI observations are excluded. These are offline bounded observations, not
a completed application test or original visual agreement.

The replacement check keeps substantial nonempty control geometry and the actual
pinned component/native resource binding. It compares every nonblack control
material pixel exactly and rejects reference-palette pixels outside that mask.
The black-background control supplies its observed material colors; the preview
has a different panel background through transparent regions. Other preview
background colors are explicitly excluded. Black voxels, alpha isolation, unknown
material colors outside the reference palette, full assembly and original art
remain unsupported. No expected asset palette, model geometry or coordinates are
invented, and no asset-derived frame or mask is committed.

Ten tracked synthetic pure cases cover two-color and single-color components,
blank/missing controls, blank or wrong-color previews, swapped palette pixels,
extra material, a one-pixel displacement, solid-rectangle substitutions and
invalid/unequal geometry. Actual retained-image comparison is separately pinned
at `/tmp/unit-workshop-v4-material-mask-proof.json`; it starts no engine/browser.
The old threshold failure remains preserved, and a further application run
requires separate authorization after independent source review.

## Fifth runtime attempt and every consuming query surface

Execution `558dc371` exited 1 after116.163seconds. The strict known-material
comparison passed2,923pixels. Pointer Cancel closed Workshop and kept the Scout
production draft. The next actual CtrlAltP produced raw ingress36 and dispatch
BEGIN94578/END94579 with handled=true, but query4 never arrived within the
unchanged60second observation budget. Three world snapshots were retained;
keyboard Cancel, transfer, confirmation and final cleanup were not reached.
`/tmp/unit-workshop-browser-v5/outcome.json` preserves the strict failure,
sealed/partial raw output and unestablished native-exit status. Browser/original
passes remain zero.

The observer watched only the base and Workshop Windows. Native
`Container::ProcessEvent` visits relevant children first and returns immediately
when a child handles the event; `production_selection`'s existing key handler
returns true for every key. Retained pane n1653 is visible after Cancel, owns
both CHOOSE PRODUCTION title and production list n1699 (keyboard=false), and is
a descendant of base Window n208. This source-backed consumer explanation is
distinct from an observed handler-target ID: native keyboard END currently
records handled only. That missing observation capability remains a gap.

The test observer now appends its same-true listener to the actual Native
production pane as well. `Wrappable::Trigger` runs its ordered callback copy to
completion, so this appends without replacing or changing the existing handler.
An actual Native role and part relation bind the pane/watch token to its base
Window. Native pane removal detaches the watch context, and a new pane receives
a new token. Captures still run only in the owned post-dispatch timer. Pending
Native handles remain outside a new scalar-only query queue. The queue accepts
one pending request, coalesces only identical owner metadata, rejects conflicting
owners, detaches its returned metadata and allocates monotonic query counters.
The serial browser requires coalesced=0 plus one complete actual SDL ingress per
fresh query; GSE key callbacks do not independently expose native ingress IDs.
Every capture validates current base, owner session, live Native frame and phase.

| Active surface | Existing consuming handler | Observer attachment |
| --- | --- | --- |
| Base Window, production closed | Base Window returns true | Same actual Window |
| Production pane, Workshop closed | Pane returns true before parent | Same actual Native pane |
| Workshop open | Newer Workshop Window returns true | Same actual Workshop Window |
| Base closed | No supported query consumer | No global fallback or accepted query |

The actual post-Cancel key triple is added to the tracked receipt fixture;
transport completion and missing-ACK negatives stay separate from fresh world
capture. Native query protocol coverage is source-prepared alongside existing
native quote/source-reader cases, pending its own exact-runtime execution.
No production/focus/ordinary-key/input/geometry change or timeout extension is
part of this observer repair, and no further application attempt is implied.

## Sixth runtime attempt and ordered hide observation

Execution `a7511eb9` exited1 after95.767seconds. The actual production-pane
listener produced fresh query4 with token2, current Native owner/session and
coalesced0. Eight complete checkpoints passed known-material pixels, pointer
and keyboard Cancel, draft transfer, normal authoritative OK, stale Workshop
Window destruction and all seven-owner world guards. The final base-close
visibility assertion failed before reopening and native exit. Completed
browser/original passes remain zero; strict failure and sealed/partial raw are
retained at `/tmp/unit-workshop-browser-v6/outcome.json`.

The sealed producer prefix ends at WS_STATE serial20: base closed, sliding and
hiding false. The last logged native drain ends at sequence176168, still before
a same-Window hide event. The fixture prints script state before draining and
printing Native presentation packets. Production `popup.clear` calls the bound
Native `hide` before clearing the hiding flag; Native `Object::Hide` enqueues
`node.hide`. This source order supports an observation race, while actual final
hide emission was not captured and is not claimed as a passing observation.

The consumer now waits, within the existing budget, for the conjunction of
settled closed script state, an actual hide of the same cached Native Window
after the completed Escape's BEGIN, and observed invisibility. It records that
Native hide receipt before permitting reopen. A visible, missing, foreign,
stale, reshown or destroyed node cannot satisfy this cached-Window lifecycle
check. No expected visibility, product handling, geometry, input or deadline is
changed. The tracked close fixture retains the actual incomplete prefix;
subsequent hide events used by pure tests are explicitly synthetic. Fifteen
presentation boundary cases cover the full adapter, including this ordering
boundary. Actual later hide, final reopen and native-exit proof remain pending a
separately authorized run.

## Concrete graphics and Workshop gaps

| Area | Current bounded support | Unsupported |
| --- | --- | --- |
| Existing bodies | Authentic stock Former VT chassis; existing other-role fallbacks | Complete Scout/Pod/SeaFormer assemblies and tools |
| Movement | Existing body interpolation and badge blink | Original facing, trajectory/cadence and intermediate-frame agreement |
| Work/animation | Existing PSI attack/death clips; resource metadata only for Former tools | Farm/Raise/etc. clip binding, limbs, transforms, visibility and timing |
| Workshop | Existing source designs, stats, guarded preview, production draft handoff | Authoring/customization, save/obsolete/upgrade, rotation and original UI layout |
| Browser proof | Source-prepared native Window/SDL/state/pixel acceptance; two actual native startup failures retained | Workshop controls/pixels still unverified after observer type/quote failures; original passing cases remain zero |
