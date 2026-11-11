# Installer and custom-map recovery coverage

This batch adds twelve named application regression cases: nine installer
JavaScript protocol cases and three custom-map browser cases. It changes no
production behavior. The existing three custom-map browser cases also pass.

## Scope

The installer tests execute the production `installer-import.js` and
`installer-worker.js` in isolated Node VM contexts. The browser Worker delivery
and `createInnoextract` interface are controlled boundaries. Real Node `File`
and `Blob` values carry synthetic bytes. The checks cover:

- Selection errors before worker creation; successful returned paths, bytes,
  timestamps and progress; worker termination after every completion or error.
- Partial output followed by failure and a clean fresh retry; invalid output
  paths; startup, decoding, posting and empty-extraction failures.
- Companion identity validation before extractor loading; recovery after a
  refused request; required game-file inventory and omitted support files.
- Missing, duplicate and unexpected extraction output, including cleanup of
  emitted MEMFS files and the WORKERFS input mount.
- Exact read bytes across the worker's one-MiB cache boundaries, cached reads,
  EOF and a switch to a companion file.

The custom-map tests use the actual compiled engine's MEMFS/IDBFS and the current
launcher in Chromium. Synthetic MP/GSM maps exercise:

- A failure on the second filesystem write: removal of the first batch file,
  preservation of an existing map, usable controls, reload, and successful retry.
- A delayed actual `File` header read: disabled launcher controls, refusal of a
  concurrent controller import, no writes before validation completes, and
  persistence of only the accepted map after reload.
- Flat maps, excess landmarks, inconsistent abstract grids, a bad GSM dimension
  checksum and truncation: an earlier valid file in the batch is never partially
  saved, and a corrected map can subsequently be imported.

No original installer or game assets are required. These tests do not establish
native Inno decompression correctness, actual archive compatibility, complete
terrain loading, original-game parity, or rendered gameplay. The game is not
started, so no player world exists to compare. The observed application state is
the import lifecycle, filesystem contents, persistence and launcher controls.

## Local verification (2026-11-11)

- `node --test --experimental-test-isolation=none tools/wasm-tests/installer-protocol.test.mjs`:
  nine passed, no skips, under Node 24.10.0 and CI's Node 22.16.0.
- `WASM_APP_DIR=build/import-test-app node --test tools/wasm-tests/custom-maps.test.mjs`:
  six passed, no skips, 4.84 seconds under Node 24.10.0, Playwright 1.61.1 and
  Chromium 149.0.7827.55 (revision 1228).
- `git diff --check` and JavaScript syntax checks passed.

The local staged application copies the unmodified immutable CI engine from
PR #53, source `c0160cea41c091d659ffe0248c0d532f36bc8a01`, workflow run
`43015901038`, and stages the current worktree's `web/` files around it. Runtime
SHA-256 values are:

| File | SHA-256 |
| --- | --- |
| GLSMAC.js | `469a240495f2945052b4fdb6eacc7d72c27231ac68bbf8f323e3d9dcce18750b` |
| GLSMAC.wasm | `c75880a5ad8baf7a6e2f8194fde8679cb150f83a45a93b8ca18d56bc073b1f35` |

The initial local browser attempts failed before scenarios because the host's
font configuration caused Chromium to close while rendering the launcher.
A temporary `FONTCONFIG_FILE` in `/tmp` selecting only installed static DejaVu
fonts restored the unchanged original test and the complete six-case suite.
The local failed logs remain retained outside the checkout. No application
files or assertions were changed to accommodate the environment. Public CI uses
its normal Ubuntu browser dependencies and does not need that host override.

`.github/workflows/coverage-installer-maps.yml` runs the installer protocol and
all six synthetic custom-map browser cases on relevant PR heads. It uses the
reusable compiled engine, stages the current launcher, and retains TAP reports.
The optional original-installer test remains separate and is not counted here.
