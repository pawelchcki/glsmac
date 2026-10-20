# Bounded Former work transfer

`game.former_work.v1` has **two independently repeated original cases** in
`catalog.json`. Both match strict native display-free candidate replay. They
are included in the 611-case catalog; the original observations are unchanged.

The fixture starts a fresh original process for every case. It loads a synthetic
40×80 flat arid land map, chooses Gaians/Citizen/standard rules, and adds a
declared `UNIT,1` faction bonus to supply one normal Former. The Scout holds.
The Former moves one square east from its base and waits until MY2102 with
full movement before recording. Displayed research defaults are accepted and
contact offers declined. Replacement and end-turn confirmations are accepted
only after recognizing their captions and choices. No executable or process
memory is patched.

The first case changes only four installed `TERRAIN` work-rate fields and
observes mine work, completion and the following turn. The second retains the
installed rates and observes farm work, next-turn progress, cancellation,
same-year resume and completion. The observer reads the actual vehicle order,
movement spent, work counter and four map flags through guarded read-only
native memory access. Movement spent uses thirds of a normal movement point;
work units are the original counter, which increments by two in these observed
full normal-Former ticks. Coordinates, random starting positions and unrelated
AI state are omitted from the output.

The cancellation trace observes the work counter returning from four to two
and movement spent returning from three to zero. Resuming in the same year
restores four work units. These are recorded checkpoints, not a general rule
for every terrain or worker ability.

The source consumer, native work-state persistence and native terrain-edit
bridge have separate application tests. Browser checks exercise real tile
edits, resource queries, world and preview redraws, and clean shutdown under
two source profiles. Those fixture edits do not simulate Former work.
Production scripts now implement work commands, automatic fresh-turn progress,
completion before base income and cancellation with retained progress. Replay
uses actual native units, tiles and `Game::AdvanceTurn`; only synthetic equivalent
installed inputs, initial placement and explicit turn acknowledgements are fixture
boundaries. It loads no original assets, evidence answers or original adapter.
The application also exposes four buttons, F/M/Shift+F/R and Activate cancellation.
The optional `test:former-work` browser command replays both frozen checkpoint
sequences through the actual shortcuts, event transport, turns and terrain
renderer on a declared synthetic 16×16 arid world. Both profiles also verify
source-based active order labels and clean engine exit. This adds application
integration coverage, not original UI-label or map-generation observations.
These observations establish no parity for rocky/moist/sea
terrain, fungus, multiple Formers, advanced abilities, injured workers, other
factions, AI, research behavior, rendered work labels or the full game.

```sh
# Evidence integrity; does not execute either application.
python3 tools/behavior-tests/ui/run.py --suite former-work-core --validate-only

# Strict native candidate replay of the original checkpoints.
python3 tools/behavior-tests/ui/run.py --suite former-work-core
```

`generate_former_work.py` declares eleven input sequences in `former-work.json`
and the two-case recorded subset in `former-work-core.json`. The other nine
sequences have no accepted public observations yet. Recorder shape, synthetic
input edits, evidence integrity and turn-resumption safety have Python tests.
Private failed captures and screenshots are not reference evidence.
