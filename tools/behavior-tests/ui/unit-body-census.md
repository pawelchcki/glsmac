# First stage: cached native unit-body census

Status: the corrected observer build and one bounded static runtime case passed;
see [the actual proof and its limits](unit-body-census-proof-v1.md). The original
source plan used isolated PR37 base
`810c9038646cfa0b416ec7bdb566d700d8354018`, with Trace precision adjustments.
This replaces the first implementation stage of the
larger movement proposal (source-plan commit `d0055cc1`); its backend
cause, Scroller lifecycle and clock instrumentation remain deferred. This explicit isolated-source grant supersedes the earlier wait-for-merge plan;
port only the observer delta to the actual successor main before final delivery.

The useful first result is a genuine association between every currently known
frontend unit and its actual cached body resource, native instance identity and
stored normalized coordinates. Existing proofs establish HUD payload identity;
they cannot supply that association. A static idle census can establish it
without adding a streaming producer or modifying movement handling.

## One synchronous API

The source adds `glsmac.get_unit_body_census(game)`, where `game` is the actual configured
Native backend Game wrapper. The existing GLSMAC bridge already owns the current
frontend. FIRST check stable `this->m_gc_space->IsOwnerThread()` before any
read or dereference of `m_game`; then check initialized current frontend/Game
binding. Different current Game, uninitialized/teardown or wrong-thread reads
are unavailable, not invented empty successful censuses. Backend Game pointers
can be reused across sessions: same-pointer stale session rejection and
cross-session continuity are explicitly unsupported without an epoch.

The API returns a Native String containing the versioned JSON document, with
finite Float32 text/bits and typed lossless IDs copied synchronously. This lets
C++ enforce the encoded byte bound before returning and avoids escaping native
reference-backed values. It registers no
callback, timer, drain command, trace epoch, background task or pointer-bearing
GSE wrapper. No state escapes as Native FloatPtr values. It does not focus,
select, show, hide, load a resource, rebuild a matrix or advance an animation.
The caller invokes it at a deferred safe application boundary outside dispatch;
the API does not fabricate a dispatch-quiescence receipt. First acceptance uses
an idle initialized scene and brackets reads with immediate native world guards.

## Approved seven-path lease

| Existing path | Narrow addition |
| --- | --- |
| `src/GLSMAC.cpp` | The explicit Native API, checked configured-game binding and by-value Native String result construction |
| `src/game/frontend/Game.h` | Inline initialized/readiness predicate after the existing GC owner-thread gate; no Game.cpp change or new constructor field |
| `src/game/frontend/unit/UnitManager.h` | Const observation access to the current unit inventory and checked owner lookup through the existing slot-badge table; no manager update/move change |
| `src/game/frontend/unit/Unit.h` | Read-only body snapshot structure/accessor declaration |
| `src/game/frontend/unit/Unit.cpp` | Copy existing unit/render fields and call cached-only readers; leave Refresh, ranking, Show/Hide and movement behavior untouched |
| `src/game/frontend/unit/UnitDef.h` | Inline const cached-only sprite/definition description and cache-entry count; return unavailable instead of invoking GetSprite/GetSpriteTexture |
| `src/scene/actor/Instanced.h` | Inline const copy of existing instance-map position/angle/presence and count; no SetInstance/UpdateInstance/GetInstanceMatrices call |

No new header or backend/FrontendRequest/Timer/Scroller/graphics/shared UI trace
change is required for this stage. Root approved exactly these seven paths plus dedicated tests/docs for source
work; Delivery pinned the isolated base. Build/live work still requires a
separate reviewed-source grant.

The owner lookup must not infer foreign ownership from `IsOwned()`. The actual
Unit constructor stores `m_slot_badges = GetSlotBadges(slot->GetIndex())`.
Copy that pointer only inside C++; the manager checks exactly one matching entry
in its existing slot-index→badge map. Emit the actual slot index, never a pointer.
Missing/ambiguous matches make that census incomplete. This avoids adding owner
metadata to every spawn or reading backend state from the frontend thread.

