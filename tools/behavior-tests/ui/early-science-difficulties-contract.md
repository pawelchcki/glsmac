# Early science: remaining stock Gaian difficulties

`game.early_science_difficulties.v1` is optional asset-backed evidence, pending and
outside passing catalogs. The full-context scope was rejected by `compare.py` as nondeterministic.
Both complete original runs are preserved in
`reference-archives/early-science-difficulties-v1/run-a.json` and `run-b.json`.
They agree on all 24 science timing checkpoints. Librarian differs in unit count
(two versus one), and Thinker differs in report cost at counters 5/6 (9 versus 10).
There is no accepted full-context observation file. Prior records are unchanged.

Each fixture uses stock Gaians, directed target 5, and the same synthetic flat
arid 40×80 map as the earlier Citizen and Talent traces. The selected difficulty
is an actual setup menu choice. Real first-city setup selects target 5, reads
actual base allocation and Labs income, holds ready owned units, then observes
Laboratories after setup and each of five real Turn Complete advances. Verified
communications channels are declined. No internal science phase or timing cause
is an input. Native counters 1 through 6 are checkpoint units, not elapsed
income-turn counts.

| Declared difficulty | Native ordinal | Actual accumulated at native counters 1..6 | Displayed cost | Displayed per-turn estimate |
| --- | ---: | --- | ---: | ---: |
| Specialist | 1 | 0,0,0,0,1,2 | 10 throughout | 1 throughout |
| Librarian | 3 | 0,1,2,3,4,5 | 10 throughout | 1 throughout |
| Thinker | 4 | 0,1,2,3,4,5 | 10 initially; 9 or 10 at counters 5/6 | 1 throughout |
| Transcend | 5 | 0,1,2,3,4,5 | 9 throughout | 1 throughout |

All four actual base openings display economy/psych/Labs allocation 50/0/50
percent and Labs total 1. At every checkpoint, actual rendered accumulated
science independently agrees with the native field. Actual native human faction
ID is 1, selected target remains 5, and owned IDs remain [6]. City and unit context
is preserved in every observation. No acquisition occurs within these traces.

Together with the separate Citizen/Talent/Hive records these cover the six stock
difficulty menu choices for this Gaian opening protocol and a second faction at
Citizen. They do not establish timing for later founding, other allocation or
city contexts, arbitrary factions, or an internal credit mechanism. Do not turn
a six-checkpoint observation into an unrecorded native science rule.

Entry is actual MENU → HQ → Laboratories Status. Source identity is `menu.txt`
block `HQ`, zero-based nonseparator command slot 5, title excluded; declared hint
F2. Successful direct F2 entry through Wine remains separately unverified here.

A failed first recording is retained at
`/tmp/research-science-difficulties-recording-v1`: the final Transcend report was
visible but the old three-scale decimal OCR did not reach consensus. The new
recorder adds strict independent OCR scales with consensus and repeats the whole
suite in fresh games. It does not synthesize missing output. Completed artifacts
are under `/tmp/research-science-difficulties-recording-v2`.

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/ui/cases/early-science-difficulties.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/ui/science_difficulty_original.py --assets /var/home/pawel/reimplementation/smac-wasm/smac-assets --wine /tmp/glsmac-controls-research/wine-11.20-amd64-wow64/bin/wine --artifacts /tmp/research-science-difficulties-recording-v2' \
  --output tools/behavior-tests/ui/observations/early-science-difficulties.json \
  --repeat 2 --jobs 2 --timeout 600
```

Executable fingerprint and source-input provenance remain in observation metadata.
The native difficulty ordinals are the setup-input units; no source asset table
bodies or original algorithms are part of this contract.
