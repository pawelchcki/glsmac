# Base and forest road networks

`game.road_network.v1` compares a healthy ordinary Former on flat arid land,
without fungus, enemies or ZOC. Each original process starts Gaians, Citizen,
standard rules and a synthetic 40×80 map. A declared `UNIT,1` faction bonus
supplies the Former; the sole Scout holds. Installed movement and work rates
are unchanged. Only synthetic map/faction input files are changed, and all
movement and preparation use real controls. Native observations are read-only
and reject an unrecognized executable fingerprint or a disturbed fixture.

The `base-road` profile initially has no improvements. A real eastward move,
turn, Road command and turn leave the Former on the road beside its actual
base, ready at MY2103. The trace moves west into the base, east, west, advances
once and moves east. The `forest-roads` profile supplies roads and forest on
every tile. A real eastward move and turn prepare the non-base start at MY2102;
the trace moves east, west and east between two non-base forest roads. It ends
before another turn could produce a third unit and invalidate the fixture.

Input is exactly `profile` and `actions`, bounded to eight moves and two turn
advances. Output is exactly `trace`, with the initial state and every action:

- `year_delta`: integer native turn difference from the recording start.
- `position`: signed same-row tile displacement, normalized across the round
  map; two original horizontal coordinate units equal one tile step.
- `movement_spent`: integer thirds of an ordinary movement point.
- `terrain`: live current-tile Boolean `base`, `road`, `forest` and integer
  `moisture`, `rockiness` (1–3).

The candidate executes the production movement handler, native unit moves,
base identity and turn callbacks. Its controlled four-wide native corridor has
two alternating squares; E/W facing and larger-map pathfinding are outside
this contract. Only equivalent initial terrain, source declarations, animation
and turn acknowledgements, and omitted display/audio are fixture boundaries.
Neither adapter receives expected observations or supplies movement effects.

Two whole independent original runs are required to freeze evidence. The base
trace observes movement spent 0, 1, 2, 3, 0, 1 while its explicit road flag stays
false. Forest roads observe 0, 1, 2, 3. The base therefore connects to an adjacent
road without requiring a road improvement. The forest trace is a held-out
existing-behavior check, not a previously missing rule.

Moisture and rockiness variation remain unobserved. The original changed a
supplied moist profile during startup, so that attempted fixture is excluded.
This contract also excludes other unit domains, abilities, damaged units,
hostile bases, changed rates, fungus, rivers and random insufficient-cost moves.
Application guards and rollback tests are separate from original evidence.
The historical movement handler passed the forest trace but failed the base trace
with an exhausted-unit error; the production fix admits a live base at either
endpoint while retaining the required road on the non-base square.

```sh
python3 tools/behavior-tests/ui/run.py --suite road-network
SMAC_ASSETS_DIR=/path/to/game npm --prefix tools/wasm-tests run test:former-work
```
