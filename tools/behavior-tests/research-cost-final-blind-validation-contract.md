# Final independently seeded cost validation

This reference suite contains64 deterministic synthetic inputs from
seed20261024. It uses the same bounds and field draw order as
[the earlier blind suite](research-cost-blind-validation-contract.md). Inputs
were generated without candidate access and frozen before original execution.
No original result was adapted to candidate behavior.

Duplicate input rejection was specified against all269 prior unique cost
inputs and against earlier points in this new suite. All64 first draws were
unique and new, so there were zero rejected draws. No corner inputs were
appended. The frozen input-file SHA-256 is:

`a5dad6ca1a95753bce46c5bde4828c852e5e129b8847e675e3a52b432002a32f`

The pre-execution freeze receipt remains at
`/tmp/research-cost-blind20261024-input-freeze.json`. Its `original_executed:false`
field describes that freeze instant, before invoking the strict recorder.

Two independent complete original runs agree on all64 outputs. Each answer
executes the same pinned original human cost helper against a fresh initialized
fixture. Field units/defaults and limits remain those in
[research-cost-contract.md](research-cost-contract.md). Prior cases and
observations are unchanged.

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/cases/human-research-cost-final-blind-validation.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/research_cost_original.py --exe /var/home/pawel/reimplementation/smac-wasm/smac-assets/terranx.exe' \
  --output tools/behavior-tests/observations/human-research-cost-final-blind-validation.json \
  --repeat 2 --timeout 60
```

No formula or original implementation details accompany these observations.
Ownership/counter mapping, general dimension conversion, nonzero rival counters,
acquisition and general credit timing remain unverified. This suite adds no
passing release totals or candidate-agreement claim. Reference work stops after
this requested batch; artifacts are retained.
