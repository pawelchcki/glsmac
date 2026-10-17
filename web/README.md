# GLSMAC in a browser

The full application can be cross-compiled with Emscripten **4.0.22**. It uses
WebGL2, SDL2, FreeType, and WASM threads. A native C++17 compiler is also required
to build the asset embedder. CMake downloads pinned yaml-cpp sources; Emscripten
downloads its SDL, image, font, and compression ports on the first build.

Activate the SDK described in [the WASM test setup](../tools/wasm-tests/README.md),
then run from the repository root:

```sh
emcmake cmake -S . -B build/wasm -DCMAKE_BUILD_TYPE=FastDebug
cmake --build build/wasm -j6
python3 tools/serve-wasm.py
```

Open <http://127.0.0.1:8000>. Choose one of the asset sources and start the game:

- **GOG installer EXE:** select the Alpha Centauri offline installer downloaded
  from GOG, plus its BIN files if supplied separately. A WASM build of
  innoextract unpacks the English game files in a browser worker. The installer
  stays on your device and is parsed as data; no Windows program runs and no
  installer or extracted game file is uploaded. The browser saves the extracted
  files in IndexedDB after successful unpacking. Future visits use Saved assets.
- **Local installation:** select an Alpha Centauri / Alien Crossfire directory.
  The browser saves the files in IndexedDB without uploading them. Subsequent
  visits can use the saved installation without selecting the directory again.
- **Hosted assets:** enter the URL of an asset manifest. The game downloads each
  file when it first reads it, checks its size and SHA-256 hash, and stores it in
  IndexedDB. It reuses downloaded files on subsequent visits.
- **Saved assets:** reuse a previously imported installation or hosted source.
  The saved manifest and downloaded files work without an asset server; files
  that have not been downloaded still require a connection.

Only files actually read by the game enter WASM memory. The launcher requests
persistent browser storage where available; browser quotas, eviction, and
clearing site data still apply. Asset storage belongs to the website's origin,
so moving the website to a different origin creates a separate cache. The
launcher can remove a saved source to reclaim space.

Without assets, the game opens its path setup screen. The embedded GLSMAC
scripts and fallback font are included in the executable; original game assets
are not distributed. Settings and saved data under `/persist/glsmac` use a
separate IndexedDB filesystem. Asset caching does not cache the website itself
for a completely offline cold start.

`Release` and `Debug` are also supported build types. Use `FastDebug` or `Debug`
for `--gse-tests`; that command is omitted from release builds. Native desktop
build commands are unchanged.

To build and run the smaller optimized version:

```sh
emcmake cmake -S . -B build/wasm-release -DCMAKE_BUILD_TYPE=Release
cmake --build build/wasm-release -j6
python3 tools/serve-wasm.py build/wasm-release/bin
```

Production hosting must use HTTPS and include these response headers (localhost
also works for development):

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Serve `.wasm` as `application/wasm`. Keep `index.html`, `bootstrap.js`,
`asset-store.js`, `config.js`, `installer-import.js`, `installer-worker.js`,
`isolation.js`, `coi-serviceworker.js`,
`innoextract.js`, `innoextract.wasm`, `innoextract-licenses.txt`, `GLSMAC.js`,
and `GLSMAC.wasm` from the build's `bin` directory together. Include the bundled
license files when distributing the website. The included local
server supplies the required headers. A browser supporting WebGL2 and shared
WASM memory is required. Native TCP multiplayer is unavailable; connection and
hosting requests return a clear error. The UI runs at browser animation cadence.

## GitHub Pages

The included WebAssembly workflow builds and tests both application variants,
then publishes only the Release website to Pages for pushes to `in_webbrowser`
or the repository's default branch. Enable **GitHub Actions** as the publishing
source in the fork's Pages settings. Original installers and game files are
never included in the site artifact.

