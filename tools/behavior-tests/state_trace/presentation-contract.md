# Presentation observer and semantic trace prototype

This batch provides candidate observation and synthetic strictness invariants.
It establishes no original-game presentation agreement. The full request to
trace every window, widget, animation, video, effect and music track remains
open. Existing frozen state-trace references and their schema are unchanged.

Two representations are deliberately separate:

- `glsmac.presentation.raw.v1` contains native object mutation events and native
  birth IDs. It belongs in diagnostic artifacts. Native DOM creation order,
  embedded control trees and per-word layout mutations are architecture details.
- `presentation.trace.v1` is a proposed semantic domain with declared logical
  object/playback IDs, ordered semantic events and a live inventory. It can be
  attached as `state.presentation` once a real world exists. Pre-world menu and
  intro envelopes need a separately declared profile; never invent map/players.

`presentation.py` provides detached raw and semantic recorders. The generic
state-trace comparator already compares an extensible object domain exactly,
including event ordering, transient events, extra playback and field types.
Checkpoint coverage belongs in the existing checkpoint `coverage` object;
false channels remain unsupported. A semantic adapter must classify the complete
observed semantic inventory. Unknown classes/events are retained as `unknown`
and invalidate coverage; a selector whitelist cannot hide unexpected popups,
widgets or sounds. No complete candidate semantic profile is claimed here.

The proposed semantic event is `{seq, after_input, domain, kind, object_id,
fields}`. `fields` carries parent identity and verified type-specific fields.
`seq` is a contiguous execution-wide ordinal, `after_input` identifies the
last declared input, and snapshots retain ordered events since the previous
checkpoint alongside complete live `objects`/`media`, `focus` and `modal_stack`.
Logical IDs survive updates and are retired permanently. Media evidence levels
must distinguish a request/API acceptance from playhead movement, rendered frame,
rendered PCM and device output. Exact timing parity remains unsupported.
Inventory domains currently accept only `create`, `update` and `destroy`;
undefined event kinds must be retained as explicit unknown observations.
Event input ordinals must remain within each checkpoint interval and cannot
move backwards. Focus must be cleared and modal membership popped before an
object retires, preserving those transitions in the ordered event history.

## Native producer

`ui/PresentationTrace.h` is disabled by default. `glsmac.ui.presentation_trace_start()`
arms a fresh epoch and bootstraps the current UI tree; the optional opening bridge
calls it before production main includes. `presentation_trace_drain()` returns a
detached JSON string. The native queue holds at most 65,536 events / 16 MiB, with
16 KiB individual payload bound. Overflow/oversized records increment a sticky
loss counter, including after drain; all consumers reject any loss. A disabled
producer cannot pass as an empty observation. No default tracing work constructs
payload strings.

Final browser capture requests a seal through a diagnostic WASM export without
injecting gameplay input. The existing application-thread drain timer performs
one atomic final drain and disables recording under the queue lock, then emits
a separate acknowledgement. Capture waits for that acknowledgement. Late writes,
duplicate controls and batches received after the acknowledgement cannot produce
a successful capture. Marker strings inside rendered text remain payload data.
Intermediate diagnostic snapshots leave observation active and explicitly lack
this terminal boundary.

Central hooks observe native Object create/attach/detach/show/hide/destroy, primitive property
changes/removal, style modifiers, transformed native text, UI focus and actual
global modal singleton. The tree includes parent IDs and all actual native UI
objects, including hidden/offscreen objects. `visible` is the native local flag;
clipping, ancestor visibility and rendered pixel evidence are distinct. Nonprimitive
properties emit explicit opaque type records. Direct native geometry mutations,
renderer state and application-independent modal ordering are not fully observed.

Starting or restarting an epoch snapshots each native birth ID once, preserving
all actual attachment edges for shared/globalized nodes. Current focus and the
global modal singleton are recorded after those births, so a late capture has
an explicit baseline rather than guessed empty state. Snapshots also retain the
current transformed/rendered Text string (including native Input caret text) and
active native style modifiers. The reducer retains every actual attachment edge,
so deglobalizing a shared child removes only that edge. Primitive/opaque type
changes replace the previous representation. Float diagnostics use locale-neutral
round-trip precision for the actual native float. Property/unset records
follow actual storage writes/erases before their callbacks; callbacks do not
emit a second copy. Independent native writes remain separate records, including
same-value writes; production assignments and callbacks are unchanged.

