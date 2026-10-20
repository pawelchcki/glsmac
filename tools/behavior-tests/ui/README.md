# Original / reproduction UI comparisons

The default lane executes GLSMAC's **production GSE menu steps, sliding controls
and back-stack without pixels**. Native display objects, audio and timer delivery
are mocked; menu choices and state transitions are executed. It compares those
observations with immutable, independently recorded original-game evidence.

```sh
# Requires Node.js and the FastDebug WASM runtime built once; no npm install,
# game assets, browser, graphics libraries or Python packages are needed here.
npm --prefix tools/wasm-tests run test:ui-parity -- --jobs 4

# Evidence integrity only, without running either implementation:
npm --prefix tools/wasm-tests run test:ui-parity -- --validate-only
```

Build the runtime using [the browser build instructions](../../../web/README.md).
`WASM_HEADLESS_APP_DIR` overrides its default directory, `build/wasm/bin`.
Production GSE script changes are loaded directly from the checkout; they need
no rebuild. Engine changes require rebuilding the runtime. Test helpers enter
only the worker's virtual filesystem, never the shipped application.

The first complete replay of **256 cases took about 30 seconds** with four
workers on the development machine. The run starts bounded, isolated interpreter
batches and advances timers synchronously, with no animation sleeps. This is a
local measurement, not a timing guarantee. The original custom-map controller
can also be observed without rendering, using Unicorn to execute its x86 code.

## Contracts and boundaries

Two additional [Former work traces](former-work-contract.md) are frozen in the
pending catalog. They cover edited mine completion and farm cancellation/resume;
strict replay currently reports both unsupported. They do not increase the
passing totals below. CI checks their evidence integrity separately.

| Contract | Cases | Observations | Original evidence source |
| --- | ---: | --- | --- |
| `game.startup_inventory.v1` / `game.startup_inventory_sources.v1` | 6 | First-base unit names and separate active/queued/lost counts; two default land factions and controlled starting-TECH swaps | Actual Military Command Nexus at MY2101, independently recorded twice |
| `game.faction_social_ratings.v1` | 18 | Fourteen initialized original factions and four source overrides; actual GROWTH/INDUSTRY labels and distinct nutrient/mineral globals | First-base setup and actual Social Engineering with guarded native cross-checks, recorded twice |
| `game.faction_identity.v1` | 22 | Six selected-faction text fields after actual name confirmation/world generation; fourteen factions, custom edits, cancel/restore, empty/limited/space-preserving names and source overrides | Original native identity at the rendered opening dialog; recorded twice |
| `ui.faction_setup.v1` | 82 | Seven roster slots, selected/random modes, all14 leader headers, seven editable fields, caps, source profiles and cancel/re-entry; 603 checkpoints | Real original application in Wine/Xvfb; native control reads and isolated-label OCR, recorded twice |
| `ui.custom_size_kind.v1` | 20 | Untouched Custom dialog, native setup kind, cancel/back and remembered named-size highlight | Real original application in Wine/Xvfb; recorded twice |
| `ui.menu_trace.v1` | 41 | Captions, ordered choices, selected choice and intermediate screens after clicks, arrows and Escape | Real original application in Wine/Xvfb; recorded twice |
| `ui.custom_planet.v1` | 215 | Question order, selected defaults, cancel/confirm/wait status, consumed responses and confirmed map parameters | Original x86 custom-planet controller in Unicorn; recorded twice without graphics |
| `ui.menu_trace.v1` (navigation) | 54 | Both full navigation cycles, Home/End, Enter and Escape across ten menu screens; 425 checkpoints | Real original application in Wine/Xvfb; recorded twice |
| `ui.menu_trace.v1` (re-entry) | 14 | Remembered size, nondefault difficulty return paths, partial custom answers and completed custom cancellation; 104 checkpoints | Real original application in Wine/Xvfb; recorded twice |
| `ui.map_size_keyboard.v1` | 4 | Final menu after Enter/Escape in untouched custom dimensions, on random/custom routes | Real original application in Wine/Xvfb; recorded twice |
| `ui.citizen_job.v1` | 14 | Starting Worker/Doctor choices, highlight, draft/confirm/cancel, keyboard behavior and visible Psych bonus; 67 checkpoints | Real original application in Wine/Xvfb; recorded twice |
| `ui.unit_orders.v1` | 13 | Paused-turn Scout Hold/Activate/Skip, two advances, idle Space base opening, actual OK close and modal key blocking; 45 checkpoints | Real original application in Wine/Xvfb; recorded twice |
| `ui.large_map_warning.v1` | 84 | Edited values, threshold 128, common-source caption/choices, clamped navigation, mouse selection, Enter/Escape/OK and caller return | Real original application in Wine/Xvfb; recorded twice |
| `map.custom_grid_dimensions.v1` | 4 | Width, height, half-width, tile count and Custom kind after real generated worlds, including odd height 49 | Real original application in Wine/Xvfb; five verified read-only fields, recorded twice |
| `ui.map_dimension_dialog.v1` | 18 | Custom-size caption, two labels, untouched raw values and buttons across both routes, all prior presets and four controlled text profiles | Real original application in Wine/Xvfb; recorded twice |

