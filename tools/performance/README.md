# Popup latency

This optional benchmark drives the shipped setup UI with real keyboard input and
privately installed assets. It opens the faction chooser through Start Game →
Make Random Map → Tiny Planet → Citizen → standard rules, then alternates Enter
to the leader-name editor and Escape to restore the chooser. Each session records
the first opening and four returns to the chooser, plus four name-editor openings.
It generates no world and changes no application timers or controls.

From the repository root, with the browser test dependencies installed:

```sh
PATH=/path/to/node22/bin:$PATH \
SMAC_ASSETS_DIR=/private/installed-assets \
WASM_APP_DIR=/path/to/release-build/bin \
FONTCONFIG_FILE=/path/to/fontconfig.conf \
POPUP_PERF_ARTIFACTS=/tmp/popup-benchmark \
npm --silent --prefix tools/wasm-tests run bench:popups > /tmp/popup-benchmark.json
```

`WASM_APP_DIR` must point to a local CMake build with its `CMakeCache.txt` in the
parent directory, so the report can record the build profile. Use the same Release
profile, toolchain, assets, host scripts, viewport, browser and font environment
for both versions. `POPUP_PERF_SESSIONS` defaults to three and accepts 1–10. For
paired measurements, run one session at a time in alternating before/after order
three times, with no concurrent application workers or builds. Keep screenshots
and logs private; no installed assets belong in the repository.

The viewport is 1024×768 at scale one, using Chromium/SwiftShader. A lossless CDP
screencast acknowledges frames immediately. PNG decoding and comparison happen
only after capture stops. The measured interval starts before dispatching the
actual key and ends at the first captured frame whose RGB pixels exactly match
that popup's later settled screenshot. Dimensions, the visible popup border and
nonnegative timestamps are checked. This is an observed input-to-paint upper
bound, limited by captured presentation cadence. Reports retain that cadence,
all unchanged frames and hashes of the runtime, host scripts and observer.

Handler-completion and aggregate Chrome process CPU deltas are diagnostics; the
CPU totals also include browser, rendering and SwiftShader work. They do not
attribute CPU cost to an individual function. This is a GLSMAC performance
benchmark, separate from Original behavior/timing comparisons and public
asset-free CI.

Compare three paired cohorts and retain full-frame before/after RGB differences:

```sh
python3 tools/performance/compare-popup-latency.py \
  --before /tmp/0-before.json /tmp/1-before.json /tmp/2-before.json \
  --after /tmp/0-after.json /tmp/1-after.json /tmp/2-after.json \
  --report /tmp/popup-comparison.json
```

The comparison rejects mixed observer, scripts, browser, Node, font configuration
and build profiles. It reports median cold/warm samples, nearest-rank warm p95,
per-cohort warm medians, and pixel hashes/differences without image masks.

## Recorded local result

On 2026-10-23, three interleaved before/after pairs recorded 54 real transitions
with Node 22.16.0 and Chromium 149.0.7827.55. Before was the frozen Release build
from `174f8463d2cf07ec97687599e8c8e7fad2e5adb6`; its production C++/GSE tree
matches main `a900bec7d749144d2a339e42c09b074b74cadf4a`. After was a separate
Release build from that main revision with the crop fix. Both used the same SDK,
installed dataset, host scripts and final observer.

| Popup | First-open median, before → after | Warm median, before → after | Warm p95, before → after |
| --- | --- | --- | --- |
| Faction chooser | 420.5 → 381.3 ms | 156.0 → 113.0 ms | 188.5 → 122.3 ms |
| Leader-name editor | 89.2 → 60.8 ms | 75.2 → 64.6 ms | 77.7 → 73.3 ms |

Warm median reductions were 27.5% and 14.1%. There were three first-open samples
per popup, twelve warm chooser samples and nine warm editor samples per version.
First-open results were noisier: one paired chooser trial became slower, so these
medians are not a per-trial or device-wide guarantee. All 27 paired settled canvas
images were RGB-byte-identical without masking.

Profiling identified `Filter::Crop` converting the entire 750×900 source atlas
before retaining small skin rectangles. The fix converts only the requested
region when it is the first filter and preserves the existing transformed-image
path. For a 24×24 skin this reduces initial conversion from 675,000 to 576 pixels.
Asset-free native tests separately cover exact RGBA, alpha, source immutability,
repeated cropping, tint/contrast before and after crop, rotation and both flips.
