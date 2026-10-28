# Existing unit graphics: minimal real frontend cache witness

This witness began as source preparation at `38255a4b`. It subsequently
reproduced a complete native HUD mismatch and passed unchanged after the three
file cache fix. The [before/after proof](unit-stack-order-proof-v1.md) records
exact runtimes and all supported/excluded claims. The witness itself changes no
priority policy, Workshop production or original observations.

Source preparation passes Node syntax checks for the two modules and 13 synthetic
evaluator boundary checks, including a complete stale-ID mismatch, a fresh-ID
match, wrong transaction type/name, missing frontend refresh, unrelated native
mutation, inconsistent Widget binding and missing/duplicated action boundaries.
The source-only script/result are retained at
`/tmp/unit-stack-order-proof-check.mjs` and
`/tmp/unit-stack-order-source-check.json`. They execute no engine/browser and
add no passing game or original cases.

`tools/wasm-tests/unit-stack-order-browser-fixture.mjs` exports `stackOrderWorld`
and `stackOrderMain`. The world reuses the separately declared Workshop world
input, replacing its one local Former spawn with two ordinary Scouts at the
base-free (8,8) tile. All seven owners, seven cities and nine units remain live.
A has morale 2, B morale 1; both have full health/movement and no orders. The
current public source priority is A=272/B=270, then A=72/B=270 after A Holds.
These are application-policy inputs, not an original-game selection contract.

The self-running GSE fixture uses actual native public requests and read-only
payloads, with no replacement callbacks, Native wrapper arrays or fake frontend:

1. Reacquire scalar native A/B IDs. Wait for the existing native rendered-city
   focus capability, then `game.select_tile` queues the real FR_TILE_SELECT.
2. Require the resulting actual tile-select event, a subsequent actual map
   unit-preview(A), and the mounted Native Widget's `preview.data.unit.id == A`
   plus its real text binding. This warms the actual tile order caches.
3. Submit the legitimate authoritative `unit_hold` request with scalar A ID.
   Preserve its actual String transaction token, Int caller/entity IDs and Bool
   result. A backend ACK or the independent 100ms GSE label timer is insufficient.
4. Require a NEW actual map unit-preview after the Hold fence. Its source path is
   FR_UNIT_UPDATE → Unit::Refresh → UnitManager::RefreshUnit → RenderTile →
   UpdatePreviews. This is the frontend refresh barrier; capture the native world.
5. Queue another actual native tile-select and require the corresponding new
   tile-select followed by map unit-preview and matching mounted Widget/text IDs.
   Capture the complete result before normal native exit. No expected ID is
   substituted into the observation.

`unit-stack-order-proof.mjs` exports a strict evaluator and log parser. It checks
the exact event fences, identity types, actual Widget/event agreement, complete
all-seven/128tile coverage and all native fields. Only A's legitimate order may
change. It then compares the actual final Widget binding to current priority B.
The stale A observation, if reached, is retained as a complete strict mismatch.
Unsupported/setup failures never count as a visible cache defect or a pass.

Each complete world is serialized immediately into its own `UO_CHECKPOINT` log
record at warm/after-Hold/final boundaries. The fixture retains only plain scalar
UI/event metadata between actions. It does not retain native FloatPtr-backed
world values and reserialize them later, which could hide unrelated mutations.
The parser requires exactly those three independent immutable boundaries and
matches their metadata to the final result before evaluating any agreement.

The new `unit-stack-order-browser.test.mjs` mounts these sources on an isolated
branch based on the actually passing Workshop host `54ac6335`. Canonical CDP
print barrier, native log hook and cursor are imported unchanged. It creates no
pointer/keyboard coordinate model and changes no Workshop/shared helper source.
The only application inputs are declared native public selection/Hold requests.
It waits for actual application exit zero, closes browser/server, stops the CDP
barrier and seals exact raw chunks before parsing/evaluating the complete log.
A complete stale-ID result is written as a distinct priority mismatch and fails
the Node test; unavailable setup, uncontrolled native mutation or missing event
barriers never count as a proven visible cache defect. The exact launcher later executed the baseline red and fixed green scenario,
as recorded in the separate proof manifest.

