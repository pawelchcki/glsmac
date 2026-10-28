# Cached unit priority: actual before/after proof

A real candidate HUD mismatch was reproduced before the fix, then the exact same
witness passed on the rebuilt runtime. The [proof manifest](unit-stack-order-proof-v1.json)
pins both source/runtime/raw hashes, identical test/observer/world inputs, asset
manifest and complete native guards. No original behavior or rendered map unit
identity is claimed.

| Execution | Native source | Node/app exit | Mounted HUD after A Holds and tile reselection |
| --- | --- | --- | --- |
| Baseline `b54b5a99`, runtime v6 | `115032ff` | 1/0 | A8, while current source priority requires B9 |
| Fix `2f779b2f`, runtime v7 | `829148fb` | 0/0 | B9, as required |

The baseline completed in 48.285 seconds and the fixed run in 50.435 seconds, both
within the same 180 second budget. Each produced three immediately serialized
native world boundaries covering seven players, seven bases, nine units and 128
terrain tiles. Both accepted the actual opaque String Hold receipt, observed a
new native map preview after the controlled action, then another actual tile
select/preview and matching mounted Widget/label identity. Only A's legitimate
NO_ORDERS→HOLD changed. Every complete native world at the corresponding boundary
also matches exactly across the two runtimes after excluding only the UI
observation field. Source weights remain A=272/B=270 before Hold, A=72/B=270 after.

The cause was two lazy tile ordering caches retained across priority changes.
Rendering already computed a fresh ordering, while selection/preview queried the
stale cached ordering. The fix centralizes invalidation of both unit/object
orderings, preserves existing Add/Remove behavior and invokes it after frontend
`Unit::Refresh` recomputes activity, before rendering/previews. No weight, tie,
explicit-selection, case, expected ID, asset, cost or world rule was changed.
The new placement also covers health-driven priority changes by construction;
that separate dynamic case has not been executed and remains future coverage.

The rebuilt Emscripten 4.0.22 FastDebug runtime used an isolated source/build/cache
and two compile jobs. The build exited 0 in 284.614 seconds; options/defines matched
v6 and static browser shell files remained identical. Runtime v6 and its failing
evidence were preserved. Runtime v7 hashes, toolchain/flags/link/cache provenance
and the full build log are retained in the manifest's provenance path.

Both runs required actual application exit 0, no native/browser fatal error,
main plus eight worker continuations, correct runtime output/callMain bindings,
contiguous raw chunks and complete sealed logs before evaluating priority.
The baseline Node 1 is an evaluable guarded mismatch, rather than setup or exit
failure. All browser/server/build/driver processes were reaped and leases released.
There were zero physical game inputs: declared public native selection/Hold
requests and normal `glsmac.exit` drove this controlled fixture.

Original selection policy, map instance identity, artwork/facing, intermediate
movement frames, tool/limb clip binding, cadence/audio and a direct frontend
request-cause ID remain unsupported. Native callback provenance is source-backed;
the actual callback, Widget payload and complete worlds are directly recorded.
No original passing cases, map/body pixels or animation agreement are added.


## Current acceptance scope

Historical “complete native world”/“complete typed world” wording and `same_complete_native_world: true` mean equality of every retained field in the compared observer projections, after only the documented UI exclusion. They do not establish complete entity-detail identity. The old JSON keys and values remain immutable historical evidence.

The retained legacy metadata does not prove independent raw identity for every unit/base detail object or exact message identity for every print callback. First-callback runtime output binding and the sealed raw byte/chunk relation remain supported within their recorded scopes.

The old RED/new GREEN priority-cache witness, actual native order/health receipts, mounted HUD/Widget identity, all-seven-owner field comparisons and Float32 checks remain bounded evidence. Historical scoped strict-pass results and actual process/application exits are unchanged. An evaluator’s `complete: true` still means completion of its stated bounded protocol; it is not generic complete-browser credit.

[unit-stack-current-acceptance-scope-v1.json](unit-stack-current-acceptance-scope-v1.json) records `candidate_executed: false`, no new observations, and current completeness credit of zero complete worlds and zero full-browser passing cases where those missing capabilities are mandatory. This is a source/documentation clarification, with no new game, test, capture or runtime execution and no retroactive change to old proof JSON or counters.