There are 609 recorded cases in the passing catalog. The historical 80-case faction recording is retained for provenance and is not counted again. `generate_navigation.py` generates only
new input sequences, excluding paths already present in the first menu suite.
The recordings establish that both arrows wrap and Home/End leave these menus
unchanged. Random-map difficulty cancellation returns to map type, while the
custom-question controller's cancellation returns to size selection.
The re-entry recordings also show Tiny/Huge selections survive returning to map
type, and confirmed custom questions cancel from difficulty to map type. Ocean
coverage already chosen in an abandoned custom flow remains selected on re-entry;
the reproduction must preserve that observed behavior. `generate_reentry.py`
produces these inputs without calculating their outcomes.

Custom-dimension keyboard cases observe only the final menu after Enter or
Escape, including its actual highlight. Both original cancellation routes return
to map type; confirmation continues to difficulty or ocean coverage. Candidate
replay emits the native focused Input's `input` event through the real popup,
submission callback and manager. The rendered profile checks actual browser
keyboard delivery. Field values, dimension units, validation bounds, focus
traversal and generated terrain remain outside this contract.

The separate [custom-dimension contract](dimension-dialog-contract.md) observes
untouched `40`/`80` values, common `Script.txt` caption selection and `labels.txt`
field labels. Four controlled source profiles distinguish common and expansion
captions. It does not observe original edited-input validation or generated
coordinate units. Replay executes native Rules/MapSettings and production source
consumers and controls without graphics.

The citizen-job contract observes one starting citizen with Worker and Doctor
available. Clicking its portrait opens the actual original chooser. Doctor shows
`+2 PSYCH`; only confirmation changes the base-screen Psych bonus from zero to
two. Drafting or canceling preserves the prior job. Arrows clamp at the two ends;
Home/End leave the highlight unchanged. Enter confirms and Escape cancels.
Every case starts in a fresh original process, and both recorded passes agree.
The setup has reached MY 2101 before the final Enter, which opens the base
without changing the year. A brief stale HUD label must not be used to infer a
turn change; see the [evidence scope clarification](evidence-errata.md). The
recordings are unchanged.
Original text and highlight are read from rendered controls by OCR consensus;
the reference does not calculate the Doctor bonus.

Citizen replay executes real native Base/Pop/Tile objects, shipped portrait and
chooser callbacks, actual work/unwork validation and application, and the real
energy panel. Display/artwork, timer delivery, local-owner identity, synchronous
command delivery and unrelated panels are controlled boundaries. Nonnegative
terrain with zero raw energy isolates the visible specialist bonus. This scope
does not establish other jobs or unlocks, energy allocation/rounding, drones,
talents, original Worker tile selection, or complete original base behavior.
Returning Workers use GLSMAC's existing best-vacant-square selector; its no-square
message and multi-citizen bonus aggregation are separate application policies.
The actual browser citizen-job regression checks native queued commands and
rendered input separately; it adds no original observation count.

Custom-map inputs contain four saved preference ordinals and at most four
responses. Question order is ocean, erosion, native life, clouds. Ordinals 0..2
mean the first through third listed choice, not raw engine floats; -1 cancels.
The inputs cover all 81 preference vectors, all 81 complete response vectors,
all 40 cancellation prefixes and 13 partial waits. The original controller ends
at its verified confirmation/cancellation teardown boundary or an actual input
wait. Graphics constructors, bitmap loading, popup creation and response delivery
are mocked. Unknown code, dependencies, memory accesses and execution limits
fail closed. Only the pinned executable fingerprint is accepted.

The candidate custom-map adapter enters through the real size menu and executes
the four real custom steps. Its next difficulty step marks the bounded
controller exit. Parameter values are converted into declared choice ordinals;
unknown values are errors. Preview drawing and map randomization are outside
this contract. The menu trace adapter delivers events directly to production
controls and observes their actual highlight classes.

The GSE regression lane also reads a fresh compiled `MapSettings` object before
executing all four production custom questions. This separately checks actual
startup defaults; the controller's supplied preferences do not cover them.

