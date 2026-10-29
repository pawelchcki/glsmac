# Unit-order UI controller migration

The production unit panel and Action menu use
`scripts/ui/unit-orders.ts` for pending-result matching, successful completion
selection, activation-dialog context validation and menu closure. The domain
schema generates matching C++/TS validators for copied values. Unit and player
identities retain signed int64/BigInt semantics, including values beyond Number's
safe integer range.

The GSE adapter normalizes malformed raw event names, caller/unit identities,
work/automation details and success flags to explicit null values. Unrelated,
malformed and foreign results retain the pending UI state. Matching failures
release pending controls without selecting a unit. Successful activation retains
the selected/focused identity; other completed orders preserve a later selection
and use the existing native ready-unit/tile fallback.

Native callback tokens and inactive-world guards run before dialog observations.
Native live-unit lookup, owner/health/lock/position and choice checks retain their
authority. Rendering, event submission, actual selection effects, retirement
controllers and backend mutation/rollback retain current host ownership. The
adapter pins package identity across result matching and subsequent UI policy.
These scalar observations rely on existing native identity/lifetime checks; the
generation-bearing command API and complete TS action lifecycle remain open.

## Verification

The new TS suite has 138 checks for all six current completion families,
failure/unrelated/malformed results, exact large identities, selection changes,
stale dialog context, menu/modal state and contract rejection. The actual C++
runtime executes those checks on native and WASM. Two GSE boundary scenarios
add the policy run and direct malformed-event adapter checks. Existing UI,
lifecycle and original observations remain unchanged.

Type checking, type-aware lint, formatting and all ten package pipeline tests
pass. All four native CTest probes pass. Focused harness checks pass 59 tests.
The first focused WASM run passes nine suites, 81 named scenarios and 863 native
assertions. Three adjacent retirement/recycling suites hit their unchanged
30-second deadlines after their emitted scenario assertions. The previous Main
UI reproduces all three deadlines on the identical WASM/package. Those failures
remain separate from passing totals. After adapter cleanup, all nine selected
native lifecycle scripts pass again.

## Timing and remaining checks

Three alternating-order samples use the same compiled WASM, current TS package
and frozen fixtures, with only the two UI consumer modules restored from Main
for the legacy variant. Both variants pass identical assertions. Raw timing,
runtime/source hashes and retained failures live under `build/scripts`.
For the initial adapter, observed process-plus-test medians are 7,470.35/9,789.23 ms for legacy/TS order
controls and 24,574.12/23,880.14 ms for activation. These samples establish no
speedup claim. A second trial after simplifying normalization observes 8,565.62/9,483.84 ms
process-plus-test medians and 5,661.93/6,564.13 ms between first scenario and
summary for legacy/TS controls. Shutdown time also varies. The binding adds
execution/copying cost; these local samples are not whole-game performance.
Both versions of that fixture already exceed the initial five-second feedback
target. Native sanitizer and WASM/Chromium probes are CI delivery gates; real
production browser traces are a separate installed-asset check.
