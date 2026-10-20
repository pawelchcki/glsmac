# Former road movement and partial-move work

`game.former_road_movement.v1` declares sequences of `west`, `east`, `farm`,
`advance` and `cancel_work` actions. Three independently repeated original traces
are frozen in the passing catalog and match native display-free replay.
Each sequence starts a fresh original Gaians/Citizen/standard process on the
synthetic flat arid 40×80 land map used by `game.former_work.v1`, with its declared
`UNIT,1` starting bonus and held Scout. No executable or process memory is patched.

Preparation uses real commands to build roads on two adjacent non-base squares
east of the base. Each construction and non-road move is followed by a real
turn. Recording starts on the eastern road, with full movement and no work.
The installed rules, work rates and terrain remain unchanged. Preferences pause
turns and disable tutorials; recognized research defaults and turn/cancel
confirmations are accepted. Native state is read through the pinned executable's
guarded read-only observer, with screenshots retained privately.

Input has exactly `actions`, at most twelve known commands and six advances.
Output has exactly `trace`, one initial checkpoint and one after every action:

- `position`: signed same-row tile steps east of the recording start, normalized
  on the round map (one tile step is two original horizontal coordinate units).
- `year_delta`: actual native turn difference from the recording start.
- `order`: actual native order, normalized to the work contract's names.
- `movement_spent`: native movement spent in thirds of one ordinary movement point.
- `work_units`: native integer work counter.
- `terrain`: actual current-tile Road, Farm, Mine and Forest flags.

The candidate must execute shipped movement and work handlers on actual native
units and tiles, with actual turn callbacks. Equivalent source declarations,
initial terrain and positions, turn acknowledgements, animation completion and
omitted display/audio are controlled boundaries. The adapter cannot supply
movement/work effects or read expected observations.

This scope excludes ZOC, enemies/combat, changed road-rate rules, different
terrain, abilities, damaged workers, other domains, AI and random insufficient-cost
moves. Application rule-loader and lifetime checks remain distinct from recorded
original behavior. Three declared sequences are in `cases/former-movement.json`.

The traces observe three road steps exhausting the turn. Farm work starts after
either one or two steps and records two work units. Cancelling that same year
retains those units and leaves movement exhausted. Reordering the same task
restores its active order without another tick. The following turn records four
units; cancelling then restores full movement and two retained units. These are
explicit recorded checkpoints, not a claim about every unit or terrain.

The baseline production scripts reported three strict errors. Production now
imports the road rate from installed `RULES`, uses live road flags and spends
integer road steps without floating-point drift. Work supports positive partial
movement and guarded exhausted same-task resume. Native application tests check
edited rates, locking, exact movement/work rollback, changed source state and
repeated resume. The browser lane drives the same three traces through
ArrowLeft/ArrowRight, F/A and actual turn controls on a declared small road map;
it additionally verifies native position and clean engine exit.

```sh
python3 tools/behavior-tests/ui/run.py --suite former-movement
SMAC_ASSETS_DIR=/path/to/game npm --prefix tools/wasm-tests run test:former-work
```
