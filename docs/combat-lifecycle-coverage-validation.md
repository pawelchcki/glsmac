# Native combat and casualty lifecycle coverage

## Scope and demonstrated repairs

The existing production combat policy now has 23 additional application scenarios
at the real native unit-manager boundary. They extend the registered
`combat-rollback-regression` and `conventional-combat` suites; the adjacent
`unit-combat-model` and `gameplay-events` suites are retained in the focused run.

The first native casualty replay found that mutable native unit properties were
retained as pointer-backed values in combat backups. Resurrection then supplied
a pointer as morale to the native spawn API, which requires an integer. The same
aliases also prevented reliable restoration of pre-damage health and movement.
The production combat handler now materializes its integer, float and Boolean
snapshots before mutation or despawning.

A separate native replay proved that an accepted Hold/Sentry combatant returned
with `NO_ORDERS` after casualty rollback. The casualty descriptor now retains
supported ordinary orders, and the production spawn handler restores optional
`HOLD`/`SENTRY` after creating the native unit. A present order outside
`NO_ORDERS`/`HOLD`/`SENTRY`, including non-string input, is rejected before native
creation. The native event API queues child events and returns no spawned unit,
so restoration belongs in the child spawn handler rather than a synchronous
lookup after dispatch.

## Observable state

The private `_combat_native_fixture.gls.js` uses the existing native founding
fixture and two actual owners. Native units, map memberships, serialization,
player state and unit-manager operations stay real. Only animation delivery and
the explicit random input stream are controlled.

- Casualty delivery covers attacker death, defender death, mutual death, and
  surviving damage. Mutual-death rollback also runs before any callback, after
  either damage callback, and between the two death callbacks.
- Each callback preserves every bystander (both owners' Scouts and the original
  Colony Pod), both actual players' completion/energy/research state, native RNG,
  terrain and allocation counters. Pending native unit updates are checked for
  dangling entity pointers.
- Rollback must restore exact serialized native world state, every map tile's
  unit membership, and both combatants' health, morale, movement, moved flag and
  supported ordinary order. Three nondefault order combinations are covered.
- Conventional resolution reads real native offense/defense definitions and
  health with declared attacker-win, defender-win and equal-roll streams. It
  must leave all native state, bystanders and map memberships unchanged while
  consuming only the declared supplied draws.
- Wrong-owner, exhausted and civilian native attacks preserve the entire world
  on rejection. Six invalid optional spawn-order inputs preserve native state,
  allocator identity and pending updates before creating any unit.

## Verification (2026-11-11)

```sh
python3 tools/behavior-tests/fast.py \
  --runtime /tmp/wasmsmac-coverage-runtime-nov11/GLSMAC.js \
  --suite combat-rollback-regression --suite conventional-combat \
  --suite unit-combat-model --suite gameplay-events --jobs 1 \
  --report build/combat-lifecycle-coverage/ordinary-orders-green.json
```

| Suite | Scenarios | Assertions |
| --- | ---: | ---: |
| combat-rollback-regression | 23 | 306 |
| conventional-combat | 9 | 68 |
| unit-combat-model | 15 | 32 |
| gameplay-events | 71 | 386 |
| Total | 118 | 792 |

The final run passed in 8.53 seconds with one worker. The shared runtime was
downloaded from `pawelchcki/wasmsmac` CI run `43015901038`, built for source commit
`c0160cea41c091d659ffe0248c0d532f36bc8a01` using the prepared Emscripten 4.0.22
SDK. Current host scripts provide the candidate edits without relinking. Native
compilation is unchanged by this batch; the immutable runtime remains untouched.

- Loader SHA-256: `469a240495f2945052b4fdb6eacc7d72c27231ac68bbf8f323e3d9dcce18750b`.
- WASM SHA-256: `c75880a5ad8baf7a6e2f8194fde8679cb150f83a45a93b8ca18d56bc073b1f35`.
- Host-script snapshot SHA-256: `bcf0346a95033aaa6bf3736cde1a835d221b7ce55fd565c0a6faaf3c382e3006`.
- The dedicated `coverage-combat-lifecycle.yml` workflow reuses the prepared test
  engine and executes all four suites on matching PR heads, including these
  otherwise Stable suites, retaining the complete report as an artifact.

Retained local reports under `build/combat-lifecycle-coverage/` include
`focused-1.json` (pointer-backed casualty failure), `focused-2.json` (the earlier
independent 108-scenario/665-assertion passing scope), `ordinary-orders-red.json`
(Hold/Sentry restoration failure), and `ordinary-orders-green.json` (final pass).
Failure reports remain separate and add no passing cases.

## Limits

These are GLSMAC application contracts, not original-game observations or
combat-odds parity. The supplied results/callback schedule do not establish
rendered animation, sound, focus, timing, network delivery, general multiplayer
or AI behavior. Conventional reactor damage, promotions and general terrain/base
odds remain unverified. Work/automation order payload restoration after a
casualty is outside this ordinary-order descriptor contract and is not included
in the passing totals. The two-player synthetic map does not establish natural
world setup or the full opponent roster.
