# One Former Action-menu Sentry sequence

This historical pilot is superseded by the complete [twelve-case reference](unit-menu-context-contract.md). Its case/gold bytes remain unchanged in the pilot archive catalog and contribute no duplicate active cases. Historical baseline/replay results below retain their original scope.

The archived pilot reference `unit-menu-context-former-sentry` contains exactly one accepted
`ui.unit_menu_context.v1` input: `unit-menu-former-slot-26-synthetic`. Its cases
and observations are unchanged copies of the accepted pilot, recorded in two
identical independent original runs. The original observer fingerprint and all
input/output fingerprints remain intact.

The declared healthy, unspent Scout, Former and Colony Pod share the owned
one-Doctor city. Actual Tab selects the Former, MENU opens the root, header four
opens Action, source slot 26 receives one real click, and a final Tab advances
selection. The initial state and every action are retained: one case, six complete
checkpoints. Both applications consume the declared synthetic menu/TERRAIN input.
City/unit identities, ownership, positions, membership, health, stores, citizens
and year are guarded; movement is reported in thirds of one movement point.

The original Former child has twenty ordered rows: sixteen light text buttons
and four separators. Labels come from the supplied source, with the additional
source slots 2, 8 and 25 absent relative to the recorded Scout presentation.
Source slot 26 applies Sentry without spending movement, selects the Colony Pod,
closes the child and clears its highlight while retaining the root. The final
Tab closes the root and selects the Scout. These are recorded outputs, not schema
rules or adapter-supplied command effects.

Strict production/native display-free replay and actual Chromium pointer/SDL
input both matched all six checkpoints. The browser observer records native row
Show/Hide calls only after successful completion, by actual node identity. Hidden
rows emit neither presentation rows nor pointer targets; a real click requires
native hover delivery and the actual source-row identity. This observes visibility
commands and real input, with a retained screenshot; it does not independently
read native visibility state or assert pixel, clipping or occlusion equivalence.

```sh
# Evidence integrity only; executes neither application.
python3 tools/behavior-tests/ui/run.py --suite unit-menu-context --case unit-menu-former-slot-26-synthetic --validate-only
# Strict candidate replay, using current host production scripts.
python3 tools/behavior-tests/ui/run.py --suite unit-menu-context --case unit-menu-former-slot-26-synthetic --jobs 1
# Actual browser replay of this pilot only; requires installed assets/runtime.
npm --prefix tools/wasm-tests run test:unit-menu-context-former-sentry
```

The full [twelve-input context reference](unit-menu-context-contract.md) now
supersedes this pilot and the other two pilot entries. Its twelve cases match
strict native replay; five selected context cases have browser verification.
Other initial orders, spent movement, active work, commands and turn effects
remain outside the bounded contract.
