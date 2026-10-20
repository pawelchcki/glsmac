# Bounded Sentry activation picker traces

`ui.unit_sentry_activation.v1` starts a fresh healthy owned Scout Patrol, Former
and Colony Pod, stacked at the actual first Gaians base on flat arid land under
Citizen/standard rules. Pause at end is enabled and tutorials are off. The three
input preparation commands use real L/H/Space from the fresh Scout-selected
state. No original native state or instructions are patched.

Input is exactly `{profile: "stacked", setup: [three commands], actions: [...]}`.
Preparation accepts sleep/hold/skip. Actions open the actual A picker, navigate
with arrows, cancel with Escape or confirm with Enter, then optionally use W/Tab.
The four input sequences probe cancellation, Sentry activation, an exhausted
mixed Sentry/Skip stack, and activation from a mixed Sentry/Hold stack.

Output is an initial checkpoint after preparation plus each action checkpoint.
Each state records year_delta, actual selected native role or null, actual picker
or null, and the three actual units in Scout/Former/Colony order. Each unit records
role, original public order-byte ordinal 0/1/2, and movement_spent in integer
thirds. Picker records actual visible normalized caption, ordered role names and
highlighted role. The visible selected-unit name cross-checks native identity
whenever the picker is closed. Positions, identities, ownership, health and
terrain are guarded; unexpected movement or other order codes fail. Two whole
independent original captures agreed before freezing these inputs and observations.

Scope excludes other unit counts, arbitrary layouts, icon clicks, reopening,
order-label wording, turns, enemy waking, transport boarding, work cancellation,
save/load, multiplayer and full-game parity. Recording alone establishes no
reproduction agreement. Candidate claims require display-free and actual browser
replay.

All four frozen traces now match display-free native replay and actual browser
input. The strict browser baseline preserved in known-issues.json showed W
clearing internal focus without notifying the script UI, leaving Colony selected.
Production navigation now publishes actual tile selection when exhausted focus
clears. Display-free replay executes that same notification delivery method;
rendering and event boundary callbacks remain declared test boundaries. No
reference selection policy or expected order is supplied by the fixture.

```sh
python3 tools/behavior-tests/ui/run.py --suite unit-sentry-activation
SMAC_ASSETS_DIR=/path/to/installed/game npm --prefix tools/wasm-tests run test:unit-sentry-activation
```

The native regression suite separately checks exactly one tile notification,
no duplicate notification for subsequent idle Tab and retained focus for a later
A picker. Reopening is an application invariant beyond the original trace scope.
