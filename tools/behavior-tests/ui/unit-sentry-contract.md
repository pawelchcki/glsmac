# Three-unit Sentry lifecycle

`game.unit_sentry_lifecycle.v1` observes actual L, H, Space, W, Tab and one
paused turn in the existing fresh Gaians/Citizen/standard three-unit fixture.
Scout Patrol, Former and Colony Pod start owned, healthy, unmoved and stacked on
one actual first base, Scout selected, on synthetic flat arid 40x80 terrain.
Pause at end is enabled; tutorials are off. Declared UNIT bonuses and the
independent original fixture are unchanged. No original state/instructions are
patched. Every case starts a fresh original process; two whole identical captures
are required before this is evidence.

Input is exactly `{profile: 'stacked', actions: [...]}`; at most twelve actions
and one `advance`. `sleep` presses the original L key named Sentry/Board Transport
in its installed ORDERS table. Other actions use real H/Space/W/Tab and Next Turn.
Eight independently repeated cases cover every nonempty subset of Sentry versus Skip across
three units, plus a Sentry Scout with held Former and Pod. Inputs contain no answers. Both whole captures agreed before freezing.

Output is `trace`, initial state plus every action checkpoint. Each state has
`year_delta` (integer turn difference), `selected` (actual role or null), and
`units` in Scout/Former/Colony order. Each unit has `role`, `order_code` and
`movement_spent`. Orders retain the read-only original public vehicle order-byte
ordinals 0, 1, 2 as protocol units. The reproduction may use any storage enum and
must explicitly convert its actual state into these protocol units; the contract
does not require identical internal representation. Movement is integer thirds.
All three positions, ownership, identities, health and flat/arid/nonfungus terrain
are guarded; unexpected movement or order types fail. Selected native identity
must agree with its actual visible unit name. No observation computes an original
selection policy or changes an order directly.

Scope excludes arbitrary unit counts/layouts, Sentry waking on enemies, boarding
or leaving transports, movement/combat, orders outside the three captured codes,
order-label wording, activation/cancellation of Sentry, work cancellation,
save/load and multiplayer.
Native readiness, controller selection and serialization application invariants
are separate regression responsibilities. This is not full-game parity.

The original strict browser probe left Scout selected with order code 0 after L,
while the original selected Former and recorded Scout order 1. That baseline is
preserved in `known-issues.json`. All eight frozen traces now match production
controls, actual native orders/movement and the shared selection controller in
display-free replay and through real browser input. Display, initial Scout focus
and notification delivery are declared replay boundaries; no expected order or
selection policy is supplied by the fixture. Browser checks use actual input,
native event transport and turn controls and save one final frame per case.

```sh
python3 tools/behavior-tests/ui/run.py --suite unit-sentry
SMAC_ASSETS_DIR=/path/to/installed/game npm --prefix tools/wasm-tests run test:unit-sentry
```

The `unit-sentry` regression suite separately checks native readiness, receiving
world serialization, guards, rollback and real popup blocking of L while a valid
unit is selected. These application invariants are not extra original observations.