Headless tests do **not** cover pixels, geometry, mouse hit testing, global browser
input routing, focus, real animation timing or audio output. Use the selected
rendered integration lane for real control coordinates and browser input delivery.
Gameplay, dialogs and side effects
outside these bounded contracts need additional observations; [the property inventory](../properties.json)
keeps that work explicit. Case counts are not counts of all original properties.

## Record and transfer

Replay uses checked-in evidence and needs no original installation. To recapture
the custom-map reference, supply a legally obtained original `terranx.exe` and
install [the reference dependencies](../requirements-reference.txt) in a venv:

```sh
SMAC_ASSETS_DIR=/path/to/original \
SMAC_REFERENCE_PYTHON=/path/to/reference-venv/bin/python \
  npm --prefix tools/wasm-tests run test:ui-record -- --suite custom-map --force
```

`--force` explicitly replaces existing evidence. Recording always requires two
independent identical runs, binds exact inputs and outputs to hashes and rejects
partial/error observations. `generate_custom.py` generates inputs only, never
answers. The original executable must match the GOG Alien Crossfire v2.0
fingerprint documented in the parent README. No original bytes belong here.

To transfer a property, give an implementation context the contract, input and
recorded observation, together with existing GLSMAC source. Keep original
research and disassembly out of that implementation context. Change production
behavior and replay the same evidence. Do not regenerate answers from GLSMAC,
add aliases/tolerances or exempt known differences.

The report is `tools/behavior-tests/.build/ui/parity.json`; raw interpreter logs
are adjacent. It identifies runtime/script fingerprints and exact differing
fields. Exit status is 0 for full agreement, 1 for disagreements/unsupported
contracts and 2 for execution/observation errors. Missing controls preserve the
partial trace and fail comparison. Runtime success alone never proves parity.
[known-issues.json](known-issues.json) describes observed gaps without suppressing
any failures. All 481 recorded cases now agree after production fixes to choices,
selection, wrapping, cancellation, citizen jobs and bounded Scout orders. This
does not cover Scenario child actions, custom-dimension limits or other unit
types/orders. These totals remain separate from the
regression and helper-comparison catalogs. CI validates evidence and requires
the strict headless parity check.

## Optional rendered discovery and integration

`probe.py` drives the real original in a private Wine/Xvfb installation, or the
real Release WASM app in Chromium. Its observer reads actual text using OCR
consensus without a dictionary of expected labels. Coordinates come from each
app's rendered controls. Each case resets settings and starts a fresh game
process or browser context. Checkpoints require repeated stable observations.

Capture dependencies: Wine supporting 32-bit Windows applications, Xvfb,
xdotool, ImageMagick's `import`, Pillow (`ui/requirements.txt`), libtesseract,
Leptonica and English Tesseract data. Browser replay uses the existing Playwright
installation. Set `SMAC_ASSETS_DIR`, `SMAC_WINE`, optionally `WASM_APP_DIR` or
`WASM_BROWSER_EXECUTABLE`.

```sh
# Read original controls to generate more input paths, not expected outputs.
npm --prefix tools/wasm-tests run test:ui-discover -- --max-cases 64

# Replay the frozen menu cases through real Chromium instead of headless GSE.
npm --prefix tools/wasm-tests run test:ui-parity -- --suite menus --browser

# Render thirteen paths through menus, re-entry and custom-size keyboard actions.
npm --prefix tools/wasm-tests run test:ui-parity -- --render-smoke

# Or select specific frozen cases; their full original evidence is validated.
npm --prefix tools/wasm-tests run test:ui-parity -- --suite menus --browser --case menu-68f3cbd2bd99
```

Rendered replay also loads a fresh snapshot of production scripts into the
browser filesystem, so script changes need no engine relink. Each case retains
an isolated browser context; worker script/runtime fingerprints must agree.
The selected lane is an integration check against the same original evidence,
not an exemption from the full headless suite.
Rendered replay defaults to one worker to bound graphics load. Explicit `--jobs`
permits more workers. Graphics errors remain failures and are never retried into
a passing result automatically. The custom-preview trace is part of this
profile because it exposed a presentation failure that headless checks missed.
Its settling deadline is 20 seconds and returns as soon as observations stabilize.
Run this graphics lane without competing headless workers on constrained hosts;
the initial loaded run hit observation deadlines, while isolated replay passed
all seven then-recorded paths. The current thirteen-path profile adds custom-size
keyboard actions and re-entry regressions. The recorded outputs are compared exactly in both conditions.

The observer caches only complete observations of identical normalized RGB
pixels. Each screenshot is still loaded and hashed; changed pixels require
fresh segmentation and OCR consensus. The bounded cache holds hashes and copied
results, not images or expected labels. Errors never enter it. An 18-observation
sample took 6.7 seconds without caching and 2.2 seconds with it, with identical
outputs. This sample is not a whole-suite speed guarantee.

