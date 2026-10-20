# Bounded Former work transfer

`game.former_work.v1` has **six independently repeated original cases** in
`catalog.json`: two core cases, two held-out Road/Forest cases and two
task-switch/replacement cases. All match strict native display-free candidate
replay and are included in the 618-case catalog. Existing observations are unchanged.

The fixture starts a fresh original process for every case. It loads a synthetic
40×80 flat arid land map, chooses Gaians/Citizen/standard rules, and adds a
declared `UNIT,1` faction bonus to supply one normal Former. The Scout holds.
The Former moves one square east from its base and waits until MY2102 with
full movement before recording. Displayed research defaults are accepted and
contact offers declined. Replacement and end-turn confirmations are accepted
only after recognizing their captions and choices. No executable or process
memory is patched.

The first core case changes only four installed `TERRAIN` work-rate fields and
observes mine work, completion and the following turn. The second core case retains the
installed rates and observes farm work, next-turn progress, cancellation,
same-year resume and completion. The observer reads the actual vehicle order,
movement spent, work counter and four map flags through guarded read-only
native memory access. Movement spent uses thirds of a normal movement point;
work units are the original counter, which increments by two in these observed
full normal-Former ticks. Coordinates, random starting positions and unrelated
AI state are omitted from the output.

The held-out cases observe an immediate ordinary Road and the following turn,
and an edited Forest order, completion and the following turn. They use the same
original fixture and unchanged observer; both entire capture runs agree.

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
The optional `test:former-work` browser command replays all six frozen checkpoint
sequences through the actual shortcuts, event transport, turns and terrain
renderer on a declared synthetic 16×16 arid world. The profiles also verify
source-based active order labels and clean engine exit. This adds application
integration coverage, not original UI-label or map-generation observations.
Farm-to-Forest replacement reads its caption, body and two choices from the
installed `xscript.txt` MIMIMI block and substitutes the installed Farm name.
The browser also cancels once before accepting, checking that cancellation has
no native effect. Dialog geometry/audio/keyboard parity and common-versus-expansion
text precedence have not been recorded.
These observations establish no parity for rocky/moist/sea
terrain, fungus, multiple Formers, advanced abilities, injured workers, other
factions, AI, research behavior, rendered work labels or the full game.

```sh
# Evidence integrity; does not execute either application.
python3 tools/behavior-tests/ui/run.py --suite former-work-core --validate-only

# Strict native candidate replay of all six original traces.
python3 tools/behavior-tests/ui/run.py --suite former-work-core --suite former-work-basic --suite former-work-edge
```

`generate_former_work.py` declares eleven input sequences in `former-work.json`
and the two-case recorded subset in `former-work-core.json`. The held-out subset
is in `former-work-basic.json`. Two additional repeated cases are frozen in
`former-work-edge.json`, now promoted out of the pending catalog. The other five
sequences have no accepted public observations yet. Recorder shape, synthetic
input edits, evidence integrity and turn-resumption safety have Python tests.
Private failed captures and screenshots are not reference evidence.

The switch trace cancels a Mine from four to two work units, then
immediately completes an edited four-unit Farm with the retained work. The
replacement trace retains its existing Farm while Forest work is active and
removes it when Forest completes. Both initially reported strict errors. They
now match production work events and actual browser controls. A per-case callable
still preserves each failure if a future regression rejects a sequence; one
caught GSE exception cannot hide the next case.
