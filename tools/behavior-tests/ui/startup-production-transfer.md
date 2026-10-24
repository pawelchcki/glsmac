# Bounded first-city production transfer

The candidate uses the eight unchanged original v2 source-control records in
`initial-production-controls-contract.md`. Full v2 UI agreement is pending:
Operations, allocation, and Social Engineering controls are not executed by the
native projection runner and are not included in passing UI totals.

The projection executes the production faction/component parsers, native
single-player initialization (one human and six computer participants), world
creation, authoritative spawn events and the actual first production/growth
tick on a declared 40×80 flat-arid loaded map. It reads the human city's native
project name, stored minerals, current recipe price, turn, population, Workers,
Doctors, worked tiles, nutrient store, mineral intake and consumption. Each
comparison uses the unchanged original first pre-panel native phase, original
literal Operations denominator and actual panel mineral intake/consumption.
This explicitly crosses a declared original-display/candidate-native price
boundary; it is not a rendered widget or complete v2 phase comparison.

Equivalent synthetic source records supply only inputs. The source changes are
the declared TECH swap, positive Former declaration costs, mineral rule and
signed INDUSTRY pair. The fixture never writes city population, resources,
project or income. Graphics, assets, placement RNG and frontend delivery remain
controlled or unobserved boundaries. Native candidate city IDs are not compared
with original allocation IDs.

The implementation model grants half the nominal pre-INDUSTRY project price at
creation; the ordinary first production tick adds actual income. It consumes
declared prototype rows, the installed mineral rule and the separate Load Map
pricing input zero. This is a candidate model tested by the eight profiles,
not an established general original startup formula. Positive cost inputs beyond
the observed 4 and 8 retain ordinary declarative application behavior without
an original-agreement claim. The new creation plan requires the pre-first-tick epoch, the offline
seven-player single-player roster, its human owner, Load Map, an available land-unit
recipe and no existing owned city.
The native counter may already reserve turn one while startup spawn events are
queued; the guard closes when `AdvanceTurn` actually starts that turn. The normal
receiving-world path calls the same `AdvanceTurn` for a saved positive turn,
closing the guard on resume. `ResetGame` reopens it for a fresh world.
The shipped caller uses it only for Load Map startup. Computer initialization,
generated-map startup, later founding and active production selections retain
their existing processing epochs.

The five `startup_production*.gls.js` application suites separately guard creation versus settled income,
once-per-turn processing, computer exclusion, unobserved generated-map behavior,
later founding, reselection and invalid-plan atomicity. These are application
regressions. The preexisting nutrient/mineral factor regressions now distinguish
Load Map's independently established input zero from unknown/planet contexts;
generated-preset provenance still clears when loading a map. The application
suites use compact 32×16 worlds, retire each native world explicitly, and split
the same fifteen scenarios/171 assertions across fresh workers to retain the
normal 30-second limit. The strict eight-profile replay keeps its unchanged
40×80 inputs. The receiving boundary case uses valid configured native managers
and the production positive-turn entry point; it does not emulate complete
network deserialization or save/load UI.

Two additional application-only controls declare one Former row and mineral rules
2 and 1. Both have a legitimate zero creation bonus; their native prices are one
and zero. Ineligible startup contexts return `Undefined`, while an eligible zero
uses an initial plan and receives the first actual mineral. The existing ordering
processes production before initializing the first citizen, so completion waits
until actual turn two. The tests observe unchanged income and native completion
with exact overflow then. These are application lifecycle checks, not new
original-executable observations or a change to zero-population completion policy.

The untouched PR27 source consumer rejects the positive cost declarations 4 and
8. Its raw red report is preserved separately. To isolate this production source
consumer repair from startup credit and loaded-map pricing, explicitly overlay
the identical current `unit_rules.gls.js` on both sides. Its hash appears in each
report. The immutable baseline engine and world-startup scripts otherwise retain
their original behavior:

```sh
python3 tools/behavior-tests/ui/production_controls_native.py \
  --runtime /path/to/immutable-parent/GLSMAC.js \
  --production-ref 39a10998fc02311b12605a4f9ab9fa748203f317 \
  --shared-unit-source-parser \
  --report /tmp/production-controls-red.json
python3 tools/behavior-tests/ui/production_controls_native.py \
  --runtime /path/to/rebuilt-current/GLSMAC.js \
  --shared-unit-source-parser \
  --report /tmp/production-controls-current.json
```

Both commands execute real candidate C++ through WASM. They record runtime,
production/test snapshot and immutable reference hashes and fail on every
mismatch or worker error. They do not run a native desktop executable or the
original executable. Reference-integrity unit tests are separate and do not
establish candidate agreement. The original recording adapters remain in the
preserved reference worktree; implementation work does not read or modify them.
The required HOT regression job also runs the current-source projection without
the optional baseline overlay, against all eight unchanged 40×80 records. Its
report and per-case logs are part of the uploaded hot artifacts; a mismatch or
execution error fails the job and its aggregate. Schema/integrity unit tests run
separately, and the full v2 UI contract remains pending.

The shared-consumer baseline has eight strict mismatches and zero worker errors;
the candidate matches all eight projected records. The separate parser regression
passes eighteen scenarios/29 assertions, including positive declarations 4 and 8
and rejection of negative, overflowing, fractional and out-of-range declarations.

The existing strict natural and explicit seven-player state traces remain
separate full comparisons. Their frozen natural input does not explicitly encode
a map route, so this transfer does not infer Load Map from their dimensions or
change candidate setup to fit their observed mineral stock.
Frozen original inputs/answers and all eighteen reference-manifest files are
unchanged. Coordinates/RNG, AI orders, NPC project choices and University
technology differences remain mismatches where measured; this work cannot
establish full-game parity.
