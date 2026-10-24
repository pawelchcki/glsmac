# First-city production: source controls and observation phases

`ui.initial_production_controls.v2` is optional original asset-backed evidence,
pending and outside passing catalogs. The core and source suites each contain four
cases. Fresh original execution is repeated twice per complete case. Earlier
production-stock, startup and science records remain unchanged.

Each fixture loads the same synthetic flat-arid 40×80 map through actual Load Map
File, selects the declared stock faction and difficulty, disables Blind Research,
accepts normal first-city naming, selects directed target 5, and holds ready owned
units. The research action uses the previously recorded first-card control; this
production projection does not independently record a research goal or establish
variant chooser eligibility. No turn is advanced. Native physical dimensions 40×80, raw map_kind 0 and
counter 1 are checked. The original executable is fingerprint-guarded. Only the
declared private-copy source fields and synthetic map are changed; city resources,
population, unit roster and native production fields are never written.

## Input schema and source controls

All source files are consumed losslessly as Latin-1 bytes. Comments, unrelated
rows/fields and unrelated faction bonus pairs are preserved. Source identity and
hashes bind each profile to the installed dataset; source table bodies are not
included here. Faction selections use actual roster controls: Gaians slot 0,
Hive slot 1. Native owner IDs are separately read. Citizen and Talent are actual
setup labels, with native ordinal guards 0 and 2 respectively.

| Profile | Source identity and controlled input |
| --- | --- |
| stock Gaians/Citizen | Installed text unchanged |
| stock Hive/Citizen | Installed text unchanged, actual Hive selection |
| stock Gaians/Talent | Installed text unchanged, actual Talent selection |
| gaian-physics | Gaians faction bonus record: replace the single concrete TECH value Ecology with Physic; other pairs unchanged |
| gaian-formers-cost-4 | alphax.txt #UNITS, unique Formers declaration, zero-based comma field 5: stock integer 0 replaced by 4 |
| gaian-formers-cost-8 | Same source field: stock 0 replaced by 8 |
| gaian-mineral-rule-12 | alphax.txt #RULES, zero-based noncomment data row 6, first comma field: stock 10 replaced by 12 |
| gaian-industry-minus-1 | Gaians faction bonus record: append SOCIAL with signed value -INDUSTRY; stock has no INDUSTRY pair; other pairs unchanged |

Faction bonus records follow the faction block's name record and contain comma
key/value pairs. SOCIAL signed tokens encode the sign/count explicitly; this
control uses one minus sign, not a negative numeric field. The TECH control swaps
a concrete token, without adding an extra TECH grant. The unit source has ten
comma fields in the controlled declaration. Source field 5 values 0, 4 and 8 are
raw declaration integers, not displayed mineral requirements. This evidence does
not supply the automatic-zero/component-cost algorithm or a general conversion
for positive source costs. Required production is read only from the actual UI.
The mineral rule integer and signed Social value remain separate inputs.

## Independently repeated actual results

Both four-case suites completed two independent original runs with exact strict
agreement: eight cases and 40 native phase observations. The following numbers
are literal actual/native measurements, not calculated requirements.

| Controlled profile | Native project ID / actual label | Native stock before any panel | Actual Operations pair | Actual turns | Native/actual Industry | Native mineral rule |
| --- | --- | ---: | --- | ---: | ---: | ---: |
| gaians-citizen-stock | 1 / FORMERS | 9 | 9/16 | 7 | 0 | 10 |
| hive-citizen-stock | 0 / COLONY POD | 13 | 13/24 | 11 | 1 | 10 |
| gaians-talent-stock | 1 / FORMERS | 9 | 9/16 | 7 | 0 | 10 |
| gaians-citizen-gaian-physics | 0 / COLONY POD | 13 | 13/24 | 11 | 0 | 10 |
| gaians-citizen-gaian-formers-cost-4 | 1 / FORMERS | 17 | 17/32 | 15 | 0 | 10 |
| gaians-citizen-gaian-formers-cost-8 | 1 / FORMERS | 33 | 33/64 | 31 | 0 | 10 |
| gaians-citizen-gaian-mineral-rule-12 | 1 / FORMERS | 10 | 10/18 | 8 | 0 | 12 |
| gaians-citizen-gaian-industry-minus-1 | 1 / FORMERS | 9 | 9/18 | 9 | -1 | 10 |

In every case the raw mineral field, current project, queue-size field, Industry,
mineral-rule field, ownership and city values remain unchanged across the five
native observations. The actual pair numerator agrees with the independently read
raw stock in these cases; the recorder did not force equality. Operations and the
base panel agree on actual project name and turns. Native queue-size field is 0
throughout; no general queue semantics are inferred.

