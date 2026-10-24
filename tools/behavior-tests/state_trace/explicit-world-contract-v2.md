# Explicit seven-player initial world v2 — frozen input

The initial snapshot action is `before`; its checkpoint ID is `initial` and
its after_action is `before`. The rejected v1 input used reserved action ID
`initial`; no original post-action output was recorded for that invalid input.

This is a new synthetic input. It does not replace, re-project or alter either
natural-startup case or its accepted/rejected observations. The input is frozen
before any post-action answer is recorded in either engine.

`cases/explicit-seven-world-v2.json` supplies the complete participant roster,
base roster and unit roster. All seven original stock factions are live; only
player:1 (Gaians) is human. Native runtime slot/array indexes are diagnostics.
The author-supplied IDs `base-p1`..`base-p7` and `scout-p1`..`scout-p7` persist
through actions and must not be regenerated from later coordinates.

The map has native dimensions40x80, matching x/y coordinate parity and horizontal
wrap. Terrain is uniform arid, flat lowland with no fungus, rockiness, river,
bonus resource or improvements other than the declared native base centers.
The seven bases are at (6,12),(22,12),(6,32),(22,32),(6,52),(22,52),(6,72).
Each has population1, one Doctor, zero Workers, no worked noncenter squares,
raw nutrient counter0, mineral store3, Colony Pod production and Headquarters.

Each base starts with one owned Scout Patrol on its center. Units start at full
health1.0, stock MORALE row2 (`disciplined`), full ordinary infantry movement,
order `none`, and no home base. These are INITIAL controls, not expected
post-action values. The faction-specific natural Scout Rover remains in the
separate natural-startup observations; it is not substituted there.

All players start with exactly stock TECHNOLOGY row6 owned, no research target
(target_id=-1) and accumulated science0. Stock row numbers are the established
zero-based source table IDs. Rules are Citizen/standard, with Blind Research on.
The declared reference RNG input1 is applied before initial-world recording;
no cross-engine RNG equivalence is claimed. Calling and selected player is
player:1, selected unit scout-p1; native turn is1. Configuration/factories run
before these initial controls are assigned. No automatic FirstTurn income is
allowed after assignment and before the initial checkpoint.

The original adapter may set only these declared INITIAL data controls and the
map/entity membership required to assemble them, before the initial snapshot.
It must execute original instructions for each subsequent action and observe
all seven players and every native unit/base after each action. It must not
insert post-action coordinates, orders, production, resources or technologies.
The candidate likewise uses actual native factories/managers and commands.

Three independent fresh scenarios share this input:

- Initial snapshot, then move human scout-p1 east using a real movement action.
- Initial snapshot, then Hold human scout-p1 using a real order action.
- Initial snapshot, Hold all ready human units, then one actual end turn.

Semantic state follows economy-research-v1 for all owners: player ID/faction;
unit ID/owner/position/prototype; base ID/owner/position/population/mineral
store/project/Worker+Doctor counts; every player's owned tech IDs, research
target and science accumulation. The explicit-world observer additionally
compares each unit's verified `order` token (`none`/`hold`). Raw spent movement,
health, morale, nutrient counters and source/runtime identities are retained
in diagnostics unless separately promoted by a new frozen profile.

The first two scenarios isolate human actions while retaining every foreign
player/unit/base field. The turn scenario preserves actual AI decisions and
resource/production/research changes even if candidate support differs. AI
parity, RNG equivalence, unmodeled player economy, tile visibility, diplomacy,
combat and entity births/deletions are not inferred from a passing move/hold
comparison. Unsupported fields and fixture controls must be reported honestly.
Every accepted original scenario requires independent fresh repeat2 equality;
failed full records remain rejected rather than losing differing entities.
