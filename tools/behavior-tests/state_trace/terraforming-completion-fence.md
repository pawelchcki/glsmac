# Automation completion fence

The V4 native regression `/tmp/terraform-plans-v4-completion-red-v2.json`
executes an actual automated route move: turn 2, one remaining movement point,
`AUTOMATE` order, native tile lock and outstanding display acknowledgement.
`has_ready_unit(owner)` is false and the old `complete_turn.validate` incorrectly
accepts completion. The immutable runtime is source `1da3296b`, JS SHA256
`3c65fa5ba297b9dd3e5712dca625cba26606f0014305628302c72ffa78746a15`, WASM SHA256
`2e84cad638fed7c02649b53df7dec2fa66a9131999859b4b2222f801dcac63d7`.
This is a candidate lifecycle defect; it makes no original animation timing claim.

## Authority and lifetime

`game.has_pending_actions(owner_id)` leaves manual `NeedsOrders` and
`has_ready_unit` semantics unchanged. It checks real native movement through
its full ACK callback, including unlock, debit and synchronous continuation.
The transient movement token belongs to the current native manager/entity;
clear, detach and retired callbacks cannot retain or remove a later move.
It is neither serialized nor a paid-work or automation-plan field.

For automation it examines real pending events and the remaining, unprocessed
part of each active `ProcessEvents` batch. Only host
`unit_terraform_plan_step` events matching the live unit, owner, plan epoch,
cursor and current turn are candidates. The existing manager dispatcher invokes
`automation_step_pending` with `{caller, data}`. The configured pure handler
attaches the live game and returns the shared planner's live move/work validity,
without resolve, RNG, events, mutation or a separately managed busy flag.
No handler means no automation scheduler is exposed by that legacy fixture.

Native `CompleteTurn`, `AdvanceTurn` and derived automatic completion status
use the same predicate. The GSE complete/advance/automatic-end boundaries also
use the readonly API. A future-turn plan, exhausted worker, cancelled/stale
identity, lost route, or absence of eligible work permits completion.
The ten current plans never request paid elevation; an insufficient-credit
paid automation wait is therefore unreachable and has no fabricated passing
case. The live validity hook will exclude a rejected work operation.

## Verification boundary

`terraform_automation_lifecycle.gls.js` contains seven queued native scenarios:
locked route movement and direct completion rejection; unlocked ACK callback
lifetime and duplicate ACK rejection; real queue and swapped-batch visibility;
next-turn waiting; cancellation and stale continuation; no eligible work at
zero treasury; fractional-road continuation; and loss of all legal route edges.
The swapped-batch scenario also checks next-turn waiting. These controlled
fixtures retain their complete actual native graph, with two participating
players, and do not claim an all-seven-player original trace comparison.

The combined native refresh `1d8f985a` (tree
`d9b3494f2f91ccf234bc582a5dfb0858ff1dade3`) includes the catchable script-facing
advance rejection while retaining the internal native guard. The original
integrated failure and phase discriminator remain in
`/tmp/terraform-pr2-integrated-fence-first.json` and
`/tmp/terraform-pr2-integrated-fence-phase-v2.json`.

The actual refreshed-runtime run passes all seven scenarios / 46 assertions:
`/tmp/terraform-pr2-integrated-fence-v2-native-first.json`, integrated host
`15879dc5`, scripts SHA256
`8a251017f551d38c9ea9589b5bc250434d13cdffdee6d127d0ffb0b88dc6f0af`.
Its immutable v2 JS SHA256 is
`ceba448b2dfe37bac0501da8eb4435941b7fde478d51b11408ebc22f7a7b492c`,
WASM SHA256 `00c94f5e42985c3f408b71e14ed583b2cbe88e730ff03581546d1992b8a82fa6`.
The companion pure `pending_step` and GSE completion guards are present in that
host. This bounded two-player lifecycle proof is separate from the full
seven-player terrain trace, installed visual flows and final integrated CI.
