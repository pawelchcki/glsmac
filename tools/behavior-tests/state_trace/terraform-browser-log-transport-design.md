# Bounded browser logger measurement and proposed harness changes

The original-root Terraform smoke on host `a457444e` timed out at the existing
180000 ms deadline after an accepted owned-base plan. Its final native graph,
pointer-dispatch completion and exit were not observed. It remains failed.
There is no established product click or shutdown defect from that run.

The NO-WASM Chromium replay uses the actual 11551539-byte captured input
(SHA256 `24fa026db81f4d4062af5b8f0bd9f11fc9cfd9f653181d619e4955fcfa95ad99`),
split into 883 LF-delimited messages. That split is an explicit replay model;
the failed game run did not measure its callback counts or logger timings.
Both original logger statements are retained, with clock reads around them:

```js
logElement.textContent += `${message}\n`;
logElement.scrollTop = logElement.scrollHeight;
```

The actual shell HTML/CSS is used with script tags removed, normal running
setup hidden, and log details separately closed/open. No Module, WASM resource,
network request or game input occurred. Node exited 0. Both 45-second scopes
stopped at their declared bounds, so neither claims a full 883-message replay.

| Scope | Completed messages | Exact retained prefix | Append time | Layout/scroll time | Largest callback |
| --- | ---: | ---: | ---: | ---: | ---: |
| Closed | 805/883 | 8561370 bytes | 0.2835 s | 44.7368 s | 2.2956 s |
| Open | 800/883 | 8559273 bytes | 0.2385 s | 36.5101 s | 0.9397 s |

The measured statement sums exclude per-row host reporting and the pre-read
of log length. Replay wall times include those costs and other browser work.
The results demonstrate expensive forced layout under this captured input;
they do not attribute every second of the failed game run to this function.
The adjacent JSON binds actual source, browser and prefix hashes. Full raw
inputs and per-call records remain in `/tmp/terraform-log-dom-benchmark`.

## Approved diagnostic print-hook source; runtime proof pending

Keep production web/default/native bytes unchanged. Pause only the main-frame
`GLSMAC.js` request through the exact CDP Fetch boundary described below. At that
boundary, assert the existing bootstrap-created `Module.print`/`printErr`
configuration functions are present. Install harness callbacks before allowing
the unmodified runtime to execute. The pinned runtime captures those existing
configuration hooks at lines 11078–11079.

The harness callback executes the identical original append statement into
the same `#log`, retaining every message, newline, error and field. It omits
only the synchronous autoscroll statement. Bootstrap's own direct status/error
logger remains unchanged. Record exact hook source/hash, installation/runtime
ordering, callback sequence/counts, and initial/final DOM lengths. No alternate
buffer, truncation, trace cut, extra input or deadline increase is proposed.
Debug-log autoscroll becomes explicitly unsupported under this instrumentation;
native game windows and rendered canvas remain the subject of the proof.

The manager approved this source design. Before another candidate run, replay all 883 messages with exact full UTF-8
hash retention in NO-WASM Chromium for both detail states. Pure tests must
reject missing/repeated/late installation and preserve stdout/stderr order.
The next candidate browser requires manager approval and a fresh reviewed host.

## Approved collector finalization source; candidate proof pending

The failed run's `application.log` has 11551500 bytes. The continuously saved
JSONL chunks contain 11551539 bytes: an already pending read appended 39 bytes
after cleanup metadata was written, before browser close. The smaller file is
an exact prefix, not an equal artifact. Preserve both hashes and the separate
`application-reassembled.log`; do not relabel this partial failure a pass.

Add an explicit closing state to the cursor. Closing immediately rejects new
body/poll reads, but allows already accepted reads to settle and persist their
chunks. Queue one bounded final read internally, capture passive DOM receipts
and failure frame, then close the browser to settle any pending evaluations.
Await the cursor queue after browser closure. Only then freeze text, chunk
counts and read stats and write the final raw log/report once. The cursor must
reject every subsequent read and perform no append after freezing.

If a final evaluation fails or application exit is unproved, keep the failure
and unknown-unreceived-tail metadata. All received chunks must nevertheless
equal the frozen raw artifact exactly. A delayed-response pure regression
should reproduce the old 39-byte race, then prove final chunk equality, stable
metadata, rejected post-close reads and artifact I/O failure propagation.
No native collector, game timing, source fields or memory limit changes belong
to this harness correction.

