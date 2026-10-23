# Additional time, ranking and stagnation witnesses

This separate reference suite records 92 additional unique synthetic
inputs through the same pinned original human cost helper. Two independent
complete runs agree. Prior cases and observations remain byte-for-byte
unchanged, and no new input duplicates a point in the prior three cost suites.

The requested matrix has 102 unique points. Ten are already covered by earlier
immutable suites, leaving these 92 new witnesses:

| Family | Fixed and crossed inputs |
| --- | --- |
| Main cross-product | Map-area scalar56; discovery/faction percentages100; difficulty0; research rating0; saved earned0,2,4,8 × ranking0,8,16 × turn1,8,24,80 × stagnation off/on |
| Difficulty witnesses | Same normalized baseline except difficulty1; saved earned2,4,8 × turn1,80; ranking0 and stagnation off |

All remaining defaults and units are those in
[research-cost-contract.md](research-cost-contract.md). Outputs are actual
original helper returns in integer science points; no formula or original
implementation explanation is included.

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/cases/human-research-cost-time-ranking.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/research_cost_original.py --exe /var/home/pawel/reimplementation/smac-wasm/smac-assets/terranx.exe' \
  --output tools/behavior-tests/observations/human-research-cost-time-ranking.json \
  --repeat 2 --timeout 60
```

Ownership-to-earned/ranking mapping, general map-dimension conversion, nonzero
rival counters, actual acquisition and general science-credit timing remain
unverified. This batch adds no default passing release cases or candidate
agreement claim.
