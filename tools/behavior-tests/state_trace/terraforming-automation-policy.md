# Worker automation: source semantics and application choices

The installed manual, pages 48 and 51–52 (SHA-256
`21d2e5f602ecce969456b0281c017686772002d219d1648ba1b66ffcda640ec8`),
and the installed TERRAFORM menu provide the identities and qualitative behavior
of ten commands. They are not recorded executions or measured traversal timings.
Original automation priorities, optimal routes, preference parameters, and its
base-list widget remain unverified. Functional application tests are separate
from original-game matching totals.

| Source command | Functional behavior |
| --- | --- |
| Farm + Solar + Road | Remove existing fungus first, then perform possible farm, solar, and road components in source order. |
| Farm + Mine + Road | Remove existing fungus first, then perform possible farm, mine, and road components in source order. |
| Construct Road To | Build needed road along a noncombat route to a selected live owned base. |
| Construct Tube To | Build needed road and mag tube along a route to a selected live owned base. |
| Automatic Roads | Seek reachable eligible squares lacking road. |
| Automatic Tubes | Seek reachable eligible squares lacking road or mag tube. |
| Automatic Sensors | Seek reachable eligible squares lacking a sensor. |
| Automatic Fungus Removal | Seek reachable fungus and remove it. |
| Autoimprove Home Base | First return to the persisted home, then improve its actual native workable territory. |
| Fully Automate Former | Select useful non-destructive improvements in the reachable native world. |

Automatic target priority is an application policy: cheapest quoted reachable
location, then fewest edges, then y/x order. Full automation removes fungus,
uses farm/solar/road on suitable land, mine/road on rocky land, and farm/solar at
sea. Existing incompatible improvements are preserved. Missing technologies are
waived by the user's separately serialized default rule; structural Disable,
terrain requirements, replacement consent, ownership and movement authority stay
in force. No alternative original selection or random policy is inferred.

The native `unit-automation-v2` payload contains only command, epoch, owner,
turns, target/origin coordinates, cursor, and phase. Phase0 means home rendezvous;
phase1 means normal work selection. The getter is version2 with twelve fields.
The earlier candidate v1 payload can be read with an explicit pending-home phase
and normal phase for other commands; it cannot prove an observed rendezvous.
Units without a payload retain ordinary legacy order semantics. No wrapper,
callback, cached path or detached terrain effect is serialized in the plan.

A producing base assigns a capable worker's durable home before its observable
spawn notification. An unset or invalid home receives one explicit nearest-owned
fallback assignment when Autoimprove Home Base is ordered. That identity is
stored independently of the plan and survives cancellation. Home assignment has
a native fenced undo receipt so cancellation/rejection rollback can restore the
previous value, including a historical base that has since disappeared.

Installed Manual p48 supplies the connected-road rate across land terrain. The
shared quote and actual debit now retain that rate on wet, rolling and rocky
endpoints. Existing ground-domain, road/base connectivity and fungus restrictions
remain in force; naval movement receives no road bonus. Native regression covers
mixed and uniform endpoints in both directions, three actual movement callbacks
per point, exhausted/no-road controls and exact graph/RNG restoration on undo.
These are source-supported application checks; original traversal agreement on
those terrain combinations remains unmeasured.

The planner recomputes paths against actual native neighbors, domain,
noncombat occupancy, locks and the shared live movement quote. Weighted graph
search breaks equal-cost ties by edge count, preventing cycles on an unchanged
zero-cost network. Each move resolves and applies through `move_unit`; later
steps resume only after the native movement completion and unlock. A positive
movement budget is required even for connected mag tubes, whose zero debit is
supported qualitatively by manual page48. Implicit mag-tube connections through
cities and original terrain exceptions are not inferred. Work contributions use
the same authoritative primitive transaction and per-turn credit guard as a
manual order. Native epoch/cursor/turn checks fence cancelled or replaced plans.

Verification status is recorded outside the product repository in the delivery
ledger. New source, a visible menu, a stored plan, and reference integrity alone
are not evidence that all commands execute. The exhaustive task requires actual
completion/cancellation, terrain and traversal checks, all-player checkpoints,
and final PR gates before completion can be reported.
