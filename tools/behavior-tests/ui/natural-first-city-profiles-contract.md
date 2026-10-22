# Archived faction and source-control startup replay

The immutable seven-case V6 faction archive and six-case V7 source-control
archive are replayable through `natural_first_city_profiles_headless.py`. This
adapter is separate from the six-difficulty Gaian validator. It accepts exactly
the archived Citizen, standard, actual40×80, uniform flat-arid startup inputs,
with paused turns and tutorials disabled. Inputs contain no population, city,
store, roster or starting-unit overrides. The source records are normalized
stock input bonus tokens; only the declared concrete TECH token changes for
`gaian-physics` or `univ-ecology`. University retains its numeric free-tech and
other bonus pairs in both profiles.

The candidate uses the production faction text parser and native faction
manager, maps source block IDs to their actual native faction IDs, initializes
the human through the shared State initializer and executes native configure,
create_world, InitComplete, FirstTurn and the settled host queue. The selected
concrete technology tokens are checked against the actual native human faction.
The first city, citizens, stores and selected project are read from native
objects after shipped production/growth events. No resource, growth or project
callback is replaced and no initial mineral credit is supplied.

V6 uses the archived `game.natural_first_city.v1` algorithm ID with its separate
seven-faction Citizen input bounds. Its full output is the six raw city fields,
human base count and year delta, with the existing strict integer/membership
validation. These comparisons remain pending. Initial native replay returned
seven mismatches, all confined to `base.raw_minerals`: candidate zero versus
original nine for Gaian and thirteen for the six other factions. No case is
promoted on partial agreement.

V7 uses `game.natural_first_city_source_controls.v1`. Its additional original
`map_kind` is a raw setup-size scalar; no equivalent native field has been
established. Every full strict V7 result therefore returns **unsupported**.
Four supported stock/TECH input profiles still execute production startup, and
their actual native city observations are retained only in the response's
`implementation.source_startup_diagnostics`. They are not projected comparison
cases and add no passing totals. Actual native map type and size provenance are
printed in diagnostic logs; neither is substituted for original `map_kind`.
The four native diagnostics completed with one specialist, zero worked tiles,
zero nutrients and zero minerals. Concrete Ecology selects the native Formers
project; Gaian Physic and stock University InfNet select the native Colony Pod.
These are candidate facts and do not resolve the pending original mineral field.

The Formers raw Cost4 and Cost8 controls do not execute candidate startup:
the production basic-unit parser explicitly requires zero in raw UNITS field5.
Their unsupported reasons retain both this parser limitation and the map-scalar
gap. No cost conversion or mineral formula is inferred from their observations.

Other faction mechanics remain unimplemented, even though the source fixture
retains their input tokens: numeric free-tech choices, faction facilities,
initial energy, population limits, other social ratings and miscellaneous
faction bonuses. The candidate comparisons observe the current implementation
with those gaps; they do not establish complete faction startup parity.
Rendering, original founding/research controls, AI, later turns, natural terrain,
exact altitude conversion and the map-import pricing context remain outside
scope. The existing native fixture keeps its default random map type and preset2;
neither is changed to fit the original observations.

```sh
WASM_HEADLESS_APP_DIR=/tmp/glsmac-natural-first-city-build-v2/bin \
NODE=/tmp/smac-wasm-emsdk/node/22.16.0_64bit/bin/node \
python3 tools/behavior-tests/ui/run.py --pending \
  --suite natural-first-city-factions-v6 \
  --suite natural-first-city-source-controls-v7
```

The strict command returns nonzero for pending mismatches or unsupported results.
Evidence integrity alone is not native agreement. Each native case runs in a
fresh worker and snapshot; runtime hashes are checked before/after the batch.
