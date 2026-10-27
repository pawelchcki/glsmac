# Exhaustive Former controls and terrain trace inventory

Baseline: `048596fe96e829c92d7b5304994e4e1545ccc8ae` (fresh isolated
`feature/terraform-all-ui`). Installed source declarations are inputs, not proof
of original execution, work rates or key delivery. The clean reference inventory
is `ui/terraforming-all/action-matrix-source-v1.json` in the reference track;
accepted repeated observations will bind exact versions independently.

`game/terraforming_actions.gls.js` is the shared source identity vocabulary.
There are 19 non-Disable land variants and seven non-Disable sea variants. Source
row 19 is explicitly editor-only and disabled in both domains; ignoring
technology prerequisites does not authorize that editor command.

| TERRAIN row | Action ID | Land variant | Sea variant | Existing control/effect |
|---|---|---|---|---|
| 0 | farm | Farm | Kelp Farm | Land button/F/menu/work |
| 1 | soil_enricher | Soil Enricher | Disabled | None; Former menu omits row |
| 2 | mine | Mine | Mining Platform | Land button/M/menu/work |
| 3 | solar | Solar Collector | Tidal Harness | Menu presentation only |
| 4 | forest | Forest | Disabled | Land button/Shift+F/menu/work |
| 5 | road | Road | Disabled | Land button/R/menu/work |
| 6 | mag_tube | Mag Tube | Disabled | None; Former menu omits row |
| 7 | bunker | Bunker | Disabled | Menu presentation only |
| 8 | airbase | Airbase | Disabled | Menu presentation only |
| 9 | sensor | Sensor Array | Disabled | Menu presentation only |
| 10 | remove_fungus | Fungus removal | Sea Fungus removal | Menu presentation only |
| 11 | plant_fungus | Fungus planting | Sea Fungus planting | Menu presentation only |
| 12 | condenser | Condenser | Disabled | Menu presentation only |
| 13 | mirror | Echelon Mirror | Disabled | Menu presentation only |
| 14 | borehole | Thermal Borehole | Disabled | Menu presentation only |
| 15 | aquifer | Aquifer | Disabled | Menu presentation only |
| 16 | raise | Raise Land | Raise Sea Floor | Menu only; bracket code absent |
| 17 | lower | Lower Land | Lower Sea Floor | Menu only; bracket code absent |
| 18 | level | Level Terrain | Disabled | Menu only; minus code absent |
| 19 | monolith | Editor-only Disable | Editor-only Disable | Excluded from Former work |

The ten additional normal Terraform commands are separate, currently inert
menu.txt source identities: `0 farm_solar_road`, `1 farm_mine_road`, `2 road_to`,
`3 tube_to`, `4 auto_roads`, `5 auto_tubes`, `6 auto_sensors`,
`7 auto_remove_fungus`, `8 auto_home_base`, `9 auto_former`. Completion requires
real composite/target/automation behavior through shared authoritative work,
not assigning primitive outcomes in the UI. Sea Former access is also required.

At the baseline the native input table has no period, left/right bracket or minus
scan codes. Generic key export is a prerequisite; source hints `]]`, `[[` and
`_` do not by themselves establish the actual original control mapping. F and R
also have context-sensitive source collisions. New bindings wait for accepted
control observations rather than rewriting hints into guessed behavior.

Terrain trace points must cover before/order/progress/completion/cancel and
consequential traversal. Each checkpoint retains all seven players, units,
bases/citizens/resources/research plus actual UI lifecycle, selected unit,
mounted controls, active work/action, work counters and pending command state.
Observed coverage and unsupported domains are explicit and separate.

| Domain | Baseline capability | Required observation |
|---|---|---|
| Coordinates/world | Actual native tile x/y, map dimensions and neighbors | Every tile, wrap edges and changed-tile set |
| Height | Center native elevation only | Detached center/corners, imported elevation provenance and units |
| Type | Land/sea, moisture, rockiness, features/bonuses | Raw native words plus every decoded improvement/feature, native height bands |
| Resources | Native per-owner tile resource query | Actual values for all seven owners before/during/after |
| Passability | Actual movement validation | Per-unit actual validation/reason, direction and native endpoints |
| Traverse speed | No independent observation; production treats every unit as native | Shared production cost evaluation plus actual movement before/after/debit/result for Former/native/conventional units |
| Work | Four actions, single healthy ordinary land Former | All playable land/sea variants and command modes, lifecycle/turn/authority |
| UI | Four tiny buttons, four shortcuts, nineteen presented primitive rows | Complete source-driven access, no four-action whitelist, real punctuation delivery and live refresh |

