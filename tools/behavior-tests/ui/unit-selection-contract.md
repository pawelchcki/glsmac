# Multiple-unit selection and waiting

`game.unit_selection.v1` compares thirteen control sequences involving exactly one
healthy Scout Patrol, Former and Colony Pod owned by the human Gaians on flat
arid land without fungus, enemies or combat. Each original case starts a fresh
process using Citizen difficulty, standard rules and a synthetic 40×80 map.
Declared faction bonuses `UNIT,1` and `UNIT,0` supply the extra units within the
original eight-bonus limit. Real first-base construction consumes the starting
Pod. Pause at end of turn is enabled and tutorials are disabled.

The stacked profile starts at MY2101 with all three units on the actual base,
full movement, no orders and Scout selected. The spread profile uses actual
southeast/southwest moves, Skip and one turn to prepare MY2102: Scout on the
base, Former at (+1,+1), Pod at (-1,+1), all ready. Preparation and every
checkpoint reject a changed unit count, identity, ownership, health, terrain or
unrecognized executable fingerprint. Active native Console identity is checked
against the visible unit name. Read-only native observations supply orders,
movement and coordinates; no original instructions or game state are patched.

Input contains exactly `profile` and `actions`, at most twelve actions and one
`advance`. Actions are W (`wait`), Tab, H (`hold`), Space (`skip`) and a real
paused turn advance. Output contains `trace`, including the initial checkpoint
and one checkpoint after every action:

- `year_delta`: integer native turn difference, zero or one.
- `selected`: `scout`, `former`, `colony`, or null when no unit is selected.
- `units`: all three roles in that order, each with relative `x_delta`,
  `y_delta`, `order` (`none`/`hold`) and integer `movement_spent` in thirds.

Coordinates use original grid units, normalized horizontally across its round
map. The candidate uses equivalent relative positions on its native four-wide
synthetic board, with a real base at (2,2). This is a bounded nearby layout;
it does not identify the original general distance metric or wrap priorities.

`game.unit_wait_state.v1` adds four stacked sequences: two twelve-action W/Tab histories
and two mixed Wait/Hold/Skip/turn-advance histories. Output retains `year_delta` and `selected`, and observes actual
Boolean vehicle state bit 0x2 separately for all three roles as `deferred`.
The original field layout is public structural metadata. The reproduction
checks its production controller's deferred state; it need not use the same
storage representation. The first two sequences observe the same selected identities
and history flags. The lifecycle sequences additionally check fresh-turn reset
after held and skipped units. These are direct original reads, never inferred expected
flags or candidate-generated answers.

The candidate executes the shared C++ selection controller used by the real
frontend, native unit readiness and positions, shipped Hold/Skip handlers and
actual turn advancement/callbacks. Synthetic installed component declarations,
initial world/Scout focus and display/transport acknowledgements are controlled
boundaries; graphics and audio are omitted. Fixtures supply no selection policy
or recorded answers. Native regressions additionally challenge removal, stale
identity, ownership and manual focus as application invariants.

Every whole original capture was repeated independently before freezing. The
historical real browser strictly failed its first W checkpoint: Scout remained
selected while the original selected Former. The browser lane drives all thirteen
selection traces through real W/Tab/H/Space and the Next Turn control, reading
actual native units and selection callbacks. Wait-state flags are checked in
the display-free lane. Neither lane establishes full-game parity.

Seven additional selection traces cover every subset of held units across a
fresh turn, including the all-held case that retains empty selection. Together
with the earlier no-Hold trace, all eight Hold/Skip subsets are observed. These
recordings match the existing shared controller without implementation changes.

Other unit counts, arbitrary topology, enemies, transport,
mouse selection policy, persistent orders beyond Hold, modal selection blocking,
automatic end-turn preferences, multiplayer and save/load remain outside these
contracts. The activation picker has a [separate contract](unit-activation-contract.md).
Application guards and additional native tests are separate from
original observations.

```sh
python3 tools/behavior-tests/ui/run.py --suite unit-selection-core --suite unit-selection-lifecycle --suite unit-selection-spread --suite unit-wait-flags --suite unit-selection-held-turn --suite unit-selection-held-subsets --suite unit-wait-lifecycle
SMAC_ASSETS_DIR=/path/to/game npm --prefix tools/wasm-tests run test:unit-selection
```
