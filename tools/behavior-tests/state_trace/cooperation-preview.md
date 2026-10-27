# Cooperative work preview

The mounted native suite is verified on frozen host `fb64d609` and PR2 runtime
v6 (native source tree `115032ffc7f53ff7f0c3a9f997da12674e25e643`). This
adds no original-game agreement or browser-pixel claims.

The selected unit's native contribution remains unchanged. A current multiworker
cohort renders its actual pure `terraforming.cohort_state` total and requirement,
with the selected worker's own contribution on the same existing progress line.
Solo, paid-height and legacy native work keep their existing native progress.
Stale/ineligible work has no fabricated cohort total.

`terraforming_progress.signature` reads ordered native same-tile unit IDs,
owners, health, domains, orders and detached work state, plus the actual base ID,
turn and a versioned process-local revision. It performs no terrain search.
Only selection/show or a changed signature computes the pure cohort helper with
a fresh per-call cache. No helper terrain cache survives that call. Existing
control availability polling is separate and may still perform work eligibility
queries; this patch does not claim the entire old HUD poll is search-free.

`terraforming_view_revision_v1` is an actual Game custom-global Int, initialized
lazily on first change and excluded from Game/world serialization. Work tick,
cancel, authoritative undo, inline invalidation and improvement-owner apply/undo
advance it without calling view listeners. It never appears in peer events,
jobs, quotes, payments or native gameplay snapshots. A changed revision can only
cause a new read; it cannot authorize work or make stale work eligible.

`terraforming_cooperation_preview.gls.js` mounts the production object panel with
the declared native seven-owner source fixture and a display/timer boundary.
It checks native partial/peer/paused contributions, true completion and undo,
selection isolation, fresh terrain reads, ownership invalidation and unchanged
poll read counts. Every explicit poll compares the full native audit snapshot
and entity/queue inventory. A direct view-revision update also must leave the
full native snapshot unchanged. Cleanup removes the panel and its owned timers.
The fixture requires the real `uncomplete_turn` setup correction because natural
startup intentionally marks offline computer turns complete.

Actual native/mock-mounted result: **1 scenario / 62 assertions**, raw exit **0**,
17.318s. The original production panel observes native partial total 4, peer total
6, own contribution 2, retained paused credit, peer completion and true undo,
selection changes, stale terrain, and improvement-owner apply/undo invalidation.
Setting the view-only native custom-global revision leaves the complete native
snapshot unchanged. Unchanged progress polling performs no extra terrain reads;
the test previews a foreign unit and does not measure local availability costs.
Cleanup and normal Finish complete with all native tests passing.

Relevant compatibility passed **3 suites / 62 scenarios / 297 assertions** on
that same host/runtime: Former controls (17/70), all 22 non-height controls
(22/154), and worker-order cancellation including paid-height undo (23/73).
The first temporary-catalog invocation was rejected before any engine launch
because the new ID was not yet classified: zero native passes. The mounted test
then ran through the existing strict native-capture alias; the actual executed
probe SHA256 is
`6e7d289f01f185f8c195183d5545da5ea584656dea9b64572d2338f37b7cf043`.
The successful result supports subsequent catalog promotion; it is separate
from real browser input and visual verification, which remain pending.
