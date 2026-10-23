# Science progress with sparse report openings

`game.initial_research_progress_sparse.v1` is an optional asset-backed control,
unregistered and outside default passing catalogs. It preserves the complete
[initial research fixture](initial-research-progress-contract.md): same synthetic
flat map, stock Gaian/Citizen setup, Blind Research off, target5, actual default
allocation panel reading, pause/tutorial preferences and held Scout.

The only declared change is the Laboratories observation schedule. The report
opens once at native counter1, closes, and remains closed for five actual Turn
Complete clicks. Native map counters2..6 are guarded, but no intermediate
Laboratories report is opened. The second report opens at native counter6.
Initial/final output fields and independent report/native cross-checks match the
earlier contract. No science answer is calculated from a requested action.

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/ui/cases/initial-research-progress-sparse.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/ui/research_progress_sparse_original.py --assets /var/home/pawel/reimplementation/smac-wasm/smac-assets --wine /tmp/glsmac-controls-research/wine-11.20-amd64-wow64/bin/wine --artifacts /tmp/research-progress-sparse-recording-v1' \
  --output tools/behavior-tests/ui/observations/initial-research-progress-sparse.json \
  --repeat 2 --timeout 600
```

This control concerns only intermediate report-opening effects in this fixture.
It does not establish an internal science-credit phase, a general startup delay,
acquisition, UI-independent timing, another allocation/target/city or subsequent
turn behavior. Earlier recordings remain immutable.

## Repeated result

Two independent complete original runs agree. At initial native counter1,
accumulated science is0; at final native counter6 it is2. Cost remains9,
displayed per-turn estimate remains1, goal remains5 and owned IDs remain[6].
Initial actual allocation is50/0/50. The complete initial/final projections,
including city context, equal the corresponding endpoints of the earlier dense
report-opening trace.

Thus removing its four intermediate Laboratories openings does not change these
two measured endpoints in this declared fixture. This supports only that bounded
observation-effect comparison; it does not establish the internal timing phase
or unobserved intermediate values in the sparse run.
