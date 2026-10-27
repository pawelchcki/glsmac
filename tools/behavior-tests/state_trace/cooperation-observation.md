# Cooperative work observation v4

`game.terrain_observation.v4` preserves every v3 field and adds one explicit
per-unit `cooperative_work` envelope and an aggregate coverage flag. A missing
native `unit.get_terraforming_schema_version()` is unsupported, with a reason
and no fabricated cohort. Known native schema 2 plus the actual source helper
`terraforming.gls.js::cohort_state(game,unit,freshReadCache)` can return null for
an absent, stale or ineligible job. This supported null differs from missing
observation capability. The cache exists for one synchronous full-world read.

Raw native work, optional four-field `job` metadata, and own contribution remain
unchanged. Helper totals and sorted participants are separate observed values.
Validation binds each participant's owner, job, target, domain, activity and own
counter to its captured native unit. Genuine paused contributions count toward
the total. Every eligible same-job native member must be present, including
opponents; the current UI owner never filters observation. Legacy v2/v3 packets
remain readable without inventing cooperation fields.

The bounded native proof shares the declared seven-owner fixture with the core
cooperation suite: source rate five, fourteen working Formers plus one additional
peer, seven initial native units and seven cities. It captures four complete
128-tile worlds: partial cohorts, a real paused opponent, a real third peer
contribution, and a fresh read after authoritative terrain mutation invalidates
another owner's job. Every capture fences the full native graph, RNG and queues.
The completion marker follows cleanup and normal Finish. No original cooperation,
UI, graphics or timing agreement is claimed.

Replay with the matching native schema-2 runtime after reserving a worker slot:

```sh
python3 tools/behavior-tests/state_trace/cooperative_capture.py \
  --runtime /path/to/immutable/GLSMAC.js --artifacts /tmp/cooperative-observation
```

The replay preserves requested seed, runtime/worker/fixture/source fingerprints,
full snapshots, native inventories and raw process status. Pure schema checks
are transport validation. Structurally valid data never overrides a failed native
footer or nonzero process exit.

Verified candidate checkpoint: frozen host `fb64d609` (native source tree
`115032ffc7f53ff7f0c3a9f997da12674e25e643`), immutable PR2 runtime v6:
JS `e71036c9365a3ac87bf818e7eb49fb2344077a15aa6836371a436572cedf7f82`,
WASM `b2c7fa273042f2407335169eb4fca51f131f1f30656301d7b7573a201b28f5b7`.
The replay passed **1 scenario / 532 assertions**, native exit **0**, in 33.576s.
All four snapshots contain all seven players, 22 units, seven cities and 128 tiles.
The actual probe digest is
`d5e4f9830ce113628811d927f21dfcbbfb28cf0ae990feb1dda00b4db8cc8272`;
it is bound to executed request bytes before launch. Native setup explicitly
opens each computer's turn through the shipped `uncomplete_turn` event. The first
failed probe's native-wrapper array dereference remains preserved; scalar IDs
now reacquire canonical actors without changing observations or assertions.

This verifies bounded full-world observation and pure foreign cohort binding.
It does not establish original cooperation agreement, browser rendering, large
terrain-footprint capacity, or complete autonomous-plan exhaustion.
