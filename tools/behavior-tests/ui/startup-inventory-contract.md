# `game.startup_inventory.v1`

Two inputs choose explicit Gaian and Consciousness factions through Start Game,
random Tiny map, Citizen and standard rules. Each fresh original game founds its
first base, accepts the displayed research defaults, opens Social Engineering
as an initialized checkpoint, closes its tutorial, and opens the Military
Command Nexus through the world menu. No movement, combat or turn advance occurs.

Outputs are actual unit names and separate Active, Prod and Lost counts at
MY2101. The observer discovers occupied name bands on the first report page,
locates the bright green Active and red Lost columns, then isolates Prod between
them. Three image preparations require two agreeing OCR readings. Unit names
have no expected-name dictionary; decimal counts have no glyph substitutions.
The report caption and actual year are required. Missing, ambiguous or
overflowing visible rows fail. Only the first page (at most eight rows) is in
scope; this is not a general inventory or paging contract.

The two original cases were recorded through `compare.py record`, with fresh
games and two complete identical runs. Failed navigation/font calibration
attempts produced no reference evidence. Original assets and screenshots stay
private. The reference file is immutable.

Candidate replay executes the shipped unit definitions, world-start callback
and event handlers over native unit/base/player managers. A 4x4 land map,
coordinate draws, one synthetic selected-faction boundary, facility artwork,
frontend delivery and base-initialization callbacks are controlled. Native live
units and actual native project state supply the result. Lost is zero because
this fresh fixture has no casualties. Conventional faction/technology startup
handoff still needs implementation; the current synthetic faction cannot prove
it. Original map generation, terrain placement, morale, detailed unit stats,
combat and governor/research decisions are outside this inventory contract.

Initial strict replay: **0 matched, 2 mismatched, 0 unsupported, 0 errors**.
GLSMAC has an active Colony Pod and Mind Worms, with no queued unit; the original
has an active Scout Patrol and one queued Former (Gaians) or Colony Pod
(Consciousness). This remains in the pending catalog and is excluded from
passing totals. Run the strict red comparison with:

```sh
python3 tools/behavior-tests/ui/run.py --pending --suite startup-inventory
```

Do not promote it by changing only display names: actual conventional unit
definitions, construction and faction/technology startup must support the
result, with native and real browser validation.
