# Terraform action capture

`terraform_actions.py` executes 36 isolated candidate-only cases: the 19 playable
land actions, seven enabled sea variants and ten compound commands. Monolith is
structurally disabled. The 29 visible source menu rows are not a count of domain
variants or completed actions.

One bounded case:

```sh
python3 tools/behavior-tests/state_trace/terraform_actions.py \
  --runtime /path/to/immutable/GLSMAC.js --case land:farm \
  --artifacts /tmp/terraform-actions
```

Omit `--case` to execute all 36 sequentially. Each worker gets a fresh native
seven-player 16×16 world, declared source rates of one turn, the real persisted
technology-waiver policy, an authored treasury budget and a capable land or sea
worker. Input setup finishes before the baseline. Mounted production menu rows
produce scalar event requests; the explicit display-free transport then runs the
actual event validator/apply path. Native display geometry, hit testing and SDL
delivery are separate browser checks.

Every case captures all seven owners, registered units/cities, identities,
research, balances, full-map height/corners/canonical state, terrain classes,
flags and construction owners, per-owner resources, work/automation, current
movement quotes and mounted selection/modal state. Begin/end manifests and
unique domain/row IDs make missing chunks an error. Native snapshots and queue
inventories fence read purity. Quotes remain distinct from actual command debit
and movement. Animation duration, audio and original height bytes stay explicitly
unsupported.

Primitive checkpoints (four observations) are `before`, `queued`,
`acknowledged`, and `after`.
Height adds pure `quote`, `cancelled-quote`, and `draft-payment` checkpoints
(seven observations total) before
authoritative confirmation. It records the actual height/fee policy identifiers,
full consent envelope and paid native work state. Same-order price/terrain/owner
changes invalidate consent; no process-local UI session identifier enters the
peer-compared event.

Compound commands add `exercised` (five observations total), then explicitly
cancel through the normal
authoritative plan event. Their completion binding says
`bounded-exercise-and-cancel`; it never claims map exhaustion. The separate native
automation suite must prove completion and effects for all ten commands. General
damaged/cooperative work, partial movement/rates, save/load, payment undo, sea
production, neighboring effects and representative traversal remain separate
completion gates in the master ledger.

Each `<case>.json` retains the exact runtime JS/WASM, worker, host snapshot and
generated fixture digests, complete stages/inventories and exhaustive observed
deltas. `<case>.log` preserves both passing and failing native output. The final
`manifest.json` uses `game.terraform_action_capture.v1`; it distinguishes selected
cases, successful application checks and the full inventory. Every report has
zero original passing cases. Source-guided functional height and automation
policies do not establish original agreement; immutable original observations
must be compared separately without tolerances or edited expectations.

The producer requires native script staging API v1. It registers stable outer
phase callbacks around one live fixture, native unit and mounted scene. Each
observation returns through an ordinary top-level accumulation boundary before
the next explicit action. Those boundaries collect finished invocation locals;
they never process game events, timers, turns or RNG. Full quote/draft captures
stay rooted only until the next real Cancel/confirm detachment check, and are
cleared before the next observation. The initial detached actor movement stays
as an exact Float scalar rather than retaining the entire first snapshot.

Owned-view cleanup is registered before setup and runs on failure as well as
success. The staged scenario cannot print its passing footer until all phases,
cleanup and normal Finish succeed. Cleanup/Finish must preserve the final native
graph, RNG and event inventory. An old runtime fails the explicit capability
check; it cannot silently fall back to one accumulation or omit trace fields.
The packet schema, order, case-specific observation counts, requested initial
seed and actual startup receipt remain unchanged.

Current functional execution uses immutable runtime v6, native tree
`115032ffc7f53ff7f0c3a9f997da12674e25e643`, with cooperative, normal-map and
capacity proofs linked in [the current smoke runbook](terraforming-pr2-smoke.md).
The specific staged-lifetime and fixed-input memory comparison below retains
its original v4 source/runtime identities.

The staged producer is verified on the immutable private runtime v4, native source
`99976bc17b8218e7c1de18c57887df11ac097e9e`, against source `ade25925`
(the initial delivery checkpoint `9b549646` has the identical complete tree).
Runtime JS SHA-256 is
`48b70b1a4eb834687755850b3df54293701382dc81bfa6312e751200d401ec8c`;
WASM SHA-256 is
`62406811649411ff044183fe0b7d491f489443557939ffffda97cf27c52dd775`.
The runtime provenance file distinguishes compiled native source from the full
GSE snapshot supplied to each worker.

Actual native safety tests pass 23 cases, including the five staged lifetime,
cleanup and failure cases. The live-world staging script passes 1 scenario / 15
assertions; terrain, automation, work codec and asynchronous compatibility pass
110 scenarios / 383 assertions across five suites.

A matched fixed-input height comparison restores only the old producer in the
baseline. All 138,158 typed fields, including 2,916 exact floating-point fields,
match across the same seven observations. The old producer completes its body
then fails shutdown with process exit 1 at 2 GB. The staged producer completes
all seven observations, cleanup, Finish, native invariants, END and the normal
passing footer with process exit 0 (1 scenario / 28 assertions). Sampled WASM
capacity remains 481,165,312 bytes at every observation; measured peak process
RSS is 1,046,376,448 bytes, compared with 2,712,276,992 bytes for the failing
baseline. Capacity and process RSS are distinct measurements, not live-object
size or a general large-map bound. Raw baseline failure remains outside passing
totals. Artifacts: `/tmp/terraform-pr2-staged-memory-v4`.

The complete matrix on that frozen v4 source/runtime subsequently passed all
36 cases / 680 assertions, 166 observations, 1,162 owner snapshots and 21,248
tile rows; every native process exited zero. The manifest is retained at
`/tmp/terraform-pr2-full36-staged-v4/manifest.json`. This is the declared 16×16
fixture, not original agreement.

The current production source (`25ef18d3` default scripts, `115032ff` native)
also passed the complete matrix in PR35 CI on head `0b419a29`, run
`40515414432`. Artifact `12743685282` has SHA-256
`220bb967eaa9718c5cbb8440fadc7fd445ec9e7b78f112232cd49501983b2b7b`.
Independent replay of all 36 raw logs confirms 36 scenarios / 680 assertions,
166 observations, 1,162 owner snapshots and 21,248 tile rows, with every raw
native exit zero and completion fence present. The same artifact's complete
cooperative observation passes 1 / 532 over four seven-owner snapshots with
22 units, seven bases and 128 tiles each. Cloud runtime hashes differ from
the private v6 build; both refer to the same native source tree. The compact
receipt is [terraform-current-cloud-proof.json](terraform-current-cloud-proof.json).
The local private-v6 repetition intentionally stopped after 11 passed cases at a
completed-case boundary when equivalent cloud coverage was running; it is a
partial result, not another complete matrix pass.

Native normal road/Tube,
produced SeaFormer home/ports, cooperative work, observation and mounted progress
have separate passing source-bound results in the current smoke runbook. The
real controls browser check also passes on `0322db43`; its exact input, native
exit and sealed-log scope is recorded in
[terraform-controls-browser-v6-proof.json](terraform-controls-browser-v6-proof.json).
Height/Sea browser coverage and final CI/review remain separate. The retained
Hot failures are not hidden by these trace passes: disband and capacity now have
strict source-bound focused repairs recorded in the smoke runbook, while fresh
full CI remains required. Original passing action
cases remain zero; parser tests cannot replace native execution or strict shutdown.
