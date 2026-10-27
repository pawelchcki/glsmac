# Functional height policy, version 1

This is an explicitly named application approximation, not the original height
algorithm. Strict recorded height mismatches must remain visible. Original
coordinates, endpoints and expected observations are never substituted into plans.

`application.band-slope-height.v1` moves to the midpoint of the next 1000m native
band, within native engine bounds -3500..3500m. A neighbor envelope relaxes by
1000m per actual native neighbor step. Shared rendering corners refresh through
the existing canonical-height transaction; untouched gameplay centers remain
stable. Moisture and rockiness are preserved deliberately. Class transitions
clear incompatible improvements and retain no guessed owners. No RNG is consumed.

`application.band-fee.v1` uses `max(1, floor(center/1000)+2)^2` credits. Current
land bands observed at 212/762m, 1362/1762m and 2462m therefore quote 4, 9 and 16.
This agreement at observed bands does not prove the formula. Higher bands and
sea fees are provisional extrapolations. The installed TERRAFORM modifier halves
the fee with application rounding upward, minimum one. Source work duration is
independent of money. Resource-cap technologies remain distinct from the worker
technology waiver.

A pure detached quote seals owner, unit, turn, movement/work, native terrain
(including persistent mutation epochs), policy IDs and treasury. Draft and Cancel
do nothing. Explicit confirmation recomputes the whole quote before charging.
Payment is part of native resumable work, survives save/receive and is not charged
again for the same unit/action/target/terrain identity. Ordinary cancellation does
not refund it. Abandoning or replacing the job discards that paid identity; true
event rollback validates all unit, terrain and treasury receipts before restoring
any subsystem. Changed terrain stops work with a reason and retains the committed
fee. No infinite reserves, hidden technology grants or automatic refund economics
are introduced.

Land Formers cannot submerge their own tile. A Sea Former may raise its own shelf
into land once, then use persisted recovery context to reverse that uplift or
retreat to compatible water. Docking at a coastal city does not grant land-worker
abilities. Unrelated stranding and city land/sea changes reject before payment.
Pressure Dome victim exceptions and original drowning/displacement are unsupported.

The clean reference corpus includes varied lowland and plateau controls. Their
actual contours, exact meter endpoints, climate/rockiness cascades, general fee
formula, randomization and stock timing remain separate fidelity gaps. Source
constraints are in the immutable reference height-source-constraints-v1 handoff.

Additional same-owner workers may join the same sealed height job. Each confirmed
participant independently pays its finite fee; free shared payment is not inferred.
Their progress is shared, with one ordinary work credit per contributing worker
per turn. The first completion applies one terrain batch and clears active peers.
An unneeded worker keeps its unused movement. Pausing height work does not refund
a credit or payment, so same-turn cancellation cannot create another contribution.
A receipt seals every affected participant before cooperative undo. These are
declared application work/economy rules, not original cooperation observations.
Damaged living workers and positive fractional movement use the existing work
credit; they are not rejected by a convenience healthy-only gate.


## Bounded native bring-up

The private PR2 native source is `5fae2f905d618572b564db5e217ac8c090f864d2`
on PR1 `436f593d`, source tree `b6f4ccfe9548e87e70b6413f0292888ad94344fa`.
It preserves PR1 treasury notifications and startup funding. Immutable runtime
`/tmp/wasmsmac-terraform-pr2-runtime-v1` has JS SHA256
`142335e8592d6b5dbb5955c96e3362f492ed5a73ed7e67d96273998858caba93` and
WASM SHA256 `75ad925f91fc8ce1a7b9acb99fb2f446ad68200dc112a7f63e6f4120158e6bbc`.
The headless runner mounts the declared current host scripts; embedded PR1
scripts are not used as a fallback for the new height behavior.

Actual application checks, kept as separate script snapshots:

| Check | Result | Report | Host scripts SHA256 |
| --- | --- | --- | --- |
| Height policy, fees, all four variants, rollback, receiving worlds and cooperation | 21 scenarios / 75 assertions | `/tmp/terraform-height-canonical-peer-v9.json` | `82782a62fc758a0f9b69932a7a6c4c31b9276cbfa89d2b55efc1e94563875586` |
| Improvement support and ownership transfer | 4 / 10 | `/tmp/terraform-support-native-v2.json` | `b67d856f0a0d4331dce59a2c3412db11d672b3f4f452c187b60031017a2adfd7` |
| Native terrain mutation and observations | 40 / 191 | `/tmp/terraform-native-epoch-v2.json` | `a11a96129f646781a45f466565ead44957c88bf7f05bcad78d307a3806aeb803` |
| Existing Former work and native work codec | 30 / 60 and 21 / 33 | `/tmp/terraform-height-compatibility-v1.json` | `82782a62fc758a0f9b69932a7a6c4c31b9276cbfa89d2b55efc1e94563875586` |

The compatibility report also preserves the two initial support/terrain failures;
its two passing suites remain individually identifiable. These separate focused
runs are not an aggregate final-branch gate or original agreement count.

The first actual height failure is retained in
`/tmp/terraform-height-first-native.json`: a native-backed Bool pointer entered
strict JSON. Subsequent reports retain the invalid GSE rethrow, typed native work
input failure, cached authored-wrapper observation and stale cooperative receipt
failures. Production now detaches booleans explicitly, preserves cleanup failure
reasons and validates each cooperative participant using the current native
manager before restoring any participant, treasury or terrain. Fixture inputs
set through a wrapper are observed afterward through a fresh manager wrapper;
expected rates, health, debit and work values were not relaxed.

Two deliberate direct terrain edits that restore the original physical flags
advance persistent terrain identity twice. The native regression compares every
physical field of every tile, and verifies that only the edited epoch advances
and is serialized. A true event rollback still restores full serialized state
exactly; stale paid consent and stale rollback remain rejected.

The height checks use controlled complete two-player native worlds, including
real pre-height V4 bytes and receiving managers. They do not establish an
all-seven-player recorded trace, installed-map mesh screenshot, the complete
36-command UI flow, or original height algorithm agreement. The integrated UI,
automation completion fence and full-seven-player trace remain additional gates.
