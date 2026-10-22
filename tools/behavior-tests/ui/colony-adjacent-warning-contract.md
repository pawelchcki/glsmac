# Colony Action beside an existing city

`ui.colony_adjacent_warning.v1` exercises one healthy, unspent land Colony Pod
one southwest step from one owned city on flat arid land. The shared `spread`
fixture places a ready Scout at the city and a ready Former one southeast step
away. Both engines prepare those inputs before the first checkpoint. The
original prepares them through actual movement, Hold and turn controls from the
guarded original-created starting save. `initial_base` describes the city before
preparation; preparation income and raw city stores are guarded within each
engine rather than equated across engines.

Each trace presses Tab twice, opens MENU, selects Action and clicks source slot
zero. Two synthetic source profiles change that row's label and the common
`Script.txt` `BASETOONEAR` body. The common `NEWBASE` declaration and faction
name pool are declared inputs, never answers. The contract reports actual
selection, unit order codes and movement in thirds of a movement point, owned
city count, menu visibility, naming-dialog visibility and map message text.
Display text uses uppercase with folded whitespace.

The original observer checks native city membership, identity, citizen records,
stores and unit identities, positions, orders and movement without changing
those records. The paused year must remain unchanged. Message text comes from
independently segmented rendered glyphs, never from the installed source body
or requested action. Pre-action checkpoints settle across two identical full
observations. The last checkpoint captures the first frame after the click;
this observes a transient message without claiming its duration.

Reference acceptance requires fresh fixtures and identical complete outputs
and metadata in two independent original runs. Accepted observations are not
edited to fit the candidate.

Candidate replay must invoke the actual mounted production Action row and read
native units/cities and production UI state. It cannot assign expected message,
dialog or menu outcomes. The scope covers only the declared southwest neighbor,
source profiles and immediate command response. Other neighbors, distance
policies, factions, terrain, later message dismissal, general city founding and
AI remain outside this contract.

The optional `npm --prefix tools/wasm-tests run test:colony-near` lane loads the
same public source declarations and drives both traces through Chromium using
actual Tab keys and pointer input. Every pointer click requires native hover on
the intended mounted node. It checks all twelve native/control checkpoints,
source-file reads, actual HUD message content and dialog absence, then exits the
engine. This verifies real control delivery and native state; independent pixel
appearance and message duration remain outside this browser observer.

Separate application regressions exercise native owner/readiness guards, both
founding transactions, B and FOUND controls, duplicate/stale callbacks, pending
work and popup/inactive-turn guards, actual native movement to a distant site,
and message replacement/fade/removal. Their additional behavior is not counted
as original-game comparison cases.
