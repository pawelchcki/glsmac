# Static cached unit-body census: first actual proof

The first actual case passed on source `b862930e706ac516c011c14a6eba5d60db99ada1`:
Node test one pass/zero skips, genuine OS child return 0 after wait, and actual
application exit 0. The external driver recorded 33.393 s through child wait and
cleanup; the Node test reported 33.267 s. No second run occurred. Independent
Delivery retained-raw audit also passed without a rerun.

The [machine manifest](unit-body-census-proof-v1.json) records every source,
runtime, input and raw-evidence checksum. All local execution artifacts remain
in `/tmp/unit-body-census-browser-v1`, including actual process command/PID,
OS exit status, retained node output, before/after worlds, raw census strings,
canonical hook receipts, exact chunk ledger and observed cleanup identities.
The execution checkout is `/tmp/wasmsmac-unit-body-census-browser-v1` at b862.

## Version and failure history

The approved observer adds exactly seven C++ paths on PR37 base
`810c9038646cfa0b416ec7bdb566d700d8354018`. Initial source `f0dae99a` used a private
frontend getter; its first compiler exit 2 at 309.108 s remains preserved in
`/tmp/unit-body-census-build-v8`. Reviewed correction `11532fef` uses the existing
public backend getter only after the stable owner-thread and non-null readiness
guards. Corrected native source tree:
`23e54d08b7dbb00f6b42d325c180a8c868b30ee2`.

Delivery built immutable v8 once after that correction: exit 0, 311.590 s;
`/tmp/wasmsmac-unit-body-census-runtime-v8/provenance.json`, SHA-256
`5c847aaf39f28b2eec66970f9122ecca4ef33e58d7ed6b558701c8de32181619`.
JS is `32446906441924bb1b1ad7a505682757c590ef8ebdcacd186a0e3fd259d8bea1`;
WASM is `cdc6d8f29400451fdca33a60909a24ad62b3c04b5bacbb2123006ca619177a22`.
The 14 static shell files retain their v7 bytes; old v7 remains intact. Native
Default remains `a69dd4e0a9620f90bd12c8eb8636ca22e24ed47c`.

The external executor's first source review found a split-UTF16 surrogate audit
bug before any game launch. Its original source/preflight remain retained. The
reviewed corrected driver is `/tmp/unit-body-census-browser-v1-run.py`, SHA-256
`c2a13e032241914ebb7d8e6744dbb78a601b374ba2fd3eb95e35301c3547f080`;
executed preflight SHA-256
`0fbbdaa989b2ba465de3a26b42a7f9863e4f70fc9cd617b070724b2fa51a3af5`.
Six no-child executor checks include split-emoji success and malformed/missing,
reordered, wrong-offset and wrong-text rejection. This repair did not alter the
fixture, runtime, inputs, read order, seal or expected game observations.

## Actual observations

The established seeded installed-source fixture contains seven owners, seven
cities and nine Scouts on a declared 16×16 map, with 128 actual staggered tiles.
Manifest ID is
`12743b42e275842a7ae3862572ec769c6d86f647394f0edb1ff9db6d104888e3`.
The local base-free stack is (8,8), actual unit IDs 8 and 9 with morale 2/1.
No physical input, Hold, health change, combat or movement occurred.

After the ordinary Native readiness focus and tile-selection request at event
fence 9, actual tile-select callback 10 was followed by new Native map-preview
callback 11 for unit 8. Mounted Widget payload and rendered HUD identity both
bound unit 8, with explicit-unit selection null. The next application timer
callback captured the immediate native world, made two synchronous census calls,
and immediately captured the complete world again. No event-prefix or mounted
identity change occurred during that boundary.

Both Native String census results were byte-identical. They contained all nine
actual unit/owner/definition rows. Owner 0 had three units; owners 1–6 each had
one. Exactly one body was present/submitted and eight were absent/hidden. Each
absent row retained its real allocated instance ID. **No unallocated row occurred
in this runtime case**; that distinction has synthetic decoder coverage only.

The selected body bound real unit 8/owner 0/definition `ScoutPatrol` to cached
resource `Unit_ScoutPatrol [ 79 501 ] [ 38 48 ]`, actual resource-scoped instance
ID `2`, filename `/smac/newicons.pcx`, atlas (79,501,38,48). The resource and
filename came from native cached objects, not an expected model or asset guess.
Cached sprite count stayed 1→1; actual instance map count stayed 1→1. The second
read preserved every identity, descriptor, visibility flag, coordinate and count.

| Native field | Float32 text | Actual bits |
| --- | --- | --- |
| Unit render x | 0.25 | 1048576000 |
| Unit render y | -0.25 | 3196059648 |
| Unit render z | 2.12971425 | 1074285885 |
| Actual destination y offset | 0.400000006 | 1053609165 |
| Stored instance x | 0.25 | 1048576000 |
| Stored instance y | 0.150000006 | 1041865114 |
| Stored instance z | 2.12971425 | 1074285885 |