All actual panels display mineral intake 1, consumption 0, surplus 1, allocation
50/0/50 percent and Labs total 1. All native city contexts have population 1,
Doctor 1, workers 0, worked tiles 0 and stored nutrients 0. Initial owned units
have no spent movement or damage; their actual orders change only after the
explicit hold controls. Complete rosters are in the companion per-run archives.
The signed Industry source control is independently displayed as -1 in the actual
Social Engineering row. The Hive row independently displays +1. The measured
Industry fields do not establish a general production-pricing input mapping.

These points distinguish project/source/rule-dependent initial observations from
an unconditional nine-mineral rule. The negative Industry control preserves raw
stock 9 while its actual requirement is 18; no cause or formula is inferred.

## Observation phases and units

The strict output preserves five native observations:

1. `first_city_before_panels`: after actual first-city naming and closing the Tour
   overlay, before opening any base or report, research chooser or preferences.
2. `ready_before_panels`: after actual directed selection, pause/tutorial
   preferences and H actions to hold ready owned units; still before any base or
   report opening. No Return is sent to open a base during setup.
3. `after_operations`: after actual MENU → HQ → Base Operations is rendered and
   independently read, before opening the base panel.
4. `after_panel`: while the actual base panel is open and its resource labels have
   been independently read.
5. `after_social`: after returning through Base Operations to the map and opening
   actual Social Engineering with E, where the actual Industry row is read.

Each native phase stores the counter, actual owner/difficulty, raw map_kind,
direct map scalar, neutral raw mineral field, queue-head project ID, raw queue-size
field, signed Industry field, mineral-rule integer, ownership IDs, population,
workers/Doctors, worked-tile count and stored nutrients. The Industry field uses
the independently established Social Engineering native-field contract and is
cross-checked against the displayed Industry row at the final phase. No general
pricing role or phase mechanism is inferred from that field name.

`operations` stores the actual rendered production name, literal decimal pair
`[numerator, denominator]`, and displayed turns. Both the numerator and denominator
are OCR readings of the full original report row. Native stock is not supplied as
an OCR answer, and no equality is forced between the raw and visible values.
`panel` independently stores the actual project name, turns, mineral intake,
consumption and surplus, actual economy/psych/Labs allocation percentages and
actual base Labs total. The allocation is read only during this first actual base
opening. No earlier allocation reading is claimed. Variable-size production-grid
samples are outside this projection. Actual project names from the two panels
must agree independently; no project-name dictionary supplies an answer.

The native unit roster is read at every phase, with actual prototype, order,
spent movement and damage. Complete per-run outputs including every roster are
retained in the companion context archives. Roster context is excluded from the
strict v2 production projection because the earlier full-context Talent fixtures
had two owned units in one independent run and one in the other. The strict
projection does not synthesize a roster or claim roster determinism. Attached
complete contexts preserve the measured roster/population/allocation alongside
all literal production values.

## Tooling attempts and boundaries

Initial attempts are retained privately under
`/tmp/research-production-controls-core-recording-v1`,
`/tmp/research-production-controls-core-recording-v2`,
`/tmp/research-production-controls-source-recording-v1`,
`/tmp/research-production-controls-source-recording-v2`, and
`/tmp/research-production-controls-source-recording-v3`.
The inherited Operations numeric ROI clipped the leading digit in two-digit
numerators; its single project color did not read Colony Pod. No such OCR output
is promoted. The corrected observer reads the full numeric region, both measured
project text palettes and independent multi-scale consensus; it checks project
names against the actual base panel. It was validated on retained original
screens before fresh execution. No character/name substitutions supply answers.
The interrupted attempts and their observer snapshots remain retained; old
accepted records are unchanged. A separate source-only adapter handles the
mineral-rule report turns glyph using strict independent bilinear OCR scales;
the accepted core observer is not edited. No failed OCR output is promoted.

Completed new artifacts use
`/tmp/research-production-controls-core-recording-v3` and
`/tmp/research-production-controls-source-recording-v4`.
They are separate complete repeated original runs with a frozen observer.

No unconditional startup stock, project-cost conversion, Industry/mineral-rule
formula, unit-cost algorithm, panel-induced credit mechanism, later production
or technology acquisition is established by this contract. The observations
apply only to the declared setup route, input profiles and paused counter.

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/ui/cases/initial-production-controls-core.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/ui/production_controls_original.py --assets /var/home/pawel/reimplementation/smac-wasm/smac-assets --wine /tmp/glsmac-controls-research/wine-11.20-amd64-wow64/bin/wine --artifacts /tmp/research-production-controls-core-recording-v3' \
  --output tools/behavior-tests/ui/observations/initial-production-controls-core.json \
  --repeat 2 --jobs 2 --timeout 600
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/ui/cases/initial-production-controls-source.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/ui/production_controls_source_original.py --assets /var/home/pawel/reimplementation/smac-wasm/smac-assets --wine /tmp/glsmac-controls-research/wine-11.20-amd64-wow64/bin/wine --artifacts /tmp/research-production-controls-source-recording-v4' \
  --output tools/behavior-tests/ui/observations/initial-production-controls-source.json \
  --repeat 2 --jobs 2 --timeout 600
```
