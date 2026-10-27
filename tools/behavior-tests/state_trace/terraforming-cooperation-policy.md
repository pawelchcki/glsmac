# Nonheight cooperation: application policy v1

Application acceptance is verified on immutable native runtime v6, source tree
`115032ffc7f53ff7f0c3a9f997da12674e25e643`. The corrected main suite passed
35 scenarios / 248 assertions, including all 22 variants and actual legacy/receive
checks. The seven-owner suite passed 1 / 151. The 4,096-tile capacity case passed
1 / 11 after per-call validated-plan reuse, including native exact 512 KiB
readback and one-byte-over rejection. These results add no original-game matches;
frozen original observations and their expected answers remain unchanged.

The main proof is `/tmp/terraform-cooperation-v6-corrected.json` (host
`9166948c`); ownership is `/tmp/terraform-cooperation-v6-owners-corrected.json`
(host `0f206c45`). See [aquifer reuse](aquifer-plan-reuse.md) for the exact
capacity source/runtime and retained failures, [observation](cooperation-observation.md)
for full seven-owner captures, and [preview](cooperation-preview.md) for mounted
progress and compatibility. Final-source browser and CI/review gates remain separate.

The policy covers all 17 nonheight land actions and their five sea variants:
farm, soil enrichment, mine, solar, forest, road, mag tube, bunker, airbase,
sensor, fungus removal/planting, condenser, mirror, borehole, aquifer and Level.
Monolith remains editor-only; paid height cooperation is unchanged.

A cohort requires the same actual owner, domain, action, target, source work
requirement and sealed terrain baseline. Foreign or different active jobs reject.
Eligible paused work contributes only while that living capable worker remains
on the matching square. Each native `work_units` is that worker's own credit.
The pure cohort total is their sum; it is never copied into participant counters.
Existing per-turn contribution and ordinary cancellation rules apply to each
worker separately. Damaged living workers and positive fractional movement keep
the same validated work-credit policy. Every real contribution consumes that
worker's available movement exactly as ordinary work did before cooperation.

Completion applies one actual native terrain batch, including condenser/aquifer
neighbors, and clears all matching participants once. Noncontributing movement
remains available. A paused Hold/Sentry intent is retained when its work finishes.
Only a completing receipt captures/restores mutated peers. An ordinary incomplete
contribution undoes only its actor, preserving later unrelated peer contributions.
Before completing undo, every participant's current canonical identity, owner,
position, health/morale/definition, work, movement, order, recovery, automation and
home is checked before any participant or terrain restoration. True terrain undo
keeps its existing native world/epoch/occupancy checks.

The recorded existing same-target Mine-to-Farm behavior carries the switching
worker's own work credit. That credit leaves the old cohort immediately. No
teammate credit transfers. A stale same-action terrain identity discards old job
credit; direct physical A-to-B-to-A edits remain different jobs because the native
persistent per-tile epochs advance. Unrelated terrain edits do not invalidate a
job. Deliberate movement abandons new location-bound cooperative work; true move
undo restores the complete old work object through the existing move receipt.

## Native transport

Ordinary `get_terraforming()` retains its ten fields. Paid `height` retains its
nine-field context. They are unchanged when no cooperative context exists. New
cooperative work adds exactly:

```
job = {version: 1, policy: 'application.cooperative-work.v1',
       owner: Int, terrain_identity: String}
```

`job` and `height` are mutually exclusive. The new optional tagged extension is
`unit-cooperative-work-v1`. It rejects unknown policy/version, wrong owner or
worker capability, incomplete/extra fields, non-ASCII/empty/oversized identities,
duplicate tags and truncated data. Legacy payloads without the tag remain real
singletons; an explicit validated start/resume may attach a current job identity.
Actual historical pre-height V4 map/unit bytes are used in the migration check,
not freshly written payloads with an optional field left empty.

The readonly native `get_terraforming_schema_version()` returns integer 2 even
for an idle unit. An older runtime lacking that method is an unsupported
capability, not a legitimate empty job.

## Exact compact identity

The identity contains the actual owner/action/domain/target/source work rate and
sorted y/x guard tuples for the actual deduplicated effect footprint only:

```
[x, y, persistent_tile_epoch, center, water01, moisture, rockiness,
 raw_features, raw_improvements, thirteen_construction_owners]
```

It includes no unit ID, own contribution, last-turn counter, global mutation
counter, process pointer, callback, output patch, bonus or rendering corner.
Those omitted physical values are neither written nor validated by these
nonheight effects. The plan is recomputed before joining/contributing/completing;
a changed river route/footprint fails the old job identity. Native epochs come
from actual `get_terrain_state().terrain_epoch`, persisted by `terrain-epoch-v1`.
The compact geometry getter does not contain an epoch and supplies none here.
Each affected full terrain record is cached only within that single plan call;
no full-world query or cross-call cache is introduced. Aquifer's native patch cap
is checked before allocating its route's full feature or guard records.

