# Early science timing: four remaining stock Gaian difficulties

`game.early_science_difficulty_timing.v2` is optional asset-backed timing-only
evidence, pending and outside passing catalogs. It uses fresh original fixtures
and two independent complete original runs for four cases and 24 checkpoints.
The larger full-context v1 scope was rejected for nondeterministic costs/rosters;
both original full runs and mismatch witnesses remain immutable in the separate
`reference-archives/early-science-difficulties-v1` archive. Timing answers are not
adapted from candidate output or copied from the failed comparison.

Inputs are exactly a declared difficulty, target ID 5, five real advances and
the decline-channel interruption policy. Each actual setup uses stock Gaians,
normal first-city controls at the selected named difficulty, Blind
Research off and a synthetic flat arid 40×80 map. Actual base allocation and Labs
income are read, and ready owned units are held. Laboratories is opened after
setup and after each real Turn Complete action. Verified communication channels
are declined. No internal credit phase or cause is supplied as an input.

| Actual difficulty choice | Difficulty ordinal | Accumulated science at native counters 1..6 | Per-turn estimate |
| --- | ---: | --- | ---: |
| Specialist | 1 | 0,0,0,0,1,2 | 1 throughout |
| Librarian | 3 | 0,1,2,3,4,5 | 1 throughout |
| Thinker | 4 | 0,1,2,3,4,5 | 1 throughout |
| Transcend | 5 | 0,1,2,3,4,5 | 1 throughout |

All initial actual base panels display economy/psych/Labs allocation 50/0/50
percent and Labs total 1. Native turn counters 1..6 identify paused checkpoints;
they are not elapsed income-turn counts. Actual rendered accumulated science is
cross-checked against the native field at every checkpoint. Native faction ID 1,
selected target 5 and ownership [6] are preserved guards in the projection.
No acquisition occurs within the trace.

The strict output contains only the measured allocation, measured initial Labs
income, and checkpoint turn/faction/target/ownership/accumulated/per-turn fields.
Displayed cost, cities and unit rosters are still observed and stored in each
original artifact's `full-context.json`; they are not strict timing outputs and
are not promoted to deterministic gameplay claims. This separation is explicit:
the preceding complete full-context runs had Librarian unit count 2 versus 1,
and Thinker cost 9 versus 10 at counters 5/6. No cause of those differences is
asserted. Complete contexts from the accepted timing recording are preserved in
the matching v2 context archive, without treating them as passing expected costs.

These witnesses apply to this exact opening protocol. They do not establish
later founding, arbitrary city/allocation/faction contexts, a generic difficulty
threshold, internal credit mechanics, or technology acquisition. Existing
Citizen, Talent and Hive evidence stays in its independently named contracts.

Menu entry uses actual MENU → HQ → Laboratories Status. Installed source identity
is `menu.txt` block `HQ`, zero-based nonseparator command slot 5, title excluded;
the declared hint is F2. Successful direct shortcut delivery is a separate
reference concern and is not asserted by these menu-entry cases.

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/ui/cases/early-science-difficulty-timing.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/ui/science_difficulty_timing_original.py --assets /var/home/pawel/reimplementation/smac-wasm/smac-assets --wine /tmp/glsmac-controls-research/wine-11.20-amd64-wow64/bin/wine --artifacts /tmp/research-science-difficulty-timing-recording-v1' \
  --output tools/behavior-tests/ui/observations/early-science-difficulty-timing.json \
  --repeat 2 --jobs 2 --timeout 600
```

Executable fingerprint, adapter fingerprint and complete installed source-input
provenance remain in observation metadata. No original algorithm or source asset
body is transferred.
