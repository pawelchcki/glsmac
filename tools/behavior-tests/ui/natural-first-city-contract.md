# Natural first city: pending transfer

`game.natural_first_city.v1` observes the first naturally initialized human city
in six declared Gaian/standard setups: Citizen, Specialist, Talent, Librarian,
Thinker and Transcend. Each case was independently repeated twice using
unchanged stock text, uniform flat arid land on actual native grid
40×80, no bonuses, rivers, fungus, landmarks, improvements or existing bases,
paused turns and disabled tutorials. No citizen, store, starting-unit or roster
state is supplied. The exact accepted cases and evidence bytes are preserved;
original observation SHA-256 is
`bacee299f955022230ce4fc7636e69e7234b75976ed3f357e79c5fc0232c01dd`.
The Citizen input fingerprint and observed output are unchanged from the earlier
accepted single-case contract. The matching recorder and provenance are retained
with the [V5 archive README](reference-archives/natural-first-city-v5/README.md).

| Actual city field | Original at all six difficulties | Citizen pre-fix baseline | All six after growth fix |
| --- | ---: | ---: | ---: |
| Population | 1 | 1 | 1 |
| Workers | 0 | 1 | 0 |
| Specialists | 1 | 0 | 1 |
| Worked tiles | 0 | 1 | 0 |
| Raw nutrient field / candidate nutrient store | 0 | 0 | 0 |
| Raw mineral field / candidate mineral store | 9 | 0 | 0 |
| Human base count | 1 | 1 | 1 |
| Year delta from first playable epoch | 0 | 0 | 0 |

This is **strict pending**, outside passing original comparison totals. The
Citizen case initially mismatched in four fields. After the bounded growth fix,
all six native comparisons differ only in raw minerals, with zero unsupported
results or errors. No partial case is promoted. Raw original field names do not establish general resource or income semantics.
Neither a global Doctor rule nor an unconditional nine-mineral credit is
justified as a general startup rule by these six Gaian flat-arid inputs. The
intended moist/rainy original captures failed
their actual-terrain guards and provide no accepted broader controls.

The display-free fixture starts with no players, bases, units, citizens or
stores, then uses the shared `State::AddSinglePlayerSlot` initializer. Native
terrain inputs specify arid moisture1, flat rockiness1 and uniform lowland
height200; exact altitude and contour conversion are outside the contract.
The binding also accepts declared moist/rainy terrain for future application
experiments, but the v1 comparison schema rejects those unrecorded cases.

The native natural fixture passes each declared difficulty through the actual
Rules map into GlobalSettings before the shared State initializer constructs its
human Player. Read-only assertions check both native State and Player fields.
The ownership fixture retains its one-argument Citizen default.

The existing shared fixture initializer supplies the native default `MT_RANDOM`
map type and selects preset2 alongside the actual40×80 grid. The original
LOAD MAP FILE route may retain a different map/size-kind pricing context; this
equivalence is unverified. The input's standard rules do not resolve map
provenance. Candidate project costs in diagnostics are native facts, not an
original pricing agreement. No fixture or core context change is made here.

The production startup call graph reused is:

1. Native `configure` invokes all shipped mechanical startup modules in their
   normal order: bases, unit turns, terraforming/movement parsers and handlers,
   resources, unit definitions, then the `world/default` generator callback.
2. Native `create_world` queues the real production choices, base and unit
   events. No returned player list or expected ownership count is substituted.
3. Actual `Game::InitComplete` emits `start`, installs growth callbacks and
   enters the running state.
4. Actual `Game::FirstTurn` establishes playable turn1 and queues `advance_turn`.
   The native host queue runs the shipped production/growth events and their
   population child events before the observer reads actual native state.

`year_delta` reads the settled native current turn and subtracts the native
first-playable epoch1 established by `Game::FirstTurn`. A regression requires
exactly one turn notification at turn1, then verifies another drain and rejected
repeated startup cannot advance the turn or add another citizen.

Synthetic equivalent input records supply the consumed stock faction, unit,
resource and terraforming declarations. Their parsers and mechanical handlers
are real. The fixture constructor bypasses graphics/frontend and pre-world
lifecycle; it supplies the declared map instead of generating terrain. Faction
colors/base names and unused artwork/audio animation definitions are omitted or
supplied. Opening/naming the first city, research UI acceptance, rendering and
original founding controls are outside this observer. No callbacks calculating
yields, growth, production, workability or population are replaced.

Source diagnosis explains the preserved pre-fix candidate baseline without inferring an
original algorithm. `bases.gls.js` always grows a size-zero base, scores eligible
vacant squares as `N*3 + M*2 + E` and chooses a best square even when its score is
zero. Uniform flat arid neighbors yield zero under the current resource rules,
so an eligible square creates a Worker. Final read-only diagnostics confirm
center yields2/1/2 (nutrients/minerals/energy, including Headquarters), all twenty
neighbor yields0/0/0, intake2/1/2 and consumption2/0/0. Growth initially credits
the center nutrients, then the shipped population event resets them against
the growth threshold and clamps the store to zero. The initial Formers project is selected
by `world/default` and `event/spawn_base`; native `Base::SelectProduction` stamps
turn1 as already processed with the initial zero mineral store. Its native
Citizen cost is20. First-turn
production therefore adds no credit. The mineral behavior remains unchanged. Automatic growth now requires a
positive score from its best legal tile before assigning a Worker; otherwise it
uses the existing Doctor event. The shared selector, manual citizen controls,
Colony founding and starvation paths retain their behavior. Accepted original
evidence covers the flat-arid zero-yield context only; separate positive nutrient,
mineral-only and energy-only cases are application regressions. Full original
comparison remains strict pending until every observed field agrees.

```sh
WASM_HEADLESS_APP_DIR=/tmp/glsmac-natural-first-city-build-v2/bin \
NODE=/tmp/smac-wasm-emsdk/node/22.16.0_64bit/bin/node \
python3 tools/behavior-tests/ui/run.py --pending --suite natural-first-city
```

The separate HOT `natural-first-city-lifecycle` regression covers native phase
order, declared terrain, actual first-turn population events, owner identity,
nutrient initialization, rejected inputs, repeated-start protection and all six
native State/Player difficulty initializations. Its
seven scenarios/45 assertions are application invariants, not additional original
cases. The nine-scenario/61-assertion growth-worker suite also preserves positive
nutrient, mineral-only and energy-only Workers, excludes claimed/base squares
and confirms the shared selector still returns legal zero-yield terrain.

One initial V2 focused lifecycle worker timed out after120seconds. Both the
read-only diagnostic replay and a subsequent exact unmarked replay passed; the
strict timeout report is retained and its cause is unestablished. The subsequent
complete native run passed all113suites,1,419scenarios and10,011assertions,
including another unmarked seven-scenario lifecycle replay.

The separate [faction/source-profile adapter](natural-first-city-profiles-contract.md)
replays the seven frozen V6 stock-faction setups and retains V7 source-startup
diagnostics. It does not widen this six-difficulty Gaian validator or settle the
pending mineral field. The strict pending inventory now includes those thirteen
inputs separately; none is promoted into passing totals.