Source audit confirms `select_tile` queues FR_TILE_SELECT with TILE purpose;
its tile-select event precedes `UpdatePreviews`. The real map callback always
emits the chosen backend unit wrapper. FR_UNIT_UPDATE sets frontend order then
calls `Unit::Refresh`, which updates activity and renders/refreshed previews.
The new preview after the controlled Hold is the bounded frontend barrier. A
native frontend-request cause ID is not independently exposed, so its relation
to FR_UNIT_UPDATE is source-backed rather than a separately observed cause tag.
`UnitPreview::Register` resolves the actual Widget payload to the native unit ID
used by its frontend renderer. These details justify the HUD binding witness,
while the rendered map instance identity remains unavailable.

Before a future run, pin exact runtime/Default/observer/helper hashes and acquire
an explicitly exclusive lease. The standalone test has an overall180second
budget and runs no engine when installed assets are absent. Its source-only
import/skip check is not an application passing case. The completed raw log can
also be evaluated independently with:

```sh
node tools/wasm-tests/unit-stack-order-proof.mjs \
  /tmp/unit-stack-order-attempt-1/application.log \
  /tmp/unit-stack-order-attempt-1/priority-result.json
```

This proof can establish the actual selected HUD's unit identity using the native
Widget payload; `widget/UnitPreview.cpp` binds that payload to the frontend unit
ID. It cannot establish the rendered map instance identity, original pixels,
facing, movement cadence, tool/limb animation or audio. Those remain explicit
graphics gaps. A later C++ cache-invalidation change requires actual failing
evidence first and must preserve the same witness and source priority policy.

## Movement and animation observation plan

| Observable | Current bounded evidence | Capability still needed |
| --- | --- | --- |
| HUD unit identity | Native map callback, mounted Widget payload and label ID | Hold case executed red→green; separate health case remains unexecuted |
| Rendered map body | Existing static component/fallback source and ordinary interpolation | Actual unit/instance/resource/visibility and render-coordinate observation |
| Movement trajectory | Native before/after world state can be guarded for every owner | Intermediate render positions, action clock, start/end and camera binding; in-flight sentinel coordinates remain unavailable |
| Facing and frame | No independent map pose/frame observation | Actual facing/frame fields when implemented, otherwise explicit absent capability |
| Former tools/limbs | Clean resource metadata only | Clean repeated action/assembly/clip/visibility/transform binding; filenames do not establish action mappings |
| Sound/music/video | Existing presentation/media packets where supported | Bounded action association and original timing/transition contracts |

Future read-only telemetry should identify actual native unit and sprite/model
instance, source resource, visibility, render coordinates, camera and action
sequence. Frame/clip/facing/pose data must be absent when unsupported rather than
invented as zero. Native all-owner world guards stay independent of rendering;
a HUD payload does not identify the map instance or prove original pixels.
No C++ seam, new build, model replacement or action-clip mapping is added here.
Original-only research is separate and may supply clean observable contracts
through Root; no candidate implementation details are sent into that track.

## Next bounded health-priority case — plan only

Keep the proven Hold witness immutable. A separate case can warm the same two
healthy, active Scouts, then lower only A's health from 1.0 to 0.5 through an
explicitly declared, authoritative fixture control. First audit the actual
health setter/refresh path and its write boundary; do not mutate frontend fields,
replace product callbacks or pretend the control is an original combat action.
With both units still active/no-orders, current source priority becomes A=268/B=270
instead of A=272/B=270. Require an actual fresh frontend preview, reselect the
same tile, compare the actual HUD/Widget identity and capture complete immediate
all-owner worlds. Only the declared A health field and any explicitly audited
native health mirror may differ. No live health case or extra C++ change has
been made; source review, old-runtime failing evidence and a new lease are
required before accepting that coverage.