Source implementation adds an explicit open/closing/sealing/sealed cursor.
An already accepted read remains eligible to append during closing; subsequent
body reads reject. After passive receipts/frame and browser closure, sealing
awaits the serialized queue and freezes the final text and read records.
Only then are joined chunks, raw text, hashes and report written. A close
failure stays an unsealed prefix with unknown tail; a timed-out final read
stays failed even if its response later arrives. Pure tests reproduce a
39-byte delayed response, cancelled final evaluation and immutable post-seal
artifact equality. The prior failed artifacts remain distinct and unchanged.

The separate `terraform-log-hook-replay.mjs` constructs an explicitly declared
configuration model from the actual source function and only the two capture
assignments. It does not load the runtime or instantiate WASM. It exercises
both output lanes in a declared alternating replay, since original channel
boundaries were not recorded. Actual runtime binding and first-callback proof
remain requirements of the next candidate browser.

## Complete NO-WASM hook integrity replay

Source `9cc24c90` completed both closed and open detail states with all
883 LF-modeled messages and 11551539 bytes. Both output hashes equal the full
input SHA256 `24fa026db81f4d4062af5b8f0bd9f11fc9cfd9f653181d619e4955fcfa95ad99`.
All callback sequences, alternating declared stdout/stderr lanes and DOM
before/after offsets agree. No runtime script, callMain, WASM resource or
network request occurred; Node exited 0 and Chromium was reaped.

The hook replay constructs a declared Module configuration model and executes
only the two independently source-asserted handler assignments. Its first
callback records bound out/err but callMain absent. That is deliberately not
actual engine-capture evidence. The candidate route must still acknowledge
the main script barrier before unmodified runtime execution and record its
first actual callback with both out/err bound to the configured hooks.

Replay wall times were 1.3354 seconds closed and 0.754 seconds open. They are
integrity diagnostics, not paired speedup or gameplay timing claims: unlike
the original logger cost measurement, this replay has no per-row host await.
The adjacent full-hook replay JSON binds exact source/input/output hashes;
raw logs and callback records remain `/tmp/terraform-log-hook-full883`.
Nineteen pure checks also pass, including runtime worker/main classification,
late/missing/repeated installation rejection and delayed39-byte sealing.
The actual game-browser smoke remains failed until separately rerun.

## Actual request ambiguity and replacement CDP barrier

The `0b419a29` candidate failed before engine startup: intercepted
`Request.allHeaders()` had no `Sec-Fetch-Dest`. It passed no input or native
state case. The empty raw log and chunks sealed identically; this is not a
native failure. A separate short NO-WASM local page then dynamically loaded a
classic script which created a dedicated worker at the same script URL.

Actual Chromium149/Playwright1.61.1 observations show both requests as
`resourceType:script`, `frame:main`, no service worker, and no fetch-destination
header at the Playwright interception boundary. Wire requests acquire their
distinct script/worker destination headers only after continuing. Therefore
URL, public resource type, owning frame and missing headers cannot safely
classify these requests. Those failed assumptions remain archived evidence.

The replacement source uses CDP `Fetch.requestPaused.networkId`, which the
installed protocol explicitly defines as the exact link to the corresponding
`Network.requestWillBeSent.requestId`. A main request must match the current
document frame/loader and the actual bootstrap `loadApplication` initiator.
A worker request must link to an independently observed live dedicated-worker
Target ID with the correct parent frame. In the pinned actual diagnostic,
that worker Target ID equals its Network request ID. Missing or unfamiliar
linkage remains unsupported and fails closed; no header or same-URL FIFO
fallback exists.

Network/Target evidence can arrive in either order, so a paused request waits
up to two seconds for positive matching evidence. Unknown IDs, wrong frames,
destroyed targets, navigation, shared-worker targets, duplicate consumed
requests and a second main installation reject. Main installation happens
before continuing the unmodified response; workers continue without another
installation. Continuation records become successful only after CDP
`Fetch.continueRequest` acknowledges them; a paused request is not sufficient.
A passing candidate requires at least one actual acknowledged pthread request
and rechecks browser/barrier errors after cleanup. Protocol observers and pending evidence timers stop after
producer closure, before final artifact metadata freezes. The actual
first-callback out/err identity checks remain unchanged.

