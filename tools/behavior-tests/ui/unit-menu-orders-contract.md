# Action-menu source-slot commands

`ui.unit_menu_orders.v1` declares six input sequences in fresh games using the
same healthy, unspent, stacked Scout/Former/Colony and owned one-Doctor
Headquarters fixture as [menu presentation](ingame-menus-contract.md). The Scout
is initially selected. City stores, identities, ownership, membership, positions,
health and year are strict native guards; no turn advances.

Each sequence clicks MENU, header index four, the displayed Action row belonging
to zero-based source slot 26, 29 or 30, then presses Tab. The interaction targets
are source identities, not a prescription of the commands' effects. The original
observer locates the row through its actual independently read label and child
rectangle. Missing or ambiguous controls are errors; clicks are never retried
depending on their effects.

Both applications receive the same synthetic `menu.txt` and twenty-row TERRAIN
block from `unit_menu_orders_inputs.declarations`. The `synthetic` profile is
identical to the existing menu input declarations. `action-edited` changes only
the Action title to `&Orders` and the three targeted labels to `&Watch Here`,
`&Stay Here` and `&Pause Now`. Source order, counts, shortcuts, unrelated menu
blocks and terrain inputs remain unchanged. These are declared ASCII inputs,
not original asset bodies or expected display/state answers.

The output reuses the complete observation shape of `ui.ingame_menu_trace.v1`:
initial state and one checkpoint after each action, actual menu headers/child
rows/separators/text classes, native city/citizen counts, all three units' orders
and movement spent in thirds, selected role and year delta. The six recorded
traces contain thirty checkpoints. Shape validation never maps source slots or actions
to expected orders, movement, selection or menu closure.

Original recording requires two identical complete independent runs, with a
fresh fixture for each case. Candidate replay must execute actual production
mounted row callbacks and shared production/native Tab handling, observe the
resulting native state and declare display, timer and event boundaries. No
manual order/selection changes, fabricated callback success or expected-state
simulation may complete an observation.

This contract does not establish accelerator bindings, other Action rows, other
unit types or initial orders, transports/enemy waking, turn replenishment,
hover previews, precise artwork/geometry or full-menu/game parity. All six
accepted cases now match strict production/native replay and actual browser
pointer/SDL delivery; they contribute six cases and thirty checkpoints to the
passing catalog. The historical pilot is excluded from those counts.

The accepted full recording repeats all six cases independently. The observed
source slots apply Sentry (26), Hold (29) and Skip (30): the Scout's native order
codes become 1, 2 and 0 respectively, with movement spent 0, 0 and 3 thirds.
Each row selects the Former, closes the child and clears the root highlight while
leaving the root open. Tab then closes the root and selects the Colony Pod.
Companion state, city and year remain guarded. The edited-label profile records
the same binding identities. These are recorded outputs, not schema rules.

The frozen pre-fix candidate was executed against the full recording: zero
matches, six mismatches, zero unsupported cases and zero probe errors. It left
the child open and Scout unchanged after each row, then selected the Former
on Tab. That strict report is retained separately as pre-fix evidence; no
baseline discrepancy is exempted or counted as passing coverage.

Production callbacks reuse the existing Sentry/Hold/Skip handlers and native
selection delivery. Fifteen separate application scenarios/91 assertions check
source-slot identity, actual current selection, pending/duplicate submissions,
malformed/unrelated/failed receipts, popup guards, switched headers and removed
controls. These application regressions are separate from original observations.

The six actual browser traces require native hover and exactly one clicked
source identity before pointer parking, observe the emitted command and matching
successful receipt, and deliver real SDL Tab. Checkpoints wait within a bounded
deadline for both production selection controllers and native focus to agree,
then require two identical complete observations with all native guards. Initial
rendered Scout selection is checked; later independent hover previews remain
outside this contract. No click or command is retried based on the outcome.

Twelve input-only `ui.unit_menu_context.v1` sequences declare other initial
selections but have no accepted full original recording or passing transfer
claim. They remain an unrecorded hot gap, outside these six Scout cases.

The historical one-case pilot is retained unchanged for provenance and excluded
from totals. Its earlier observer fingerprint is preserved in the pilot unit
test. Rejected full/transport attempts did not deliver the first MENU click and
never supplied gold. A separate diagnostic observed opening on mouse release
and no dismissal from the declared pointer parking. Final reference transport
uses a fixed 0.8-second MENU hover, 0.6-second press, one-second post-release
stay and blank-bottom-bar parking; header/row actions each use one immediate
click with the same post-click stay. There are no outcome-based input retries.
Two new independent pilot captures under that transport agree with the earlier
accepted pilot.
