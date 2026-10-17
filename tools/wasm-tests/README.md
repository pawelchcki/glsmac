# Browser-free WASM canvas tests

This is the first test target for the browser port. C++ is compiled to actual
WebAssembly by Emscripten and executed by Node.js. GLES3 calls go through
Emscripten's WebGL2 bindings into an offscreen canvas backed by
[webgl-node](https://github.com/monteslu/webgl-node) and native EGL/GLES.
On Linux the tests use Mesa's CPU renderer with no browser, display server,
window, or GPU required. No original SMAC assets are needed.

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

```sh
npm --prefix tools/wasm-tests test
```

This compiles `canvas.cpp` to `build/canvas.cjs` plus `build/canvas.wasm`, then
runs three rendering cases: the default canvas, a resized canvas, and a
texture-backed framebuffer. Each case compiles GLSL ES 3.00 shaders, uploads a
texture and vertex buffer, binds a VAO, draws an instanced triangle, and reads
RGBA pixels back into WASM memory. Node checks every pixel against the expected
four colored quadrants. Compilation errors, GL errors, and pixel mismatches
produce a nonzero exit status.

The tests save `canvas.png`, `resized-canvas.png`, and `framebuffer.png` under
`build/artifacts/`, including on pixel mismatch. Blue/white are the top quadrants;
red/green are the bottom quadrants. The test output identifies the actual renderer.
On Linux the runner sets `EGL_PLATFORM=surfaceless` and
`LIBGL_ALWAYS_SOFTWARE=1`, and removes display environment variables.

## Extending the port

Add portable C++ sources to `build.mjs` and exercise their exports from
`canvas.test.mjs`. The module is compiled for both `web` and `node`; Node supplies
the canvas, the WebGL constructors, and a minimal `#canvas` selector. Rendering
still goes through the normal Emscripten GL implementation.

This validates the WASM/graphics test path, not the full GLSMAC game. The game
still needs a browser build, SDL/main-loop integration, GLSL 330 to GLSL ES 300
changes, resource loading, and platform work for threads, audio, and networking.
EGL-backed tests do not cover browser event handling, DOM behavior, or every
browser's WebGL validation rules. Linux was verified locally; macOS and Windows
support in the underlying runtime has not been verified here.