The source-only pure fixture selects actual Network/Target fields from
`/tmp/terraform-runtime-request-diagnostic/report.json`. Its Fetch IDs are
explicitly declared protocol-model fields until the new live Fetch diagnostic
executes. Twenty-five pure tests pass, including delayed acknowledgement,
stop-during-installation and bounded rejection of unknown requests; no actual CDP Fetch or candidate proof
is claimed yet. `runtime-fetch-barrier-diagnostic.mjs` stages the next NO-WASM
proof using only a tiny configuration/worker model, never the runtime bytes.

The first actual Fetch proof established and acknowledged main installation,
then correctly remained failed: worker Fetch reports `Other` while its linked
Network event reports `Script`. The saved actual records in
`fixtures/runtime-fetch-observations.json` bind that failed report's SHA256.
The correction checks Fetch `Script` only on the positively identified main
role and Fetch `Other` only after exact live worker Target/parent linkage.
Unknown `Other` alone still waits and rejects. Twenty-six pure tests now cover
these actual records, mismatched role types and stale/wrong-loader negatives.
The failed NO-WASM report remains `/tmp/terraform-runtime-fetch-proof`; a
separate reproof is required before any candidate run.

The separate reproof on source `5f7a1602` completed with Node exit 0. Actual
Fetch/Network/Target observations link one main `Script` pause to its current
document loader and bootstrap initiator, then one worker `Other` pause to the
exact live dedicated-worker Target/parent frame. Main configuration installed
once; both continuations acknowledged success. The model emitted both output
lanes with bound out/err, callMain absent and no WASM resources. Browser and
local server were reaped. The protocol observation span was 731.276 ms; total
process wall time was not separately instrumented.

`terraform-runtime-fetch-reproof-v1.json` binds actual roles, ACKs, source
hashes and the full artifact report SHA256. Full events remain in
`/tmp/terraform-runtime-fetch-reproof`. The print-hook function hash still
equals the independently verified complete883-message replay, so that text
integrity result is unchanged. Neither this proof nor its modeled callbacks
substitutes for the next actual candidate's first runtime callback, pthread
continuation, final all-owner graph and normal exit checks.

## Actual candidate controls smoke

The real game retry on frozen host `0322db43` passed one case in 78002.398 ms
under the unchanged 180000 ms budget, and Node exited 0. Default tree
`25ef18d3222f553507291d412330262169b2e418`, native tree
`115032ffc7f53ff7f0c3a9f997da12674e25e643` and pinned v6 runtime are unchanged.
The diagnostic root overlay was off. The configured print callback still
omits only external debug-log autoscroll; its complete text remains observed.

Actual main configuration installed and acknowledged once; eight actual
pthread continuations acknowledged success. The first runtime callback was
`<Thread::(NETWORK)#27> Starting thread`, with callMain present and both actual
out/err identities bound. This is actual engine evidence, separate from the
previous modeled callbacks. Late browser/barrier errors and read failures
were absent.

The case observed all 29 distinct source menu rows, actual semantic header
and Road To hover/press/release completion, non-owned target rejection,
Escape/Tab conservation, both Ctrl+R dispatches and an accepted owned-base
pointer request. Four complete snapshots each retain seven owners, eight
units, seven cities and 128 tiles, including the final native graph. The
actual Q key reached the browser; the test awaited `body.dataset.state` equal
to `exited`, set only by the unchanged bootstrap onExit callback for code 0.
The raw log also retains native thread/SDL/OpenGL teardown. No standalone exit
code packet was recorded, so the code-0 claim is bound to that passed live
callback condition and its exact source, rather than a fabricated packet.

After browser closure and pending-read settlement, the sealed raw artifact
and every joined JSONL chunk agree exactly: 13671106 bytes, SHA256
`c7c4e169309ff79982308caffa91f0e58dac0a630cd88b0ae3b9db0211c216a5`.
The capture is nonpartial, with no late39-byte drift. Full artifacts remain
`/tmp/terraform-browser-v6-cdp-fetch`; the adjacent compact proof JSON binds
source/runtime/fixture/seed, snapshot counts, actual binding, exit evidence and
remaining unsupported fields. Browser/server processes were reaped.

This is one bounded controls smoke. It does not pass all36 browser actions,
height quote/payment/effects, sea controls/production, original visual parity,
typed frontend mesh/facing/frame telemetry, animation/audio timing or live
browser RNG-state observation. Those remain separate gates.