`UnitDef::GetSprite` is lazy. Resolve from the Unit's actual retained `m_def`
pointer and constructor-fixed `m_morale` (the pair used by Show/Hide/coordinate
writes), never a manager lookup by predicted definition ID. The new lookup only
checks that definition's existing ordinary sprite or morale-keyed cache. It never inserts into those caches or
calls a texture loader. Capture definition cache-entry counts before and after
the read; require equality. Actual resource descriptors come from the cached
InstancedSprite and its existing Sprite/Texture getters. Empty texture filenames
are unavailable subfields, not a guessed installed asset.

`Unit::m_render.coords` is not the actual stored actor-instance position.
`Instanced::SetInstance` stores `Sprite::NormalizePosition(position)`, which adds
the sprite destination offsets. Copy both logical unit render coordinates and
the actual stored normalized instance values. The new const map lookup must not
generate an instance, matrix or world-copy transform. Include existing destination
offsets so a consumer can check native Float32 normalization independently.

## Result contract

Source schema: `application.unit-body-census.v1`. The result is a synchronous
native value copy, not an assertion about a displayed GPU frame.

| Field | Meaning |
| --- | --- |
| `complete`, `reason` | Complete known-frontend inventory or explicit unavailable/incomplete reason |
| `requested_game_matches` | Checked actual Native configured-game identity, not an observer-generated gameplay ID |
| `known_frontend_units`, `owner_counts` | Actual current inventory, sorted unit rows and checked owner membership |
| `unit_id`, `owner_id`, `definition_id` | Actual native identities; native integer transport must remain lossless |
| `unit_render_coords` | Current stored unit coordinates as finite Float32 values and raw uint32 bits |
| `resource` | Actual cached resource key/name, atlas metadata and destination offsets; filename only if present |
| `instance_id`, `instance_state` | Actual resource-scoped ID and `unallocated`/`absent`/`present`; omit ID if never allocated |
| `instance_position`, `instance_angle` | Actual stored native map values/bits when present; angle is not a gameplay facing alias |
| `unit_shown`, `actor_visible` | Actual submitted/unit-rendered and actor visibility flags, not viewport coverage or unoccluded pixels |
| `cache_counts_before`, `cache_counts_after`, `instance_counts` | Actual cached sprite-entry and per-resource instance counts before/after the read |
| `supported` | Explicit per-field capabilities; unsupported values are absent, never fabricated as zero |

Native size_t identities use typed canonical UInt64 decimal strings in
this new wire result. Checked conversion relates them to existing signed Native
GSE/world Int IDs; no unchecked JS Number conversion. Coordinate values are copied
Native Floats, with exact F32 bits, including signed zero; nine-digit text must round-trip to those bits. Descriptor/source
strings are copied while their real owner is alive. No memory addresses leave C++.

An unallocated or hidden body still has a census row. Do not omit other owners,
filter to selection/viewport, invent an instance for a hidden unit or substitute
the HUD resource. Present-instance identity is scoped by actual cached resource
key plus native instance ID and checked unit relation. Require the actual
present map entry and reject duplicate PRESENT(resource key, instance ID) claims
across units. Unique unit IDs alone are insufficient. Raw instance ID alone is
not globally unique. No pointer is retained after the call, so this stage needs
no stale asynchronous producer cleanup or invented actor-lifetime identifier.
Cross-session identity continuity is unsupported; the caller binds each read to
its current actual Game and native world, and may not join reused IDs across games.

Initial false capabilities: GPU/frame identity, camera/projection/world-copy
sampling, screen bounds, occlusion, gameplay facing, animation frame/clip,
skeletal/tool pose, movement duration/cadence, backend completion/cause and audio.
Stored instance angles can be observed as renderer data without claiming facing.
The producer knows its complete frontend inventory; all-native-world completeness
is established only by the independent case comparison, not assumed by the API.

## Bounds, disabled behavior and acceptance

There is no enabled mode to leave running: uncalled means no iteration, string
building, cache access, log append, queue lock, timer or added constructor cost.
Requested snapshots pass the existing stable GC owner-thread gate first. Limit the result to
1,024 known units and 4 MiB encoded data; exceeding either limit returns incomplete
without silent filtering. Observation-only allocation/encoding errors must not
change gameplay or suppress an original engine exception. Call count/timing and
post-dispatch delivery bounds belong to the harness; they are not native frame
or animation timestamps.

