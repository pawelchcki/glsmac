# Terraform menu work controls

`ui.terraform_menu_work.v1` compares actual pointer commands for four work
identities: TERRAIN rows 0 (Farm), 2 (Mine), 4 (Forest), and 5 (Road).
The eight input traces use two public synthetic text profiles. The second
changes those four land names while retaining their indices, prerequisites,
action-text template and declared work rate of four. Each trace clicks MENU,
the Terraform header, its observed work row, then presses Tab.

The starting context is a healthy, unspent Former on flat arid nonbase land,
with a Scout at the city and Colony Pod on a separate nearby tile. The
original establishes this layout through actual movement and turn controls;
the candidate uses native entities in the declared equivalent relative
layout. Preparation reaches a ready Scout after the spread turn, then delivers
one actual Tab to select the Former before checkpoint zero. This selection
history is part of the fixture: the candidate delivers its mounted/native Tab
and lets the production controller retain the resulting navigation state.
`initial_base` describes the city before that preparation. Subsequent
checks guard each engine's actual post-preparation city and companions without
claiming original/candidate store-counter equivalence.

Every checkpoint reports actual selected role, Former order, movement spent
in thirds, work units, four native terrain flags, root-menu visibility and
open-child identity. Year delta must stay zero after preparation. Unit
identity, health and position, companion orders/movement, base identity,
population, Doctor job, project and stores remain guarded. No command effect
is supplied by the UI fixture or derived from the requested row.

Original recording uses a fingerprinted local executable, queued ordinary
Windows input, independent actual menu glyph/rectangle observation and
read-only native state. An optional private original-created save accelerates
fixture loading; its exact hash and native receipt are verified on each
fresh load. It supplies input state, never command outputs. Original binaries,
saves and screenshots remain local. Accepted evidence must come from
`compare.py record --repeat 2`, with identical complete outputs and metadata.

Candidate replay loads current production scripts into an isolated frozen
WASM engine, imports the same synthetic text, clicks mounted production
controls and settles their actual native event transport. Display nodes,
artwork, frontend notifications, timer delivery and the initial layout are
fixture boundaries. The replay uses no original assets or pixels. Browser
hit testing is a separate optional check.

This scope excludes replacement confirmations, later work ticks/completion,
technology availability, other terrain or unit types, general menu enabling,
shortcuts, pathfinding and AI. Existing work-timing/terrain and keyboard-control
contracts cover their own bounded behavior independently.

```sh
python3 tools/behavior-tests/ui/run.py --suite terraform-menu-work
```