The provisional native limit is 524288 ASCII bytes. Source-constrained Python
encoding of 4096 maximum-width tuples is 450722 bytes including the header;
a unique synthetic 4096-point footprint is 434274 bytes and a singleton upper
example is 272 bytes. These are encoding bounds, not native observations. The
actual native exact-JSON footprint and maximum-range/type tests remain required.
The bound uses native map limits 4096 per axis, int64 epochs, uint16 flags and
int8 construction ownership. No hashing/collision assumption substitutes for
exact identity.

## Observer contract and remaining proof

The actual pure GSE export is
`default/game/terraforming.gls.js::cohort_state(game, unit, read_cache)`.
It is not a native getter. It returns null for absent/stale/ineligible work,
otherwise exactly:

```
{version:1, policy:'application.cooperative-work.v1', own_work_units:Int,
 cohort_work_units:Int, required_work:Int,
 participants:[{unit_id:Int, work_units:Int, active:Bool}]}
```

Participants follow actual native unit-ID order. It uses actual unit owners and
never local UI selection/owner eligibility, so opponent cohorts remain visible.
The optional cache belongs to one synchronous observer read, is fresh each time,
and shares one plan/participant evaluation among matching members. Only detached
validity/total/participant data is cached. A subsequent terrain/peer change must
be read using a new cache. Observers retain raw own counters and actual job
metadata separately; old runtime capability absence must remain explicit.

The new application suites stage the real old cooperation guard failure before
any schema-v2 assertion, all 22 variants, damaged/fractional credit, cross-turn
completion, paused resume, unrelated peer progress undo, conflict/foreign owner,
stale peer and target ABA, own-credit job switching, real receive/legacy bytes,
codec bounds, and one live seven-owner local/opponent capture with pure reads.
All remain unverified at this source checkpoint. Native busy fences, paid height,
legacy solo work and actual rendering/selection remain separate compatibility
checks. No new graphics, sound or work-tool animation is claimed.

Source cross-review corrections are retained as a separate checkpoint: effect
planning clones a cached terrain record before mutating its patch dictionaries,
so common identity retains actual pre-effect owners. Cached raw/scalar guards
were not mutated, and the full record now stays immutable for future fields too.
Same-action exhausted resume requires the actual current job identity; a stale
paused order rejects before activation. Peer receipt capture materializes the
native Float without arithmetic normalization, preserving negative-zero bits
through true completion undo. New regression inputs exercise all three cases.

The actual GSE `#sizeof` accepts arrays only. No production string-size call or
new global builtin is introduced. Native `ValidWork` enforces the actual byte
limit; the fixed tuple shape and native patch/dimension/type limits bound pure
preflight. The capacity test retains its exact native JSON identity string for
independent Python UTF-8 byte measurement in the full raw log. The existing
measurement runner accepts the real `terraforming-cooperation-capacity` catalog
ID and preserves that complete log/runtime/source/RSS binding. Its typed native
transport test pads the actual identity to the exact documented byte boundary,
checks exact readback, and rejects one additional byte without mutation.

The first actual v5 application run stopped at its codec fixture assertion after
31 completed scenarios (including all 22 variants); aggregate suite status stayed
failed. A single-case diagnostic proved exact roundtrip/source/receiver/truncation
guards true, but the legacy `receiving_owner` flag also requires morale set
`SYNTHETIC`; the unchanged source Formers use `STANDARD`. The test-only probe now
reports separate actual canonical owner and morale registry identity flags,
retaining its old combined flag unchanged. The cooperation case asserts both
canonical identities and all old byte/rollback guards, without altering the unit
input or claiming a stock morale change. On the matching v6 runtime both actual
canonical identity flags and all unchanged roundtrip/truncation guards passed.

The subsequent v6 malformed-loop failure is a proven GSE fixture control-flow
issue: a terminal `try/catch` returns an `Undefined` object, and the array loop
treats that non-null value as a return. Only its first invalid input ran, followed
by the separate extra-field test (two catches). The captured end-only diagnostic
proves counter 2 while the complete native bytes remain unchanged. The test now
asserts each actual caught rejection and full byte equality after the catch,
then increments its counter as a normal statement. All eight invalid inputs and
the final equality guard remain; per-input atomicity coverage is stronger. No
GSE engine or production validation behavior changed. Original failures and the
end-only diagnostic are retained separately from the corrected 35 / 248 passing
gate; the original failures have not been relabeled as passes.