Pages does not supply custom isolation headers. The launcher automatically
registers a service worker scoped to its project directory, then reloads once
to add them. Hosts that already supply the headers start immediately. HTTPS
and browser service-worker support are required for this fallback; it does not
add offline caching of the website or upload any local files.

## Hosting original assets

To test streaming from an existing installation outside the checkout:

```sh
python3 tools/serve-wasm.py build/wasm-release/bin --assets ../smac-assets
```

Choose Hosted assets and use `http://127.0.0.1:8000/assets/manifest.json`.
The server generates the manifest and exposes only its listed files. It does
not modify the installation or require copying it into the checkout.

For a static server or object bucket, generate the manifest beside the assets:

```sh
python3 tools/prepare-assets.py ../smac-assets --output ../smac-assets/manifest.json
```

Upload the directory with its relative paths preserved and publish the manifest
last. Directory listings and an application backend are unnecessary. Regenerate
the manifest with `--force` after changing any files. Each manifest identifies
one dataset; a changed dataset gets a separate browser cache.

Set `assetManifestURL` in the deployed `config.js` to make a hosted source the
default for new visitors. An empty value leaves the choice to the user. Private
access URLs can be entered in the launcher; keep credentials out of source
control and public configuration. A selected hosted source, including its URL,
is saved in that browser's IndexedDB.

Assets can be served from a different origin than the website. That server must
allow CORS GET requests, for example with `Access-Control-Allow-Origin: *`.
The browser sends cookies only to the website's own origin. Cross-origin
asset hosts receive no cookies or other ambient credentials. Keep the
website's cross-origin isolation headers above when using a separate asset
host. Only publish game assets to audiences you are authorized to share them
with.

## Validation

```sh
npm --prefix tools/wasm-tests ci
npm --prefix tools/wasm-tests test
npm --prefix tools/wasm-tests run test:gse
npx --prefix tools/wasm-tests playwright install chromium
npm --prefix tools/wasm-tests run test:app
npm --prefix tools/wasm-tests run test:assets
npm --prefix tools/wasm-tests run test:pages
python3 -m unittest discover -s tools -p test_wasm_assets.py
```

The focused tests exercise production shaders, matrix uploads, integer picking,
UUIDs, networking responses, and thread callbacks in actual WASM. `test:gse`
runs the full application's scripting suite in Node. `test:app` starts the
compiled application in headless Chromium and checks that its setup UI draws
without browser errors, keyboard input opens the console, real WebAudio callbacks
run, and production shaders and integer picking pass WebGL validation. Its screenshot is saved under
`tools/wasm-tests/build/artifacts/app-setup.png`. These checks require no original
game assets. The asset tests cover persistent local imports, lazy downloads,
offline cache reuse, corrupt responses, retries, and the C++ worker bridge.

An optional integration test starts the actual main menu with an original
installation, then reloads from the browser cache with asset requests blocked:

```sh
SMAC_ASSETS_DIR="$(realpath ../smac-assets)" npm --prefix tools/wasm-tests run test:game
```

It defaults to the Release build and skips when `SMAC_ASSETS_DIR` is unset.
These checks do not verify a complete single-player game.

To verify browser-only unpacking with a GOG installer, including a cached
restart without selecting the EXE again:

```sh
SMAC_INSTALLER_PATH=/path/to/setup_alpha_centauri.exe npm --prefix tools/wasm-tests run test:installer
```

The installer extractor is built automatically with the full WASM application.
Its build script downloads SHA-256-pinned innoextract, Boost and liblzma sources
into `build/wasm-extractor`; Emscripten supplies zlib and bzip2. That build is
shared between application configurations. Original installers stay outside
the checkout and are not needed for the synthetic rejection test.

Set `WASM_SITE_URL` to test an already published site's installer flow instead
of starting a local server. `test:pages` exercises a project subdirectory on a
server without isolation headers, including first-visit setup and refresh.

Set `WASM_APP_DIR` to an absolute build output directory to test a different
build. Set `WASM_BROWSER_EXECUTABLE` to use an existing Chromium executable.