Core owns the readonly native `get_terrain_state(x,y)` export and native terrain
mutators. UI/trace owns the versioned GSE/Python observation and production
movement evaluation path. The raw original imported height byte is not retained
by the current engine: imported center elevation is in engine units and must
never be relabeled as that byte or supplied from expected/input answers.
Original raw-height scale, timing, audio and unrecorded outcomes remain gaps
until an accepted observation establishes them. Full fidelity is not implied by
passing the existing eight bounded Former work records.

## Native observation foundation

The shared native foundation at C++ source `ffa9d296` was tested separately:
68 scenarios/213 assertions plus 14 compatibility suites/203 scenarios/880
assertions. Strict Float transport passed eight actual native binary32 samples
against their independently exported bit representations. Runtime v2 and those
results do not establish completion of the newly inventoried actions.

`terrain_capture.py` executes `_terrain_observation_candidate.gls.js` against a
pinned runtime and scripts snapshot. It validates ten ordered checkpoints:
initial plus before/during/after an actual Former, native unit and conventional
unit movement command. It records every tile, all seven participants, all
native units and bases, detached resource/citizen/work state, actual movement
credit/debit/position and separate pure cost/passability quotes. The producer
asserts equality of native full-state and RNG/bookkeeping snapshots around each
observer read. It finishes actual pending native moves through their existing
animation acknowledgement boundary; animation timing remains unsupported.

The public candidate observation is version 2. Transport uses per-tile and
per-entity chunks with unique IDs, exact begin/end count manifests and strict
complete reassembly. The native exact JSON serializer is required: actual v2
monolithic encoding exhausted the 2 GB heap during the first checkpoint; v3
bounded GSE encoding completed the first checkpoint and exhausted the heap in
the second. Both incomplete executions remain failures, outside passing totals.
Native serialization avoids an interpreted allocation for each scalar. Its
independent reader checks raw f32 bits, signed zero, all ASCII control bytes,
UTF-8 scalar values and full signed 64-bit integer bounds; malformed inputs,
cycles, unsupported native wrappers and nonfinite values fail explicitly.

```sh
python3 tools/behavior-tests/state_trace/terrain_capture.py \
  --runtime /path/to/GLSMAC.js --report /tmp/native-terrain.json
```

`--log` validates an existing captured log and explicitly does not execute the
candidate. The report always retains zero original matches and an incomplete
full-action inventory. Its unsupported list includes UI/media and original
height representation; absent runtime canonical-height and energy-initialized
capabilities are explicit. Passing a declared schema packet in Python is a
transport integrity check, never native execution evidence.

Height is in engine elevation units. The optional native canonical override
contains `{active,elevation,is_water}`; inactive values must be null. When
active, `elevation.center` is the actual canonical gameplay height while the
four corner fields remain actual render geometry. Rockiness is the native enum
0 none, 1 flat, 2 rolling, 3 rocky. Original raw rockiness is a separate
representation: the accepted original Level raw 2→1 corresponds to the importer
mapping native 3→2. No direct raw-byte alias, general height conversion or
general Level outcome is asserted by the observation schema.

Optional improvement construction owners retain every actual native slot or
unknown marker; they are application metadata, not original territory claims.
Automation getter version 1 records eleven fields. Version 2 adds the actual
home-rendezvous/scan phase as a twelfth field. A v3 runtime cannot establish that
phase capability: the observer reports it absent instead of supplying a zero.
Movement quote policy version 2 adds the actual free-step flag. Its zero-cost
quotes retain a finite/null speed representation and remain separate from
actual command debit and remaining credits.

The repeated rate1 Raise contract establishes one quoted fee and one original
outcome under its declared input. It does not establish a universal fee or
height formula. The height dialog wording consumer reads installed
`TERRACOSTUP`, `TERRACOSTDOWN` and `TERRAPAY`, retaining raw source templates and
substituting only actual quoted integer fee/reserves. Unknown directives and
formatting fail closed. Exact font/emphasis geometry remains unsupported.
