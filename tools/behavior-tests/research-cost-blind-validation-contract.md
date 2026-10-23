# Independent blind cost validation inputs

This reference suite was generated after the implementation agent
reported freezing its first independent candidate. The reference worker did not
inspect candidate code or candidate outputs. Seventy-four unique synthetic inputs
were executed by the pinned original helper; two independent complete runs agree.
No original result was calculated or edited to match a candidate.

The first64 inputs come from Python `random.Random(20261023)`, with no rejection
or result-dependent selection. For each case, draws occur in this fixed order:

| Field | Draw |
| --- | --- |
| faction ID | choice of1,7 |
| target ID | choice of0,5,78 |
| difficulty | uniform integer0..5 |
| native turn | uniform integer0..100 |
| map-area scalar | uniform integer10..100 |
| saved earned counter | uniform integer0..8 |
| research ranking | uniform integer0..16, including odd values |
| baseline RESEARCH rating | uniform integer-3..3 |
| discovery percentage | choice of0,1,50,75,99,100,101,125,200 |
| faction cost percentage | uniform integer50..150 |
| stagnation | choice of false,true |

Ten normalized corner inputs were absent from those64 and were appended in a
separate named group: saved earned6/difficulty1 and saved earned8/difficulty5,
each at turns0,8,16,24,80. These corners use faction1, target5, map scalar56,
percentages100, research rating0, ranking0 and stagnation off. No input duplicates
a point in the prior four cost suites. Twenty-nine random inputs have odd ranking.

All remaining fixture initialization, units and limits remain those in
[research-cost-contract.md](research-cost-contract.md). In particular these are
human-only uncached helper observations, with the declared rival and auxiliary
counters held zero. Ownership/counter mapping, general dimension conversion,
acquisition and general science-credit timing remain unverified.

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/cases/human-research-cost-blind-validation.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/research_cost_original.py --exe /var/home/pawel/reimplementation/smac-wasm/smac-assets/terranx.exe' \
  --output tools/behavior-tests/observations/human-research-cost-blind-validation.json \
  --repeat 2 --timeout 60
```

Prior evidence remains unchanged. This suite adds no passing release totals or
candidate-agreement claim; any later candidate mismatch must remain explicit.
