# Bounded original human science requirement

`technology.human_research_cost.v1` records 38 synthetic inputs executed by the
pinned original cost helper in fresh, guarded Unicorn fixtures. Every result was
recorded in two independent complete identical runs. The original 38 cases and
six additional suites now have native and WebAssembly candidate agreement. Recorded replay
needs no original assets; recapture needs the pinned original executable.

The output `science_required` is an integer number of science points returned
by the original helper. No formula, translated original code or original asset
table is included. All original instruction fetches and data accesses stay
within the verified helper and explicit initialized fixture ranges; unexpected
dependencies or writes fail closed.

| Input | Units and tested scope |
| --- | --- |
| `faction_id` | Original ownership-mask faction ID, 1..7; the selected faction is human |
| `target_id` | Original technology ID; tested 0, 5 and 78 in otherwise identical state |
| `difficulty` | Original ordinal 0..5, Citizen through Transcend |
| `turn` | Native turn counter, bounded 0..100; tested 0, 1, 8, 24, 80 |
| `map_area_sqrt` | Native integer map-area size scalar; tested 20, 40, 56, 80; no general dimension-to-scalar conversion is established |
| `saved_earned_techs` | Explicit saved earned-technology state counter; tested 0, 1, 2, 4, 8 |
| `research_ranking` | Explicit integer research-ranking state scalar; tested 0, 2, 8, 16 |
| `research_rating` | Explicit baseline social RESEARCH rating; tested -3, -1, 0, 1, 3 |
| `discovery_rate_percent` | Installed rules discovery-rate percentage, tested 0, 50, 75, 100, 125, 200 |
| `faction_cost_percent` | Faction technology-cost percentage, tested 50, 100, 150 |
| `stagnation` | Whether the research-stagnation rule is on |

The baseline input supplies faction 1, target 5, difficulty 0, turn 1, area scalar
40, saved earned count 0, ranking 0, research rating 0, both percentages 100 and
stagnation off. Other inputs vary one field, with three additional combined
inputs. The selected cost cache is explicitly unset (-1). Rival saved-earned
and ranking state, the selected auxiliary ranking-adjustment state, and global
computer difficulty are zero. This is a human-only contract; computer research
is unsupported.

The two technology state counters are independent fixture inputs. Their
relationship to the complete technology ownership set, starting/free/traded
technology, acquisition events or ranking updates is **not established**. Do
not derive either counter from the number of owned IDs based on this contract.
Likewise, target-ID witnesses do not establish later research eligibility or a
full choice list. Nonzero rival ranking/earned state, diplomacy, inherited cache
values, complete turn processing and acquisition remain outside scope.

The baseline observation is 9 science points. Exact remaining observations are
in `observations/human-research-cost.json`, bound to
`cases/human-research-cost.json`. These records establish only their declared
bounded input space, not a complete cost planner.

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/cases/human-research-cost.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/research_cost_original.py --exe /var/home/pawel/reimplementation/smac-wasm/smac-assets/terranx.exe' \
  --output tools/behavior-tests/observations/human-research-cost.json \
  --repeat 2 --timeout 60
```

Source schema: installed `alphax.txt` `#RULES` zero-based noncomment data row 7
is the technology-discovery-rate percentage. Faction technology-cost modifiers
use `TECHCOST` / integer percentage bonus pairs. These are source input
identities, not claimed edited-source UI observations. No original row bodies
are distributed here.


## Candidate transfer

The seven registered references contain 340 cases with 333 unique complete
inputs; seven repeated anchors retain their independent provenance. Original
case/observation bytes were moved into the passing catalog without changing
answers. `technology::HumanResearchCost` implements the bounded uncached human
requirement and `technologies.human_research_cost(parameters)` exposes the same
pure calculation to GSE. Both adapters validate complete scalar inputs before
narrowing or arithmetic; the query grants no technology and derives no counters
from ownership.

Native and WebAssembly replay match all 340 observations. The first candidate
matched the initial 186 observations but failed 42 of the first 74 blind
witnesses. New difficulty, percentage-order and normalization witnesses informed
the correction; earlier mismatches and every original answer were preserved.
The corrected calculation then passed the final independently seeded 64-input
suite on its first replay, with the model frozen before those answers arrived.
The last suite's original inputs were independently frozen before execution.
This records generalization evidence within the declared input bounds; it is
not proof of a complete research planner.

```sh
python3 tools/behavior-tests/audit.py --target native --lane stable
EMXX=/path/to/em++ python3 tools/behavior-tests/audit.py --target wasm --lane stable
```

Cost-cache lifecycle, source import/game-to-counter mapping, science credit
scheduling, acquisition/overflow, rival state and AI research remain separate
work. Initial real progress recordings are still pending complete candidate
transfer, including the original/candidate first-city mineral discrepancy.
