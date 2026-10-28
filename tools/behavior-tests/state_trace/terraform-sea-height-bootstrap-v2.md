# Installed-source Sea bootstrap accounting v2

Status: source-only revised prerequisite contract. **No v2 engine/browser run and
zero Sea height passes.** This does not change production, installed rules,
imported map, source price calculation, treasury, technology or stock recipe.
The existing operation remains `actual_native_choice.cost + 3`, restored with
last_processed_turn0 during queued startup. A new first capture requires source
review, a fresh coherent manifest and a separate Root grant.

## Preserved first attempt and invalid v1 assumptions

Executed source e85478e5f690372e71596c6e7799dc1fa22233cb/native115032ff/default25ef
is preserved in `/tmp/wasmsmac-terraform-sea-height-first`. Its immutable artifacts
remain `/tmp/terraform-sea-height-v6-first`: Node raw1 (session49447/chunk516970),
64.498242458s case, zero complete snapshots/height actions/passes, native exit
unknown. The received sealed prefix is60742 bytes/SHA
`12e9a482e8d7f048c1d82fa6b2195aa88110eaf7313083b965c71102ab6d80c0`;
raw/chunks match but the unsuccessful capture is explicitly partial. All owned
browser/server/driver processes were reaped. No retry was performed.

The actual raw witness shows a genuinely produced SeaFormer8 at8,8, owner0,
home1, population1, health1.0 and movement4.0. Native birth production already
contains4 overflow minerals. Receipt0_61 is one successful host/current-turn
`process_base_production`, with mineral input1. Receipts0_62…0_68 are seven actual
growth results;0_69 is normal `set_base_production`. The v1 observer rejected its
incorrect seven-production-ACK assumption, preventing `TH_READY` and all height
input. The subsequent driver readiness timeout was not a product height failure.

The earlier eight-row/cost80/stock83/income0/overflow3/seven-production-ACK
requirements are preserved as **invalid or unobserved v1 assumptions**, not
executed inputs or a passing result. Native price and prefill were not logged in
that attempt because `TH_SEA_SETUP` was behind readiness. The separate normal
Sea2/136 test used an authored Foil chassis cost4 profile; it is not evidence that
the installed cost2 profile has the same price. No stock was changed to recover
three overflow.

## Independent source derivation (predicted, not a new native observation)

The actual installed alphax source remains SHA
`bb01e3ac23793da0a46713f4851d65e63b599c24aef8300ffe45e7e57b332c42`.
The unchanged rate override only affects20 shared TERRAIN turns fields, both
land/sea, producing SHA7abf62aa…bd0. It does not alter component, mineral, faction
or project data.

- `unit_rules.gls.js:63–73` composes the installed fourth Foil chassis with the
  basic Formers weapon/Scout armor/Fission data, not the disabled predefined Sea
  Formers template. Installed component costs are chassis2, weapon6, armor1,
  reactor1; weapon mode9, movement4 and water triad remain source data.
- The current application consumer explicitly calls native base cost with
  pricing triad0 (`unit_rules.gls.js:85–89`). This is the existing application
  recipe, not an original naval price claim or a proposed production fix.
  `PrototypeCost.h:29–44` gives component cost `(2+1)*6=18`, interaction0, rows
  `max(2,(18+2)/4)=5` with native integer division.
- The actual Load Map path has rule-size kind0 regardless of its16×16 dimensions
  (`Settings.h:45–52`, frontend Game.cpp102). RULES data row6 is mineral factor10;
  Gaian INDUSTRY is0 from the admitted source parser/default. Thus
  `ProductionCost.h::HumanMineralFactor` gives8, and
  `FacilityDef.cpp:38–56` predicts5×8=**40 actual choice cost** for this profile.
  `production/Unit.cpp` delegates to that declared cost. Existing stock recipe
  therefore predicts **43**, not83. These numbers still require direct native
  getter/read-back evidence in v2; they were not observed in the first raw log.
- The port is an unimproved arid land base with one Doctor. `resources.gls.js:
  94–109` supplies minimum center2 nutrients/1 mineral/1 energy plus HQ energy.
  `bases.gls.js:236–269` adds the city center and no worked tiles, consumes
 2 nutrients per pop and0 minerals. Consequently pending minerals are
  `max(0,1-0)=1` (`bases.gls.js:30–33`), and nutrient balance2−2=0 does not trigger
  the starvation override. Ordinary production is43+1−40=**4 overflow**; native
  `Base.cpp::ProcessProduction` adds income then charges the real recipe cost.

The clock distinction is essential. `Game.cpp::FirstTurn:1428` advances the
current native turn to1 before queued world spawn/project events are applied and
before its queued `advance_turn` result0_60. The six ordinary spawn selections
call `Base.cpp::SelectProduction:194`, stamping `last_processed_turn=1`. They
correctly fail the shipped eligibility test `< current_turn` in bases.gls.js38.
Only the authored local restore retains last_processed_turn0, so it is eligible
for exactly one ordinary production event. Seven growth events are separately
queued for every real city. The test's later-start listener runs after the shipped
production listener and queues normal project resumption afterward. No fake
production result, manual extra tick or changed current turn is required.

## Required v2 observation and acceptance

The exact same production and stock operations stay in place. Test-only metadata
and assertions now establish their actual result:

1. After querying the actual native choice, log `TH_SEA_DECLARED` with its actual
   cost and requested cost+3 stock. After the unchanged restore API succeeds,
   **before strict price postconditions**, log `TH_SEA_ACCOUNTING`: actual native
   price, requested stock, actual `get_production()` read-back, actual recipe,
   population, owner/base and current turn. A later failure must not hide price
   evidence behind readiness. Assert predicted price40/prefill43/rows5 only after
   that witness; never manufacture the logged values from expected constants.
2. From the late turn listener, before production applies, log `TH_SEA_PRETURN`
   for all7 actual city IDs/owners/production states/intake/consumption. Require
   one local eligible last-turn0 sea project with43 stock and six already-current
   land projects with last-turn1/zero stock. No opponent city is omitted merely
   because it legitimately has no production ACK this turn.
3. Retain the existing read-only actual birth witness and require real home1/
   launch8,8/pop1/health/movement plus native empty completed project/4 overflow.
   Require one successful host/current-turn production ACK with mineral credit1,
   then seven real growth ACKs, then the one normal project-resumption ACK.
   Scalar receipts do not echo base/unit wrappers; no such IDs are fabricated.
4. Before readiness, read all7 real native cities again: unique owners0…6,
   population1, source land project, actual last-turn1, home stock4/other stock0.
   Only after these guards may the existing six-full-world/five-frame height
   input sequence begin. The read-only preturn/accounting records are not full
   gameplay checkpoint claims. Any unexpected native result stays strict red.

The driver also recognizes the already-existing fatal pattern during startup
readiness rather than waiting60 seconds after a logged setup error. This sends
no input, advances no game, changes no budget and does not turn failure green.
All source/native/runtime/map/rules hashes must be rebound in a fresh manifest.
The first failed raw, report, outcome, source snapshots and wrong preflight
requirements remain unchanged. Sea water→land/coastline effects, original prices,
animations, naval art/facing, numeric mesh/resident-Z and all other unsupported
capabilities remain outside passing totals.
