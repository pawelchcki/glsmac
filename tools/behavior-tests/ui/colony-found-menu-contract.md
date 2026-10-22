# Colony Pod city naming from the Action menu

`ui.colony_found_menu.v1` covers a healthy, unspent land Colony Pod on a free,
flat arid square two tiles southwest of one owned city. A held Scout remains
at the old city and a held Former one tile southeast. Each engine establishes
those inputs before the first checkpoint. The original uses real movement,
Hold and turn controls from the guarded original-created starting fixture.
`initial_base` describes the existing city before preparation; preparation
income and the old city's raw stores are guarded within each engine rather
than equated across engines.

The two source profiles declare Action source slot zero, common `Script.txt`
`NEWBASE` caption/field label and a faction `BASES` input pool with 64 repeated
synthetic names. Other installed source sections remain intact. These names
are source inputs installed before world creation, not injected dialog values
or expected outcomes. The bounded pool does not establish general random name
allocation, duplicate handling or pool exhaustion behavior.

Each trace clicks MENU, Action, and the observed free-tile leading row, edits
the actual field, cancels, reopens the row, edits again and confirms. One case
uses Cancel/OK buttons and one uses Escape/Enter. Every checkpoint reports
actual dialog caption, field label, visible draft and button labels, selected
unit role, surviving unit orders/movement, owned city count, and the new city's
raw name/population/Worker/Doctor/worked-square counts when present. Display
text, including the visible draft, is normalized to uppercase with whitespace
folding. The native city name retains its raw case. Movement uses thirds of a
movement point; every tested checkpoint remains in the same paused year.

The original observer reads rendered controls independently and waits for two
identical complete observations. Caret-overlaid draft frames are rejected,
never repaired using typed input or a source name. Read-only native records
guard old-city identity/citizens/stores, all surviving unit identities and
positions, held companions, year and global/owned city membership. During the founding announcement the original clears its selected unit ID
to minus one while its map unit-mode flag remains set. The observer accepts
that actual no-selection state only after the declared Pod disappears and
the new city exists. An arbitrary missing or foreign selection still fails.

Reference acceptance requires `compare.py record --repeat 2`, a fresh original
fixture for every case and identical full outputs and metadata. Original assets,
saves, screenshots, executables and research stay outside the repository.
Candidate replay must mount real production menus and naming controls, use the
shared native text-input state, and execute actual production commands against
native unit/city state. Source identity comes from the clicked mounted row.
It must not assign dialog outcomes, consume units, create cities or rename
bases in the adapter.

The final checkpoint verifies confirmation's native city/Pod effects. It does
not claim visual parity for the original's following announcement, artwork or
management screen. This scope also excludes adjacency rules, invalid/duplicate
names, exhausted movement, other terrain/factions/populations, raw economy,
turn income, AI and complete city-founding parity.

The optional `npm --prefix tools/wasm-tests run test:colony-found-menu` lane
uses installed assets and actual Chromium pointer/SDL input for both public
flows. It installs the same source declarations, prepares the held companions
through real H keys, and compares all twenty native/control checkpoints with
the unchanged gold. The fixture's old city is renamed before observation by
its production native Rename command, removing its temporary pool name from
the registry. Only that input city receives fixture citizen/store setup; the
tested city is created solely by the production founding transaction. Window
geometry supplies pointer estimates and actual native hover is required before
every click. This verifies real control delivery and native effects, not
independent glyph/color or post-confirm artwork equivalence.
