# Same-world base and research coverage

This batch adds seven application regression scenarios to three existing suites.
It adds no original-game observations or game-fidelity passing cases. Fixtures
contain two actual human players; the other five research slots are observed as
inactive state, not as simulated opponents.

## Added transitions

- Interleaved directed selections retain separate player receipts. A receipt
  with the other player's identity is rejected, while a valid older receipt can
  roll back independently of a newer request by another player.
- Completing one player's turn rejects that player's new research request while
  the other player can still select and undo a goal.
- Both players receive separate science credits in the same turn. Duplicate
  credits are rejected per player, and each receipt can restore its own state.
- Zero science still consumes that player's income stamp. Undo permits a
  positive retry without affecting the other player's credited income.
- Changing a target preserves earned science and the current income stamp.
  It cannot grant another credit in the same turn; the next turn can add income.
- Switching one city's project and undoing it preserves the other city of that
  owner and a city belonging to the other player in the same native world.
- Completing and undoing a facility in the other player's city preserves the
  separate mineral stores, facilities and ownership of both remaining cities.

Research observations compare all seven research slots, all 89 technology rows,
both live players' treasury states and production registries. Existing native
fixture snapshots check bases, units, RNG, allocation counters and owner state
at unchanged/rollback boundaries. City observations compare all three bases,
both registries and treasuries, unit identities and allocation counters. These
are state-transition assertions against the production native bindings and
shipped event handlers, with controlled inputs supplied by the existing fixtures.

## Local validation (2026-11-11)

Source base: `c0160cea41c091d659ffe0248c0d532f36bc8a01` (SDK repair PR #53).
The immutable engine comes from `pawelchcki/wasmsmac` CI run `43015901038`,
artifact `behavior-engine`; no application or SDK rebuild occurred for this batch.

| Runtime file | SHA-256 |
| --- | --- |
| Loader | `469a240495f2945052b4fdb6eacc7d72c27231ac68bbf8f323e3d9dcce18750b` |
| WASM | `c75880a5ad8baf7a6e2f8194fde8679cb150f83a45a93b8ca18d56bc073b1f35` |

Node was 24.10.0 locally; the dedicated workflow uses Node 22.16. The runner
loads this branch's current scripts into isolated filesystems with the matching
verified TypeScript package. Local checks ran with one worker and the existing
per-suite deadlines.

| Suite | Scenarios | Assertions | Latest passing local report |
| --- | ---: | ---: | --- |
| `research-native` | 11 | 95 | `build/base-research-coverage/focused-packaged.json` |
| `research-science` | 15 | 96 | `build/base-research-coverage/focused-packaged.json` |
| `production-switch-native` | 28 | 104 | `build/base-research-coverage/production-verified.json` |
| Combined bounded scope | 54 | 295 | Per-suite passing runs above |

The first launch stopped before scenarios because the fresh worktree lacked its
staged script package. After staging the matching package into the worktree,
both research suites passed. The production suite exposed two test-setup errors:
an array literal retained GSE object references, and the expected facilities
value used an ID array instead of the API's keyed descriptor object. The fixture
now calls the three base methods directly and expects the declared facility
descriptor. Initial failure and diagnostic reports remain under
`build/base-research-coverage`; no product behavior or original evidence changed.
These failed attempts are excluded from the passing totals.

`git diff --check` passes. The dedicated workflow YAML parses, includes its own
path in its PR trigger, and depends on the reusable engine producer. PR-head CI
and review results remain delivery gates, separate from these local observations.

## Reproduce and CI scope

With the prepared runtime and matching package available:

```sh
python3 tools/behavior-tests/fast.py \
  --runtime /path/to/GLSMAC.js \
  --suite research-native --suite research-science \
  --suite production-switch-native --jobs 1 \
  --report build/base-research-coverage/report.json
```

`.github/workflows/coverage-base-research.yml` executes all three suites on
relevant PR changes using the reusable engine and two bounded workers, then
uploads the report. This includes `production-switch-native`, which otherwise
belongs to Stable. Existing Hot/Stable membership and original observations
remain unchanged. No rendering, audio, AI research choice, network transport,
or whole-game fidelity result is established by these scenarios.

## Focused workflow configuration repair

The first PR run (`43023516765`, job `130535090697`) used a newly built engine
with loader SHA-256
`0b655ba6e925eefb1e73a934c8ef568ae795c584a36980f151e750375b26d161`
and WASM SHA-256
`0392db9b42ee84ae3769493c620a85cb7cdd01e74b1d358a9b78b1223f9a9409`.
It passed `research-native` and `production-switch-native`, but stopped
`research-science` after 30 seconds. The raw job log and report artifact
`13857275068` remain retained in `build/base-research-coverage`.

The new focused workflow invoked `fast.py` directly without the CI fallback.
The established lane dispatcher (`tools/behavior-tests/lanes.py:155`) always
passes `--default-timeout 120` for regression CI; the standalone CLI falls back
to 30 seconds (`tools/behavior-tests/fast.py:322`). The focused workflow now
passes the same 120-second fallback. It does not pass `--timeout`, so any
declared suite deadline retains precedence. No global or catalog deadline,
worker count, test input, scenario name or assertion was changed.

With the exact failing engine, Node 22.16 and two workers, the unchanged source
reproduced the 30-second failure locally after all fifteen science bodies and
96 assertions reached their summary, before required teardown completed.
Temporary fixture-retirement and staged-collection experiments did not establish
a reliable 30-second margin and were reverted; their reports are preserved
separately. These unsuccessful attempts remain excluded from passing totals.

The preparatory Stable selection plan's source fingerprint was refreshed for
the added test files. Only `inventory_sha256` changes; `dependencies_reviewed`
remains false, and coverage selections and original observations are unchanged.
The selector and lane unit checks pass (39 tests).

The final same-input replay, with the established fallback, passes all three
suites: 54 scenarios and 295 assertions in 31.58 seconds; `research-science`
takes 31.54 seconds. It uses the exact failing CI engine, Node 22.16, two workers
and no explicit timeout override. The loader, WASM and frozen script hashes
match the 30-second reproduction. The frozen script SHA-256 is
`5c7379335b3f2d854c46d0daba6ec879ecde217b11a37094fc1a18a8097b559e`.
Ordered scenario names and per-suite assertion counts also match the earlier
passing local reports. No GSE bytes changed from coverage commit `db60da5a`.
The final report is
`build/base-research-coverage/node22-ci-engine-matching-policy.json`.