The validator checked native Float32 normalization using those actual offset
bits. It did not confuse logical unit coordinates with the stored instance
position. Stored instance angles were zero; this is renderer data, with no
claimed gameplay facing or animation interpretation.

Both complete native worlds passed the strict terrain schema. All seven players,
seven bases, nine units, all resources/quotes/locks/terrain fields and 128 tiles
were equal before/after. Actual Int entity/owner types and each unit's health/
movement Float32 types/bits were independently checked and unchanged. Hidden
and foreign native units were included; no viewport/selection filter was used.

Independent audit: `/tmp/unit-body-census-browser-v1/independent-delivery-audit.json`,
SHA-256 `5838b41089fe50421531dcb6b3c96c6ff71a955b89438d25e480494d2be5d202`;
reproducer `/tmp/unit-body-census-independent-delivery-audit.py`, SHA-256
`191bf23678539a3641cf859f49bf124a350d3be3431d934a8b2edc026eb9ec64`.
It independently checked the raw typed worlds, 102 body Float32 value/bit pairs,
actual resource/owner/instance relations, normalization, full-world purity,
real OS exit/wait and scoped teardown. It executed zero new games.

## Exit, transport and teardown

Actual Node child PID/session was 1149072. `Popen.communicate` completed its OS
wait with returncode 0. The frozen browser harness independently observed normal
application exit 0. Canonical one main/eight distinct worker hook acknowledgements
and real output/error/callMain bindings were required before evaluation.

Raw log contains 630,688 UTF-8 bytes in 216 UTF16-contiguous chunks, SHA-256
`2a6745fccfec386adcae44b0d5b87bc2a1fdc3e2ef85a87b405ffec6d9355ab0`.
The producer closed, cursor sealed without a settled failure, normalized joined
chunk text equalled raw text and all raw hashes agreed. The external executor
replayed the strict evaluator from the retained raw log and required the same
proof as the in-process evaluator. Source/runtime/binary/fixture bindings were
unchanged after the run. No screenshot was attempted or required.

The owned asset server PID 1149096 received SIGTERM and was waited by Node;
browser close completed. The Node process group was absent before any forced
cleanup, and all 13 actually observed owned process identities were absent after
wait. No forced signal cleanup or timeout occurred. Visible `/proc` sampling
and start-identity checks were used; exhaustive host descendants remain
unsupported. No lingering-worker claim extends beyond those actual scopes.

## Limits and delivery

This establishes a current native cached submitted-body association and normalized
position, not a GPU pixel/frame result. Camera/projection/world copies/occlusion,
movement/cadence, gameplay facing, action clips, leg/tool/limb animation, audio/
music/video transitions and original-game appearance/policy remain unsupported.
Cross-session continuity, same-pointer stale-session rejection and runtime
wrong-thread/different-game/teardown negative cases were not exercised. Native
1,024-unit/4 MiB bounds were not stress-tested by this nine-unit case.

There are zero original passing cases. The clean one-Scout original exploration
still only supplies future observation questions. Pure coverage is separate:
18 decoder + 11 proof tests, 20 existing terrain-schema tests and six external
executor tests; none adds a Native passing case. The no-assets launcher skip
remains outside game totals.

Intended isolated graphics delta for Delivery: `f0dae99a`, `11532fef`, `b862930e`
and this docs-only proof handoff. Port only these additions onto the actual PR37
successor; do not replay inherited P2/Workshop history. Shared CI/catalog/lane
registration remains Delivery-owned. No identical browser or build rerun is
needed for this documentation-only addition.


## Current acceptance scope

Historical “complete world” and “complete native worlds” describe the full retained observer field projections and their equality. Actual census/scalar unit-ID joins remain supported, but they do not supply the missing independent raw unit/base-detail identity echoes for complete entity/world credit.

The retained legacy metadata does not prove independent raw identity for every unit/base detail object or exact message identity for every print callback. First-callback runtime output binding and the sealed raw byte/chunk relation remain supported within their recorded scopes.

The static census/resource/instance association, actual nine-unit ownership/definition joins, two-read purity,102 body Float32 pairs, recorded all-seven-owner fields and mounted HUD identity remain bounded evidence. The actual static-census test pass and Node/application exits are unchanged. An evaluator’s `complete: true` still means completion of its stated bounded protocol; it is not generic complete-browser credit.

[unit-body-census-current-acceptance-scope-v1.json](unit-body-census-current-acceptance-scope-v1.json) records `candidate_executed: false`, no new observations, and current completeness credit of zero complete worlds and zero full-browser passing cases where those missing capabilities are mandatory. This is a source/documentation clarification, with no new game, test, capture or runtime execution and no retroactive change to old proof JSON or counters.
