# Targeted original normalization witnesses

This separate reference suite records 16 synthetic inputs through the
same pinned original human cost helper. Two independent complete runs agree.
Fifteen inputs are additional witnesses; the last is an exact repeated anchor
from blind case43. All prior case and observation bytes remain unchanged.

The shared baseline for the normalized points is faction1, target5, native
turn9, map-area scalar56, discovery/faction percentages100, saved earned7,
ranking12 and research rating0.

| Family | Controlled inputs |
| --- | --- |
| Difficulty/stagnation cross | Difficulties0..5 × stagnation off/on |
| Negative-rating controls | Difficulty3, rating-3 × stagnation off/on |
| Counter contrast | Saved earned8, ranking10, difficulty3, stagnation on, rating0 |
| Exact blind anchor | Faction7, target78, difficulty3, turn9, map27, saved earned7, ranking12, rating-3, discovery125, faction percentage65, stagnation on |

The repeated anchor is input index43, ID `cost-blind-seed20261023-43`, in the
unchanged blind suite. Its newly recorded original result agrees with that
prior observation. No candidate implementation or candidate output was inspected
by this reference worker.

All field units, remaining fixture defaults and limits are those in
[research-cost-contract.md](research-cost-contract.md). No formula or original
implementation details accompany these observations. Ownership-to-counter
mapping, general map-dimension conversion, nonzero rival counters, acquisition
and general science-credit timing remain unverified.

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/cases/human-research-cost-targeted-normalization.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/research_cost_original.py --exe /var/home/pawel/reimplementation/smac-wasm/smac-assets/terranx.exe' \
  --output tools/behavior-tests/observations/human-research-cost-targeted-normalization.json \
  --repeat 2 --timeout 60
```

This suite adds no default passing release cases or candidate-agreement claim.
