# Browser-free WASM canvas tests

This is the first test target for the browser port. C++ is compiled to actual
WebAssembly by Emscripten and executed by Node.js. GLES3 calls go through
Emscripten's WebGL2 bindings into an offscreen canvas backed by
[webgl-node](https://github.com/monteslu/webgl-node) and native EGL/GLES.
On Linux the tests use Mesa's CPU renderer with no browser, display server,
window, or GPU required. No original SMAC assets are needed.

## Hot and stable application checks

Run `npm --prefix tools/wasm-tests run test:hot` for the current PR/development
lane. Run `test:stable` only on main after merge. Both use the existing strict
behavior runners with an [explicit lane manifest](../behavior-tests/lanes.json),
run groups sequentially and default to one worker (`-- --jobs 2` is the maximum).
The default commands include no pixel browser tests. Optional rendered hot checks
use `test:hot:browser` with the usual installed-assets/browser requirements.

`test:lanes` lists catalog membership, pending transfer and unrecorded gaps without
running a candidate. `python3 tools/behavior-tests/lanes.py --lane hot
--validate-only` validates evidence integrity and labels candidate execution false;
it does not establish candidate agreement. Pending strict red probes require
explicit `--pending` / `--kind pending-ui`, and input-only gaps are not runnable.
Legacy `test:fast`, `test:ui-parity`, `test:economy-parity` and `test:parity` commands
still default to all catalogued IDs. Stable is the explicit catalog complement,
not a claim of complete gameplay coverage. See the [lane commands and
scope](../behavior-tests/README.md#hot-and-stable-lanes).

## Setup

Use Node.js 22.16 or newer and [Emscripten](https://emscripten.org/docs/getting_started/downloads.html).
The verified SDK version is **4.0.22**. To install that version locally:

```sh
git clone --depth 1 --branch 4.0.22 https://github.com/emscripten-core/emsdk.git /tmp/glsmac-emsdk
/tmp/glsmac-emsdk/emsdk install 4.0.22
/tmp/glsmac-emsdk/emsdk activate 4.0.22
source /tmp/glsmac-emsdk/emsdk_env.sh
```

Choose a persistent SDK directory instead of `/tmp/glsmac-emsdk` if desired.
Activate its `emsdk_env.sh` in each new shell. Alternatively, set `EMXX` to the
absolute path of its `upstream/emscripten/em++` executable.

Linux needs the EGL/GLES runtime libraries and Mesa software drivers. For example:

```sh
# Debian / Ubuntu
sudo apt-get install libegl1 libgles2 libgl1-mesa-dri

# Fedora / Bazzite (if not already provided)
sudo dnf install mesa-libEGL mesa-libGLES mesa-dri-drivers
```

Install the test dependencies from the repository root:

```sh
npm --prefix tools/wasm-tests ci
```

The native addon downloads a platform binary during installation. A source-build
fallback needs Python, a C++ compiler, Node headers, and EGL/GLES development
headers. Dependencies and generated files stay under this directory and are
ignored by Git. The native game's CMake build is independent.

## Run

For fast gameplay, decision-logic, UI and UX regression checks with mocked
display boundaries, build the FastDebug app once and run:

```sh
npm --prefix tools/wasm-tests run test:fast -- --jobs 4
```

The runner loads current host GSE files into isolated WASM filesystems, so
script/test edits do not require relinking. It records actual assertion counts
and named scenarios; longer suites start first. The original-reference audit
and focused fixed-bug regression checks are documented in
[Original-game behavior comparisons](../behavior-tests/README.md).

```sh
npm --prefix tools/wasm-tests test
```

This compiles `canvas.cpp` to `build/canvas.cjs` plus `build/canvas.wasm`, then
runs rendering cases for the default canvas, a resized canvas, and a
texture-backed framebuffer. Each case compiles GLSL ES 3.00 shaders, uploads a
texture and vertex buffer, binds a VAO, draws an instanced triangle, and reads
RGBA pixels back into WASM memory. Node checks every pixel against the expected
four colored quadrants. Compilation errors, GL errors, and pixel mismatches
produce a nonzero exit status.

The suite also compiles the game's actual `ShaderProgram`, `Orthographic`, and
`OrthographicData` sources. It renders the same quadrants through the game
shader on the canvas and a framebuffer, checks translated row-major matrix
uploads and instancing, and verifies that integer picking preserves the full
32-bit value `0xf1234567`. Both framebuffer cases exercise the browser depth
texture format. A tiny logger stub keeps these tests independent of the engine.

The tests save canvas, resized canvas, framebuffer, and game shader images under
`build/artifacts/`, including on pixel mismatch. Blue/white are the top quadrants;
red/green are the bottom quadrants. The test output identifies the actual renderer.
On Linux the runner sets `EGL_PLATFORM=surfaceless` and
`LIBGL_ALWAYS_SOFTWARE=1`, and removes display environment variables.

The suite also compiles the application's UUID implementation, asynchronous
network request queue, and browser network backend into `build/platform.cjs`.
It checks 1,024 generated UUIDs for version, variant, format, and uniqueness.
Network tests verify that browser hosting and joining return explicit TCP
unavailability errors after an iteration, leave the connection mode offline,
consume responses once, support cancellation, and allow offline disconnection.
These tests use the real platform sources without constructing a game engine.

The thread regression compiles the production `Thread` implementation for native
and WASM pthreads. It verifies callbacks on the SDL-owning MAIN worker, module
affinity, reverse module shutdown, and successful joins and process exit.
Held in-flight traversals check that the collector joins first, background
iterations drain while UI state remains alive, and worker cleanup follows UI
teardown. The real-asset Former traces additionally check stable engine exit.

The production `TextureUpload` helper is compiled separately and checked with
real GL pixel readback. Small fixtures force a 32-pixel GPU limit, preserve
quadrants and odd-size RGBA edges, update dirty rectangles across sample
boundaries, retain unaffected pixels, regenerate valid mipmaps, and cross the
1 MiB upload-strip boundary. Identity uploads and a one-pixel limit are covered
too. Run just these checks with `npm run test:textures` in this directory.

The production SMAC `.MP` parser also runs as actual WASM with synthetic binary
fixtures. It checks packed tile order, signed sea level, original coast and
contour heights, resources, landmarks, terraforming, seeded resource placement,
and rejection of malformed headers or truncated grids. Run it separately with
`npm run test:maps`. No original map files are distributed. The full
`npm run test:gse` suite additionally exercises real `Tile`/`Tiles` serialization:
imported center heights and coast classifications survive updates and save/load,
corner edits resume normal height calculation, and older GSM records remain
readable. Script tests cover both Planet menu paths, installed-map selection,
faction selection and cancellation, Credits, and resetting Quick Start to random
generation after a Planet selection.

Script tests also exercise owned-base navigation, wraparound and foreign-base
exclusion; the visible Skip Turn control and the existing skip event's
application and rollback; and complete tile landmark/improvement labels.
Native GSE tests verify that each exposed improvement flag matches its stored
terrain bit.

`npm run test:custom-maps` uses the actual built WASM filesystem and IndexedDB
without starting the game. Synthetic MP/GSM fixtures cover import, refresh,
offline reads, installation changes, duplicate/malformed inputs, and rollback
after storage failure. No original game assets are needed, and CI runs it.

With `SMAC_ASSETS_DIR` set, `npm run test:gameplay` imports a synthetic map and
starts the real engine with a test-only world containing two owned bases and
one unit. Canvas interactions exercise both base arrows and wraparound, then
the visible Skip Turn button. Read-only GSE probes check actual base selection,
remaining movement, and the terrain labels drawn by the production UI. The
fixture scripts are injected into test memory and are not shipped with the app.

`npm run test:land-resources` checks native imported farms, rocky road/mines and
forests under default and altered installed resource inputs. Two genuinely
assigned workers contribute to the actual base intake and rendered resource
labels. Real Skip/Next Turn controls then advance food storage and mineral
production using that income. Expected worker yields come from the bounded
original economy observations; this larger-map application fixture adds no
original comparison cases. The tests use current host scripts over the cached
engine and are also included in `test:gameplay`.

The optional `npm run test:setup` browser checks use a legally obtained original
installation supplied through `SMAC_ASSETS_DIR`. They exercise both Planet maps
through faction selection, then Credits and an installed-map flow including
map/faction cancellation and Current Rules. The tests require real terrain,
check the selected map's dimensions, reject browser/graphics errors, and verify
that catalogs and canceled setup do not download map contents. FastDebug startup
logs also confirm the selected faction and difficulty. See the
[browser validation instructions](../../web/README.md#validation) for commands
and published-site testing. Original assets remain outside the checkout.

## Extending the port

Add portable C++ sources to `build.mjs` and exercise their exports from
`canvas.test.mjs`. The module is compiled for both `web` and `node`; Node supplies
the canvas, the WebGL constructors, and a minimal `#canvas` selector. Rendering
still goes through the normal Emscripten GL implementation.

For the full application build, browser launcher, complete GSE suite, and
Chromium startup tests, see [GLSMAC in a browser](../../web/README.md).
EGL-backed tests alone do not cover browser event handling, DOM behavior, or
every browser's WebGL validation rules. Linux was verified locally; macOS and
Windows support in the underlying runtime has not been verified here.

The in-game menu comparison lane uses actual native MENU/header pointer hits
and SDL Escape against twelve immutable original traces:

```sh
SMAC_ASSETS_DIR=/path/to/installed/game npm run test:ingame-menus
```

It loads production scripts directly from the checkout; `WASM_SCRIPTS_ROOT`
can select a frozen source tree and `WASM_APP_DIR` selects a built runtime.
`INGAME_MENU_CASE` selects one public case ID. The default lane runs all twelve
serially. Native labels, separators, text tones and city/unit state are observed;
artwork, hints, enabled semantics and row effects are outside this contract.
The display-free equivalent needs no original assets; see the
[bounded contract](../behavior-tests/ui/ingame-menus-contract.md).

`npm run test:base-operations` uses installed assets and actual pointer events to
open MENU → HQ → Base Operations, select a live owned city, double-click into
its native city panel and return with Escape. It continuously checks deep
primitive state snapshots for every owner/unit/base throughout the controls.
Use `WASM_SCRIPTS_ROOT` for the current source snapshot and `WASM_APP_DIR` for a
pinned engine/web shell. This checks navigation and native preservation; exact
original report artwork, numerical report rules and double-click timing remain
outside the bounded observation contract.