Every Scene Sound actor has a separate playback identity; source is the actual
loader name. Within each observer epoch, its first observed control or destruction
atomically registers a `media.create` before that event. Actors constructed while
armed register immediately. Surviving actors, including actors born before the
first Start, register lazily on their next observation. This registration time is
not physical construction/start time: a complete already-playing actor inventory
and output baseline remain unobserved. Play, pause, stop, mute, repeat,
delay, autoplay and volume requests are captured with request evidence. Actor
retirement is distinct from playback completion. This observes overlapping SFX
and music requests through that shared actor path without guessing which is
music. Actual audio mixing/progress/completion and device output remain gaps.
Internal Rewind/Play from the audio callback is suppressed by a lightweight
thread-local guard; no observer allocations, JSON, mutex or logging execute
from the real-time callback. No audio callback output is intercepted.

The sequence clock has units `event`. There is no timing/cadence agreement claim.
The browser observer drains every 50 ms and retains a 150 ms final capture
interval; this is a transport schedule, not permission to lose transient events.
Pod sprite background assignments retain the requested logical FLIC source and
frame index in the native stream. They do not prove a frame reached the screen.

## Frozen bounded inputs

`presentation-cases.json` was reviewed independently by the clean reference
agent and frozen at file SHA-256
`4ca90feaa1e5c799fa896158e1ff5c4ba7e9b6111ff126ccb32dfb52da1ef7ec`.
The canonical protocol request hashes to
`5f9badcda94704460b54fa01e86cf3a7b7d2f5dcb59e67a0081b49c7648aed75`.
Both cases retain all ten requested channels, stock-default audio preferences
and 1024×768 game output. The intro-disabled keyboard route ends at the first
playable turn; the intro-enabled route bounds its first actual video frame,
decoder failure or main-menu-without-video observation at 15 seconds, then skips
only if actually playing. Structural/request quiet is scoped to 150 ms and must
not wait for ongoing music to end. No accepted original neutral observations
exist. Existing original sampled opening/pod contracts are separate evidence.

The immutable `presentation-capability-manifest.json` binds a separate original-only
diagnostic producer and clean capability report. That prefix observed native
widget lifetime and focus/modal writes through the leader editor. It contains
zero accepted presentation observations and declares every semantic channel
incomplete; these counts cannot substitute for repeated semantic reference gold.

`presentation_candidate.py` executes real candidate captures and returns
`unsupported` while semantic projection or requested channels remain incomplete.
The current candidate actually displays a logo for one second and enters the
main menu; that is not a movie frame or synthetic decoder failure. The observer
is armed before production main includes, after the native root already exists.
Its baseline is an existing-tree bootstrap and pre-launch history is explicitly
unobserved. The final 150 ms structural/UI/request quiet interval is checked against the
ordered transport, with a two-second bound; ongoing frame/progress events do
not prevent termination. Failure to observe quiet is an explicit error. The
sealed suffix is also included when validating quiet: any intervening structural
event sets `final_quiet_observed` false instead of preserving a stale quiet claim.

## Run

Asset-free observer/reducer and existing framework checks:

```sh
python3 -m unittest discover -s tools/behavior-tests -p 'test_presentation_trace.py' -v
node tools/behavior-tests/state_trace/presentation_bridge.test.mjs
python3 -m unittest discover -s tools/behavior-tests -p 'test_state_trace*.py' -v
```

The first command compiles the actual standalone native observer with host g++
and exercises disabled operation, real queue overflow, sticky loss, JSON escaping
and the real-time guard. This is independent of unavailable native SDL packages.

After building a WASM app containing the new hooks, enable the observer on the
existing installed-asset opening fixture:

```sh
PRESENTATION_TRACE=1 SMAC_ASSETS_DIR=/path/to/game WASM_APP_DIR=/path/to/new/bin \
  OPENING_SEQUENCE_ARTIFACTS=/tmp/presentation-opening \
  python3 tools/behavior-tests/ui/opening_sequence_candidate.py < /tmp/opening-request.json
python3 tools/behavior-tests/state_trace/presentation_capture.py \
  --capture /tmp/presentation-opening/opening-sequence-keyboard/presentation-raw.json \
  --output /tmp/presentation-opening/reduced.json
```

Use the version-1 protocol request with the existing opening-sequence cases.
Raw capture is optional and does not change the existing opening result shape.
Metadata binds production/observed script snapshots and actual JS/WASM runtime
hashes. Original assets stay local. Complete raw capture and complete semantic
projection are separately reported; neither implies audio/video output fidelity.

