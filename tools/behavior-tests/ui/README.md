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

| Contract | Cases | Observations | Original evidence source |
| --- | ---: | --- | --- |
| `ui.menu_trace.v1` | 41 | Captions, ordered choices, selected choice and intermediate screens after clicks, arrows and Escape | Real original application in Wine/Xvfb; recorded twice |
| `ui.custom_planet.v1` | 215 | Question order, selected defaults, cancel/confirm/wait status, consumed responses and confirmed map parameters | Original x86 custom-planet controller in Unicorn; recorded twice without graphics |
| `ui.menu_trace.v1` (navigation) | 54 | Both full navigation cycles, Home/End, Enter and Escape across ten menu screens; 425 checkpoints | Real original application in Wine/Xvfb; recorded twice |

There are 310 recorded cases in total. `generate_navigation.py` generates only
new input sequences, excluding paths already present in the first menu suite.
The recordings establish that both arrows wrap and Home/End leave these menus
unchanged. Random-map difficulty cancellation returns to map type, while the
custom-question controller's cancellation returns to size selection.

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
outside these contracts need additional observations; [the property inventory](../properties.json)
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
any failures. All 310 recorded cases now agree after production fixes to choices,
selection, wrapping and cancellation. This does not cover Scenario child actions
or the original custom-size dialog. These totals remain separate from the
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

# Render seven paths spanning all ten menu screens and real input.
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
all seven paths. The recorded outputs are compared exactly in both conditions.

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
