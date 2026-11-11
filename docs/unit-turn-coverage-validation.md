# Unit command and turn regression coverage

This batch adds 24 application scenarios and 200 assertions to three existing
suites. It adds no original-game observations or rendered/browser parity claim.
No production rules, native bindings or expected reference records change.

## Added behavior

- Hold, Sentry, Activate and Skip each run for both actual native participants.
  Every native unit is observed before and after; the other player's Scout and
  the companion Colony Pod retain their complete captured state. Undo restores
  unit/base serialization, native turn, and every active player's completion,
  energy, research-target and science observations.
- Successful validation does not authorize a later apply after native death,
  tile locking, player completion or game deactivation. Every handler refuses
  without changing the post-transition snapshot or RNG/ID/update/event queues.
- Two players' accepted receipts can unwind independently. Two overlapping
  receipts on one unit must unwind in state order; an older receipt cannot
  overwrite its successor. Ordinary order undo refuses later movement, health,
  morale, movement-history, turn and order changes. Receipts from a retired
  world cannot change its replacement.
- Native turn delivery restores movement for both owners while retaining Hold
  and Sentry. A moved unit does not heal on the first advance; the cleared
  movement-history flag permits healing on the following advance. Every unit's
  turn-ready event observes restored movement and cleared movement history.
  Readiness remains owner-specific and read-only.
- A new ready native unit invalidates an already scheduled automatic completion.
  Its own accepted order can arm completion again. Manual completion before the
  callback cannot complete the next turn, while a new next-turn order still can.

The two-owner cases use the existing fixture's economy initialization to install
a real player in slot zero before spawning that player's Scout. A unit labeled
with an otherwise empty slot is not treated as a second participant. Native
manager wrappers are reacquired after turn callbacks so observations do not read
scalar values cached by an earlier setter.

## Verification (2026-11-11)

The immutable CI engine was compiled from SDK repair head
`c0160cea41c091d659ffe0248c0d532f36bc8a01` by workflow run
`43015901038`. Fresh host scripts execute without relinking. Runtime SHA-256:

| File | SHA-256 |
| --- | --- |
| GLSMAC.js | `469a240495f2945052b4fdb6eacc7d72c27231ac68bbf8f323e3d9dcce18750b` |
| GLSMAC.wasm | `c75880a5ad8baf7a6e2f8194fde8679cb150f83a45a93b8ca18d56bc073b1f35` |

Command from the coverage worktree:

```sh
python3 tools/behavior-tests/fast.py \
  --runtime /tmp/wasmsmac-coverage-runtime-nov11/GLSMAC.js \
  --suite unit-orders-events --suite unit-orders-native \
  --suite automatic-end-turn --suite unit-orders-controls \
  --suite turn-playability --jobs 1 \
  --report /tmp/wasmsmac-coverage-units-focused-7.json
```

| Suite | Scenarios | Assertions |
| --- | ---: | ---: |
| unit-orders-events | 29 | 350 |
| unit-orders-native | 20 | 133 |
| automatic-end-turn | 6 | 36 |
| unit-orders-controls (unchanged adjacent coverage) | 9 | 82 |
| turn-playability (unchanged adjacent coverage) | 27 | 108 |
| Total | 91 | 709 |

All five pass in 26.24 seconds with one worker. The dedicated
`coverage-unit-turns.yml` workflow executes these suites on relevant PR changes,
including the two expanded suites otherwise assigned to Stable. It downloads a
successful reusable engine and retains the actual current-head report.

Initial local iterations retained failures from unavailable fixture helpers,
cached wrapper observations, a missing second player, and the native morale
setter's required Float input. Those fixture corrections preserve the expected
behavior above. Their reports remain separate from passing totals. The first
attempt stopped before candidate execution because the local script package had
not yet been copied from the immutable engine artifact.

## Limits

These cases observe the two actual participants supplied by the compact native
fixture. They do not establish seven-faction gameplay, AI decisions, network
transport, rendered timing, every terrain/technology ownership field, or full
sound/video transitions. Automatic-completion cases explicitly use the existing
isolated-human startup fixture and controlled owned timer delivery. Skip undo
has identity/lifetime coverage here; the ordinary-order stale-state matrix
applies to Hold, Sentry and Activate.
