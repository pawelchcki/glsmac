# Original displayed production stock versus raw field

`ui.initial_production_stock.v1` is a new optional asset-backed contract,
unregistered and outside passing release catalogs. It preserves all earlier raw
mineral and science records unchanged. The executable fingerprint and unchanged
stock source dataset are bound by the existing original driver.

The fixture is the same synthetic flat-arid40×80 Citizen/Gaian game with Blind
Research off, target5 selected, actual allocation50/0/50 and one held Scout.
No faction, citizen, unit or rule data is edited. The only replacement is the
existing synthetic map. Each recorded pass starts a fresh original process.

At native counters1 and6, the controller opens actual MENU → HQ → Base Operations
and reads the sole city's Production row. It then double-clicks that row to open
the actual base panel, reads its production/resource widgets, presses Escape to
return to Base Operations, and closes the report. Five real Turn Complete
advances connect the two checkpoints. If the original interrupts an advance
with a verified Communications Officer prompt, the fixture explicitly selects
No/close channel. The existing bounded resume policy permits one further Turn
Complete click only if that prompt returns to the actual paused prior-year map.
Unrelated dialogs fail closed; AI contact contents/counts are outside this
production projection. Raw city/project/unit context is read before
opening the report and after observing the actual base panel.

Outputs deliberately keep the observations separate:

| Projection | Actual measured fields |
| --- | --- |
| Native before/after context | Raw mineral field, current queue-head project ID, queue-size field, native turn, city population/jobs/food and actual owned-unit roster |
| Base Operations Production row | Rendered project name, literal numeric pair `(numerator/denominator)` and displayed turns |
| Actual base panel | Rendered project name, displayed turns, mineral intake/consumption/surplus numerals and16 declared production-grid palette samples |

The main base panel expresses accumulated production graphically in the observed
projection; no decimal accumulated-production label is claimed from that panel.
The independently observed decimal pair comes from Base Operations. Grid samples
are physical bright/dim palette counts at the documented fixed measurement
positions in the recorder, not numerals inferred from raw memory or a generic
production formula. The report's denominator is likewise retained as an actual
displayed number; it is not calculated from installed unit costs.

Project and report numerals use independent multi-scale OCR consensus without a
name dictionary or digit substitution. Native values are never supplied as OCR
answers. Raw/display values are not forced equal by the recorder. The native
current project ID is read independently from the queued project record. The
actual roster retains prototype/order/movement/damage fields; absolute map
coordinates and process identities are guards rather than comparison outputs.

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/ui/cases/initial-production-stock.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/ui/production_stock_original.py --assets /var/home/pawel/reimplementation/smac-wasm/smac-assets --wine /tmp/glsmac-controls-research/wine-11.20-amd64-wow64/bin/wine --artifacts /tmp/research-production-stock-recording-v2' \
  --output tools/behavior-tests/ui/observations/initial-production-stock.json \
  --repeat 2 --timeout 600
```

This contract does not infer an unconditional nine-mineral startup rule. Other
factions, difficulties, terrain, source data, projects, initial bonuses and
production-completion paths remain unverified. It does not explain why this
fixture starts with its recorded raw field, establish all possible counter
semantics, or claim candidate natural startup already agrees. Acquisition and
general science timing remain outside scope.

## Repeated observations and bounded interpretation

Both independent complete original runs agree:

| Native counter | Raw field before/after endpoint panel opening | Displayed Base Operations row | Actual base panel grid samples | Mineral income row |
| ---: | ---: | --- | --- | --- |
| 1 | 9 / 9 | Formers, `(9/16)`, turns7 | 9 bright, 7 dim | intake1, consumption0, surplus+1 |
| 6 | 14 / 14 | Formers, `(14/16)`, turns2 | 14 bright, 2 dim | intake1, consumption0, surplus+1 |

The independently read current project ID is1 at both checkpoints, with raw
queue-size field0. The actual owned roster is one prototype2 unit, order code2
(Hold), zero spent movement and zero damage throughout. The city stays size1,
one Doctor, no Workers, no worked tiles and zero stored nutrients. Actual
allocation remains the declared economy50% / psych0% / labs50% fixture.

These witnesses corroborate the raw9→14 field as displayed production progress
in this specific Formers context; they do not support correcting the earlier
raw records to zero or renaming the field to resolve the candidate discrepancy.
The normal base panel itself remains graphical, while the explicit decimal
progress/requirement pair is read from Base Operations. The displayed requirement
component is16 and was not inferred from memory or a price calculation.

The `before` reading is before each endpoint report/panel sequence. Setup has
already opened the allocation panel once, exactly as in the earlier science
fixture. No claim is made about the effect of the very first base-window opening
in another setup route. No cause of the initial nine is established and no
unconditional startup-mineral rule is inferred. A candidate starting this same
comparison at raw0 still has an explicit state mismatch; the reference must not
be altered to hide it.
