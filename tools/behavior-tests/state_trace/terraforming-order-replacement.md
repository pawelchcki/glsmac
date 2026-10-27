# Ordinary orders and manual terraforming replacement

Activate, Hold and Sentry first retire an active automation intent through the
same validated cancellation policy as the planner. They retain live owner,
unfinished turn, unlocked tile and identity checks, and do not invent movement
or require an automated unit to report manual `NeedsOrders` readiness.

Ordinary orders pause paid height work without refunding or losing its payment
identity. A true event rollback checks the current canonical unit, owner, turn,
position, plan, work, recovery, home and scalar state before any restoration.
It restores the complete original native order/plan/work context without a
new scheduler enqueue or a treasury operation. Existing non-automation order
semantics remain unchanged.

Manual primitive selection can replace a valid active plan. Selection, target
validation, replacement consent, and the entire current height quote are checked
before cancellation or debit. Height quote identity includes the actual plan and
home assignment. Starting a distinct accepted automation job abandons an older
paid height job immediately, with no refund. Draft, rejected and unconfirmed
intents preserve it. True transaction undo restores the previous paid metadata;
committed cancellation is not a refund operation.

Manual primitive receipts seal original and expected plans. Internal planner
steps retain their existing parent-owned plan and rollback authority. Failed
manual commits restore original plan/work/recovery/order/movement and refund
only a tentative debit belonging to that failed transaction.

The controlled before probe runs the same 23 regression cases and native
runtime with only the four ordinary-order modules restored from `00365c95`.
It executes the candidate and fails the first actual Activate-on-Automate call
at the native guard: `Cancel automation before assigning an ordinary order`.
`/tmp/terraform-worker-order-baseline/report.json` pins each overridden module,
the unchanged test hash, snapshot `aeab7558cde5b88b9cdaf168c71209f292f86246576bef447e220e0c9d3f803d`,
and raw Node exit 0. Native test failure is still a strict failure; process exit
0 is not treated as a passing behavior result.

The after report `/tmp/terraform-worker-order-integrated-first.json` passes
23 scenarios / 73 assertions on integrated host `40b0fa5b`, scripts snapshot
`158537deced53604d153e068a46722ce156d29a85f2b062f35cd1f32c83cb86c`.
Runtime v2 is native source `1d8f985a`, source tree
`d9b3494f2f91ccf234bc582a5dfb0858ff1dade3`, JS SHA256
`ceba448b2dfe37bac0501da8eb4435941b7fde478d51b11408ebc22f7a7b492c`
and WASM SHA256
`00c94f5e42985c3f408b71e14ed583b2cbe88e730ff03581546d1992b8a82fa6`.

The two named injected-failure cases replace only the terrain mutation boundary
with an explicit exception. Native reads, validators, units, all participating
player ledgers and rollback operations remain actual. They establish application
transaction cleanup after real intent retirement and finite debit, not an
original-game observation or a claim that ordinary rejected input reaches this
boundary. The fixtures retain their actual complete two-player native world;
the full seven-player trace and installed visual flows are separate gates.


Compatibility is recorded separately, without combining different script
snapshots into one passing total:

| Native check | Scenarios / assertions | Host and scripts snapshot |
| --- | --- | --- |
| Height | 21 / 75 | `85ddeadc`, `c39f9625c86aa179d34da445a03a8768cc39937a0a4de799d1725eb917f5cc9c` |
| Existing Former work | 30 / 60 | same `85ddeadc` snapshot |
| Ordinary order events | 8 / 175 | same `85ddeadc` snapshot |
| Sentry | 18 / 176 | frozen `b69105ce`, `d4719e2537093722c1c13871491ffbf71b0e83fab7e6d3b4884952e110ef52d7` |
| Activation | 16 / 164 | same frozen `b69105ce` snapshot |
| Sentry/activation selection flow | 4 / 180 | same frozen `b69105ce` snapshot |

Reports are `/tmp/terraform-order-compat-{terraforming-height,former-work,unit-orders-events}.json`
and `/tmp/terraform-order-compat-v4-{unit-sentry,unit-activation,unit-sentry-activation}.json`.
Every listed run uses the immutable v2 runtime above and strict native success
markers; the sequential driver records exit 0 for each passing worker.

The first legacy UI attempt failed because its isolated world had never bound
TERRAIN declarations. The next attempt reached its actual Former but found no
TileManager forwarder in the UI facade. Both prerequisite failures remain in
`/tmp/terraform-order-compat-unit-sentry.json` and
`/tmp/terraform-order-compat-fixed-unit-sentry.json`. The fixtures now parse the
existing explicit synthetic declarations with the production parser before
preview mounting, and forward the same canonical native TileManager already
supplying their units and bases. Source policy, native terrain and expected
order/selection outcomes were not altered; no production fallback was added.
