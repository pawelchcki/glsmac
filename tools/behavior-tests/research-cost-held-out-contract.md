# Additional original human cost witnesses

This separate reference suite preserves the original 38-case input
and observation files unchanged. The same pinned original instructions and
fresh guarded fixtures independently produced two identical complete runs for
37 unique input cases: **32 additional inputs and 5 repeated anchors** from the
first suite. These counts are evidence inventory, not candidate agreement or
passing release totals.

The input schema and fixture defaults remain exactly those in
[research-cost-contract.md](research-cost-contract.md). The new matrix contains:

| Input family | Controlled values |
| --- | --- |
| Saved earned counter at baseline | Every integer 0..8 |
| Research rating with saved earned4 | Every integer -3..3 |
| Research rating with saved earned8 | Every integer -3..3 |
| Turn with saved earned4 | Every integer 0..8 |
| Combined source/map witnesses | Eight declared combinations of discovery/faction percentages, map scalar, saved earned counter, and selected rating/difficulty/ranking values |

Shared baseline points are represented once within this suite. Five cases also
repeat inputs from the first suite and are anchors, not new held-out inputs.
The exact independent original results are in the observation JSON; no formula
or original implementation explanation accompanies them.

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/cases/human-research-cost-held-out.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/research_cost_original.py --exe /var/home/pawel/reimplementation/smac-wasm/smac-assets/terranx.exe' \
  --output tools/behavior-tests/observations/human-research-cost-held-out.json \
  --repeat 2 --timeout 60
```

Ownership-to-earned/ranking mapping, general dimension-to-map-scalar conversion,
nonzero rival ranking/earned state, AI research, actual acquisition and general
turn-credit timing remain unverified. No candidate implementation was used to
choose or generate these reference answers.
