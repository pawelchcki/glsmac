# Setup and configuration coverage

This batch adds seven application scenarios to three existing registered suites.
It changes tests and a dedicated PR workflow; production code and original-game
observations remain unchanged.

## Covered transitions

- Two faction flows use the production preset, opponent picker, human row, name
  input and launch handlers, then pass that launch request into the actual native
  participant initializer. Both the base and expansion presets edit one opponent
  and select a nonzero human row. Assertions observe all seven native participant
  IDs, faction IDs, copied identities, human/computer roles, host authority and
  readiness. The native catalog remains unchanged, the human leader name alone
  changes, the participant codec invariant passes, and duplicate confirmation
  cannot allocate a second roster.
- Two custom-dimension flows change between the generated map routes while the
  editor is open. The current route determines the next question. Native aliases
  observe the committed dimensions, while filename, climate, rule settings,
  existing world snapshot and update count remain unchanged. Removed input
  handlers cannot submit a second time.
- An imported-map selection arriving while a large-size warning is open remains
  unchanged when the warning's response is delivered. The stale generated route
  cannot advance a setup question or replace the import.
- Optional dimension-source recovery covers repairing incomplete labels in the
  same bundle and recreating a bundle after a malformed common document was
  cached. Successful cached definitions remain detached from later source edits;
  unrelated static menus remain usable throughout.

Native faction templates are populated from the same declared synthetic header
inputs through the separate production faction-identity consumer. Initializing
these participants creates no bases: map generation, placement, starting stocks
and subsequent computer decisions are outside this test's claim. Display,
selection events, artwork imports and input delivery are controlled fixture
boundaries. These scenarios establish neither rendered keyboard/pointer parity
nor additional original-game agreement.

## Reproducible check

```sh
python3 tools/behavior-tests/fast.py \
  --runtime /tmp/wasmsmac-coverage-runtime-nov11/GLSMAC.js \
  --suite menu-factions --suite dimension-controls --suite dimension-data \
  --suite world-size-menus --suite map-size-keyboard --jobs 1 \
  --report /tmp/wasmsmac-coverage-setup-focused-2.json
```

The local run on 2026-11-11 passed all five suites in 34.45 seconds:

| Suite | Scenarios | Assertions |
| --- | ---: | ---: |
| menu-factions | 14 | 129 |
| dimension-controls | 16 | 109 |
| dimension-data | 11 | 74 |
| world-size-menus (adjacent) | 9 | 90 |
| map-size-keyboard (adjacent) | 32 | 288 |
| Total | 82 | 690 |

The immutable engine came from `pawelchcki/wasmsmac` CI run `43015901038`, artifact
`behavior-engine`, source `c0160cea41c091d659ffe0248c0d532f36bc8a01`. It uses
Emscripten 4.0.22 with the recorded SDK completion backport. Local Node was
24.10.0; the workflow pins Node 22.16. The artifact's script package was copied
into the isolated worktree's ignored staging directory; shared runtime files
were not repackaged or changed. Hashes were rechecked after execution:

- Loader SHA-256:
  `469a240495f2945052b4fdb6eacc7d72c27231ac68bbf8f323e3d9dcce18750b`.
- WASM SHA-256:
  `c75880a5ad8baf7a6e2f8194fde8679cb150f83a45a93b8ca18d56bc073b1f35`.
- Mounted script snapshot SHA-256:
  `6b655ae1a14546810fd52d0a64bb26a59d3d43f1b0eac2dd946fe430fb2d2acb`.

The first iteration's native identity comparison failed because its fixture used
placeholder native templates while the UI used installed synthetic identities.
That failed report remains at `/tmp/wasmsmac-coverage-setup-focused-1.json`.
Configuring the native fixture with the production header consumer corrected
the input mismatch without changing the assertions or production behavior.

`.github/workflows/coverage-setup-configuration.yml` replays all five suites on
relevant PR heads, including changes to its own workflow and related production
paths. It retains a report artifact and uses the existing reusable engine job.
These Stable cases therefore run in PR CI independently of the ordinary Hot
selection. CI and final-head review results are recorded separately at delivery.