Discovery follows unseen menus and tries their choices, arrows and Escape. Menu
identity includes a bounded route context (`--context-depth`, default 2), so
identical size menus on random/custom paths remain distinct. Repeated
`--start-with LABEL` options focus a route. This is bounded exploration, not all
combinations. `.build/ui/discovered.json` contains successfully observed inputs;
its adjacent `.coverage.json` retains unsupported screens, excluded terminal
actions, depth limits and pending paths. None count as passes. Use the parent's
`compare.py record` command on those inputs before treating them as evidence.

Screenshots stay in ignored `.build/ui/{original,browser}/run-*` or
`.build/ui/discovery-artifacts` directories. Only behavioral observations and
synthetic inputs belong in version control. The current rendered observer
supports sliding menus; other modal styles need dedicated observers.


## Original order controls

The default catalog includes 13 independently repeated starting-Scout order
sequences and 45 checkpoints under `ui.unit_orders.v1`. Candidate replay uses
actual native units/turns and shipped command controls without pixels or assets:

```sh
python3 tools/behavior-tests/ui/run.py --suite unit-orders
```

Display, initial selection and event notification delivery are declared boundaries;
commands and turn effects are executed by production code. Optional synthetic-world
browser paths additionally check the actual frontend and SDL input. These do not
add original-input parity cases. See the [precise scope](unit-orders-contract.md).

The [pending catalog](pending-catalog.json) is empty after promotion of the
six [startup inventory cases](startup-inventory-contract.md). The two original
red cases and four additional controlled-source cases now match actual native
units and projects. `--pending` remains a strict lane for future discrepancies;
an empty queue reports no execution and no matches. This does not establish
complete game parity. The
successful original recorder normalized indexed screenshots to RGB before OCR;
prior observer/setup failures remain local research artifacts.

The [Custom size kind contract](custom-size-kind-contract.md) adds 20 original
traces. Production controls now declare Custom kind 99 when the dialog opens,
retain it through cancellation/confirmation and remember the last named size
independently. Candidate replay uses actual native settings and GSE controls
without pixels; original capture reads one verified four-byte setup field and
observes visible controls. Edited bounds and large-map warnings remain outside
this contract. `npm --prefix tools/wasm-tests run test:dimensions` separately
checks real browser input, loaded rule factors, terrain, Headquarters and a turn.

The [large-map warning contract](large-map-warning-contract.md) adds 84 original
traces. Either typed dimension above 128 opens the source-driven warning. Its
arrows clamp, Home/End do nothing, mouse clicks only select, and Enter/Escape/OK
confirm the selected choice. Continue reaches difficulty or ocean coverage;
Never mind returns to map type with the route highlighted. Four controlled
profiles distinguish common Script.txt from conflicting expansion text.

The [generated-grid contract](custom-grid-dimensions-contract.md) adds four
original worlds. Raw 30×48, 30×49, 31×49 and 129×49 produce full widths 60/60/62/258
and unchanged heights, including 49. Candidate replay uses actual controls and
native grids/codecs without terrain generation or graphics. Separate native
regressions cover pole normalization and the final mesh pass. The installed-data
browser lane checks warning body consumption, rejection/re-entry/confirmation,
actual 258×49 terrain, Headquarters and a gameplay turn. Bounds beyond recorded
inputs, odd named-table rows, external odd-height SMAC map files and original
terrain/RNG equivalence remain gaps.

The [faction setup contract](faction-setup-contract.md) replays production GSE controls and native source parsing without rendering. The installed `alphax.txt` roster, faction UI headers, common `Script.txt` editor definitions and `labels.txt` labels supply the controls. Two-case process batches bound native fixture memory; a source snapshot and runtime hashes bind all batches. Real SDL typing, native Player identity and world/gameplay handoff are checked separately in the browser. Portraits, Datalinks, opponent AI and faction mechanics remain explicit gaps.

The [identity handoff contract](faction-identity-contract.md) compares six actual native identity fields after menu confirmation. Each display-free replay validates native storage, wrappers and serialization. Browser checks separately confirm all six custom text fields, an explicitly empty leader name and playable generated worlds. Gender semantics, the other six roster slots and computer turns remain unimplemented.

The [initial social-rating contract](faction-ratings-contract.md) imports installed GROWTH/INDUSTRY into native factions and checks source parsing, validation, wrappers and codecs without rendering. Real Consciousness and Drone browser paths verify growth thresholds, displayed production prices and turn credits. Other bonuses and social policy choices remain gaps.