Run both exact pinned candidate inputs (successful raw captures still report
unsupported semantic coverage):

```sh
SMAC_ASSETS_DIR=/path/to/game WASM_APP_DIR=/path/to/new/bin \
  PRESENTATION_ARTIFACTS=/tmp/presentation-pinned \
  python3 tools/behavior-tests/state_trace/presentation_candidate.py \
  < tools/behavior-tests/state_trace/presentation-cases.json
```

The standalone recorder/comparator is `presentation_run.py record|compare`.
Recording requires independent repeated original observations and complete
requested coverage; no reference output has been accepted for these cases.
Asset-free observer/transport tests run in the hot PR workflow. Full existing
Python test discovery also includes their invariants on main.

## Ordered input ledger and diagnostic checkpoints

The optional browser capture now also arms `glsmac.presentation.inputs.v1` via
`presentation_trace_inputs_start()` immediately after UI bootstrap and before
production includes. A `trace.protocol` record binds that version; launch is
actual action 1. Numeric action ordinals refer to the complete input plan saved
in the capture, never to expected output objects.

The bounded diagnostic export `glsmac_presentation_command(op, action,
checkpoint, nonce)` queues primitive commands only. Opcodes 1/2/3 are begin,
end, and checkpoint; commands are applied and acknowledged in the same native
observer sequence at the end of SDL input iteration, after its pending coalesced
mouse dispatch. Browser waits for begin acknowledgement before planned sends.
Nonces/order are strict, the queue holds at most 64 pending commands, and an
unapplied/in-flight command at terminal seal invalidates capture. No diagnostic
control injects gameplay input or traverses UI/GSE on the browser thread.

`input.ingress` retains every polled SDL event before production translation and
motion coalescing. `input.disposition` identifies coalesced/not-dispatched events;
`input.dispatch` retains actual translated payload, begin/end, ingress identity
and handled result. Rejected SDL events remain `input.filtered`; the verified
SDL poll-cycle sentinel is explicitly classified as internal bookkeeping.
Unknown filtered events invalidate attribution. Native hover transitions are
retained separately as `input.ui-transition`, with actual node/container IDs and
source ingress or zero for transitions outside external dispatch. This does not
introduce semantic control roles or native-to-original DOM correspondence.

A capture-phase browser ledger preserves actual trusted/untrusted inputs,
companions and extra/unplanned events. The reducer checks the independently
observed key/button/motion payloads, native provenance and action boundaries.
Unsupported wheel scaling, unknown keys, missing/unmatched/filtered/proxy inputs,
untrusted input or non-mouse pointer input makes attribution incomplete; records
remain diagnostic. End/checkpoint controls can still establish an ordered raw
boundary for incomplete intervals, but cannot promote them to verified action
attribution. Browser/native ledgers each hold at most 100,000 entries; oversized
browser text or transport overflow is an error. Gap summaries are bounded while
all source events remain retained.

`input_validation` validates the complete action/checkpoint protocol independently
of `input_attribution.complete`. Normal pinned captures save five opening or two
intro immutable raw prefix files at acknowledged native sequence watermarks.
Each prefix recomputes attribution using its own browser watermark and contains
no later native events. The current intro route reaches the menu without video;
its conditional skip creates no fabricated Escape input. Final capture retains
the existing native atomic seal and structural quiet checks. Internal poll-cycle
records do not count as presentation activity for structural quiet.

This is candidate diagnostic evidence. A matching browser/native ledger does
not establish physical OS input completeness, prelaunch history, controlled
timing or cross-engine presentation parity. `physical_os_complete` stays false.
Concurrent trusted-CDP motion stress exposed browser/native coordinate mismatch
upstream of actual dispatch; the integration case deliberately requires that
observed mismatch to remain incomplete. Production coalescing and dispatch order
are preserved. Semantic roles, complete media classification and audio/video
output coverage remain false/unimplemented.

Asset-free checks also include:

```sh
python3 -m unittest discover -s tools/behavior-tests -p 'test_presentation*.py' -v
node tools/behavior-tests/state_trace/presentation_inputs.test.mjs
```

Actual threaded integration, requiring installed assets, the private rebuilt
runtime, and the existing browser dependencies:

```sh
SMAC_ASSETS_DIR=/path/to/game WASM_APP_DIR=/path/to/private/bin \
  node --test --test-concurrency=1 \
    tools/behavior-tests/state_trace/presentation_inputs_browser.test.mjs \
    tools/behavior-tests/state_trace/presentation_native_ui_browser.test.mjs
```