Source/pure negatives should cover no-live/different-current-game/wrong-thread/teardown,
ambiguous owner, empty cached lookup, unallocated versus absent instance, wrong
resource/instance relation, duplicate present resource/instance pairs, duplicate
unit IDs, normalized versus logical position,
F32 signed-zero/type/bit corruption, overflow and any accidental lazy creation.
Two static reads must preserve all relevant cache counts and existing identities.
Do not call the mutating `Graphics::GetFramesCountAndReset` or a lazy matrix
generation method to manufacture a frame/coordinate observation.

The smallest later controlled proof reuses a fresh installed-source Scout world
with all seven players, seven cities and nine units. An ordinary native tile
selection may establish the known base-free Scout stack; it is a declared setup
action, not a replacement renderer. At a deferred initialized idle boundary:

1. Immediately serialize every player's native world and unit Float bits.
2. Read the census twice, with no new game action between them.
3. Require exact equality of native unit/owner sets with the world, including
   foreign and hidden/unallocated rows; require at least the selected stack's
   actual submitted body instance to be present and bound to the correct unit.
4. Check actual resource-scoped instance identity, normalized coordinates/F32
   bits, logical-coordinate/destination-offset relation and unchanged cache
   counts. Do not substitute a prototype's predicted coordinates into a row.
5. Immediately serialize the full native world again; require no gameplay state
   difference, then normal actual APPexit0, canonical log acknowledgements,
   complete sealed raw/chunks and owned worker reaping before evaluation.

This can prove actual submitted-body identity and cached normalized position;
it cannot prove a rendered pixel, motion, leg animation or original appearance.
If a hidden/unallocated row prevents the required present-body assertion, retain
that setup limitation; do not show it from the observer. Only after this useful
capability works should a separate ordinary move case add streaming actual ticks,
last-tick native action identity and backend completion under another lease.

The only original input remains the clean single-Scout exploration contract
SHA-256 `2b1155ae357a73ec9ab653b9fff76066db862d37c763e54af5898f61ac99e003`.
Distinct leg configurations/HUD advance are future observation targets, with zero
accepted repeated cases. No cadence, frame count, facing index or resource/clip
binding follows from it. Current candidate static/morale-atlas source and absent
verified direction/tool/limb bindings remain explicit gaps.

## Source implementation and pure protocol check

The new callable is off by default because nothing calls it automatically. Its
only entry is an explicit Native bridge call. The seven source changes are
uncompiled and unexecuted until a separate build/live grant. No native passing
count follows from the pure decoder or synthetic tests.

`state_trace/unit_body_census.py` rejects duplicate JSON fields, unavailable or
incomplete snapshots, unsupported capability claims, noncanonical UInt64 IDs,
missing units/owners, duplicate resource/instance claims and invalid normalization
or Float32 encodings. Float text uses native `max_digits10` (nine digits); its
IEEE-754 Float32 bits are authoritative and the text must round-trip to them,
including signed zero. Renderer angles remain renderer metadata. The optional
world argument is an identity projection supplied by the caller; it does not
authenticate a Native capture, check the entire world or establish exit/seal.

Additional diagnostic limits are 4,096 current definitions, 65,536 cached sprite
entries, and per-descriptor escaping bounds. The 4 MiB limit bounds encoded output,
not peak temporary allocation. Limits, nonfinite fields and copy failures return
explicit incomplete/unavailable output, never a successful truncated census.

Pure check (zero engines, zero original comparisons):
`python3 -m unittest discover -s tools/behavior-tests -p test_unit_body_census.py`

The owner census covers every known frontend **unit**, including foreign units;
it does not create rows for empty player slots. All seven player records and
all backend units/cities/tiles remain a separate mandatory world guard. The
protocol's identity projection must include every native unit and use actual
native definition IDs, not inferred artwork names.

Source freeze validation: 18 synthetic protocol tests passed with zero engines
and zero reference comparisons; `git diff --check` passed. No compiler was
invoked. Wrong-thread/current-game/teardown and disabled/no-op behavior remain
source-reviewed contracts pending a separately authorized native build and
execution; synthetic unavailable packets are decoder negatives, not proof that
the native guards executed.
