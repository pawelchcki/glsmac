# Emscripten synchronous completion validation

The browser SDK remains Emscripten 4.0.22, with the two ordering changes from
upstream commit
[`f3fef05bf5d63df33ed21eb067b86d827c546bfa`](https://github.com/emscripten-core/emscripten/commit/f3fef05bf5d63df33ed21eb067b86d827c546bfa)
(PR #26582). Both normal completion and cancellation now signal the condition
before releasing the context mutex. No other SDK source changes are applied.

`tools/prepare-emscripten.py` checks the version and full `proxying.c` SHA-256:

| Input | SHA-256 |
| --- | --- |
| Original 4.0.22 | `cbae5a9736353234d3991e19ca74ce5779fe0f7eb45a35e10f7cc2b2622b8c00` |
| Backported source | `848d2f47c840a48d583734bc7fef9565599187cd63fa61ab1b0c6529edb2a01c` |

It acquires the SDK cache lock, clears the configured cache, then atomically
publishes the source. Unknown versions/source and failed cache invalidation
cannot publish a patch. Repeating preparation on the recognized patched source
preserves rebuilt libraries. Existing application binaries still require a relink.
All four CI SDK installation paths run preparation; the reusable engine cache
key is incremented and includes the preparation script.

## Focused evidence (2026-11-11)

- `python3 -m unittest discover -s tools -p test_prepare_emscripten.py -v`:
  six checks cover cache invalidation, idempotence, version/source refusal,
  invalidation failure and interrupted publication/retry.
- `tools/wasm-tests/proxy-context-lifetime.c` calls the real SDK synchronous
  proxy API. Linker wrappers pause completion after its mutex unlock until the
  caller returns. The signal wrapper records a notification after that return
  without dereferencing the expired context. SDK queueing and context state
  transitions are not replaced by a synthetic implementation.
- Unmodified SDK: the executable exits 1 with
  `PROXY_CONTEXT_RETIRED_BEFORE_SIGNAL`.
- Prepared SDK: the executable exits 0 with
  `PROXY_CONTEXT_LIVE_DURING_SIGNAL`; the Node integration assertion passes.
- The Node integration assertion also passes with CI's Node 22.16.0.
- Local host Node 24.10.0; CI uses Node 22.16. The probe is compiled with `-O0
  -pthread -sPROXY_TO_PTHREAD=1 -sPTHREAD_POOL_SIZE=1 -sEXIT_RUNTIME=1` and linker
  wrappers for mutex lock/unlock and condition signaling. Execution has a
  ten-second timeout.

The preserved activation-policy worktree was relinked against the prepared SDK,
then passed the normal TypeScript packaging step. All nine focused production
suites passed: 82 scenarios and 1,044 assertions, in 47.38 seconds with two
workers. These cover activation, order controls/events, menus and the TypeScript
boundary. This runtime includes the unfinished activation-policy slice based on
`7869c41efc23ea94f47509dc8eb5f826cdc02b01`; it is supplementary local evidence,
not a build of this repair's final PR head. Its WASM SHA-256 is
`72eb4812b6a3682746f3143bfb78d9722317b49e8850925adc606e41ba897350`.
The loader SHA-256 remains
`43e5e01d33e0a92cc3abd9f6c877658e8dff624f58632318152d262d4a9366b3`.
The first post-relink replay stopped before scenarios because the manual link
had omitted packaging; that report remains recorded separately.

## Retained application failure

Before this backport, an activation-policy benchmark recorded
`RuntimeError: operation does not support unaligned accesses` in a control
scenario. An identically linked debug copy placed the frames in the SDK's
completion/condition-signaling path. Immediate unchanged main-adapter and
candidate-adapter replays passed, so the original trap is intermittent.

The controlled SDK probe establishes the upstream ordering defect and verifies
its repair. It does not prove that this defect caused the earlier game trap, or
that every threading path is correct. Cancellation receives the upstream change
but has no independent dynamic probe here. The original failed benchmark and
runtime remain retained outside the passing totals.
