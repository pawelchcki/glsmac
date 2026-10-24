# Original all-player trace profiles (frozen before adapter recording)

`cases/natural-startup.json` describes ordinary stock original-seven
Gaian/Citizen/standard startup on synthetic flat arid land, native40x80
coordinates (matching x/y parity; horizontal wrap). First-city is native
turn1. The complete initial world is produced by the ordinary initializer:
all seven faction definitions, all native units and all native bases are
observed regardless of human visibility. No entity, roster, position,
resource or technology value is supplied to the initializer as an answer.

`reference_rng_seed:1` explicitly controls both original PRNG input states
immediately before final leader-name confirmation. This is an original-only
input control. Candidate `rng_state`, if declared, controls that engine
separately. Equality of algorithms or RNG draws is not asserted. No
original code is replaced and all subsequent answers execute original
instructions. Earlier unseeded repeats with different complete positions
are rejected and retained separately; they are not evidence for this input.

Players use actual live faction slots and native faction filenames.
Canonical stock identities are player:1 GAIANS, player:2 HIVE, player:3 UNIV,
player:4 MORGAN, player:5 SPARTANS, player:6 BELIEVE, player:7 PEACE.
Prototype names are read from actual native definitions and normalized to
lowercase ASCII words separated by hyphens; Scout Rover stays distinct
from Scout Patrol. Initial unit IDs are assigned once as
`unit:<owner>:<prototype>:<x>:<y>:<ambiguity ordinal>`; base IDs are
`base:<owner>:<x>:<y>:<ambiguity ordinal>`. They persist across moves.
The bounded scenario rejects deletion/compaction, reused runtime identity
and new births whose identity has not been independently established.
Runtime array indexes and verified additional state remain in diagnostics.

Core semantic state contains native turn, map dimensions, every live player
(id/faction), every native unit (stable id/owner/x/y/prototype), and every
native base (stable id/owner/x/y/population). Holding all ready human units
uses real controls; the next-turn action uses the actual turn-complete
control. A complete read must settle identically twice without advancing
past the requested native turn.

The separately frozen `economy-research-v1` case adds, for EVERY base,
`resources.minerals` (integer accumulated mineral store), `project` (actual
stock unit prototype token), and `jobs:{workers,doctors}`. Each specialist
must have an observed Doctor code; other types are unsupported. For EVERY
live player, state.research maps its canonical player ID to
`{owned_tech_ids,target_id,accumulated}`. Tech IDs are stock zero-based
TECHNOLOGY rows, target -1 means none, accumulation is integer native
science points. Unknown project kinds and non-Doctor specialists reject
this bounded profile; no defaults fill unobserved slots.

Nutrients are preserved as a raw diagnostic counter. Its initialization
and UI conversion are not sufficiently verified for semantic comparison.
Remaining movement, terrain resource calculations, general production,
AI algorithms, diplomacy, combat, spawn/delete identity and RNG equivalence
are outside these bounded profiles. Omission of these optional fields does
not weaken mandatory all-player/unit/base enumeration.
