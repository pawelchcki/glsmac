# Zero-Labs timing control and live cost-input context

`game.zero_labs_live_context.v1` is optional asset-backed evidence, pending and
outside passing catalogs. One complete case was recorded twice from fresh original
fixtures; both complete six-checkpoint outputs agree. Earlier records are unchanged.

The fixture is stock Gaians, Citizen (difficulty ordinal 0), flat arid 40×80,
directed target 5, with ready owned units held. At native turn counter 1, actual
Social Engineering controls decrease Labs from 50 to 0 percent in five clicks and
confirm the setting. The actual base panel then displays economy/psych/Labs
allocation 100/0/0 percent and Labs total 0. The actual Laboratories report is read
at native counters 1 through 6, after zero through five real Turn Complete actions.
Verified communication channels are declined. No internal credit phase is supplied.

At every checkpoint the actual report displays cost 9, accumulated science 0,
and per-turn estimate 0. The native accumulated field independently agrees at 0.
Selected target remains 5 and observed owned IDs remain [6]. No acquisition occurs
within this trace. This is a zero-income control in this precise opening protocol;
it does not establish a general startup delay or arbitrary science timing.

## Live context schema and units

`cost_context` contains read-only native values captured while the actual report
is open. Counters are read directly, not reconstructed from owned IDs. These input
names match the explicit bounded `technology.human_research_cost.v1` helper contract;
no new cost algorithm or general ownership-to-counter mapping is asserted.

| Field | Unit/provenance | Observed value |
| --- | --- | --- |
| faction_id, target_id | Native faction-mask ID and technology row ID | 1, 5 |
| human | Live human faction membership | true |
| difficulty | Native selected-faction difficulty ordinal; Citizen = 0 | 0 |
| turn | Native counter, not elapsed income turns | 1 through 6 |
| map_area_sqrt | Native integer map scalar, read directly | 40 |
| saved_earned_techs | Native stored integer counter | 0 |
| research_ranking | Native stored integer counter | 0 |
| research_rating | Native signed integer research rating | 0 |
| discovery_rate_percent | Live integer percentage | 100 |
| faction_cost_percent | Live integer faction research-cost percentage | 100 |
| stagnation | Live rule flag | false |
| cached_cost | Native signed cache field; -1 sentinel retained | -1 |
| auxiliary_adjustment | Native signed integer adjustment field | 0 |
| global_difficulty | Native global difficulty ordinal, separate from faction difficulty | 0 |
| faction_counters | Seven native rows, faction IDs 1 through 7; each holds saved_earned_techs and research_ranking | Both counters 0 in every row |

The two stored counters are independent fields. Their semantic mapping from a
technology ownership set remains unverified. The observed scalar 40 is not a
general dimension-conversion rule. The report cost 9 and the live fields are one
co-observed context, not a general cost derivation. Faction TECHCOST and discovery
source schema remain in the existing technology-source/research-cost contracts.

Actual Laboratories entry uses MENU → HQ → Laboratories Status. Source identity
is `menu.txt` block `HQ`, zero-based nonseparator command slot 5, title excluded;
the installed declared keyboard hint is F2. Actual menu entry is established.
Successful F2 delivery to the original through the current Wine input transport
remains unverified.

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/ui/cases/zero-labs-live-context.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/ui/zero_labs_context_original.py --assets /var/home/pawel/reimplementation/smac-wasm/smac-assets --wine /tmp/glsmac-controls-research/wine-11.20-amd64-wow64/bin/wine --artifacts /tmp/research-zero-labs-recording-v1' \
  --output tools/behavior-tests/ui/observations/zero-labs-live-context.json \
  --repeat 2 --timeout 600
```

Pinned executable fingerprint and complete source-input provenance are retained
in observation metadata. This reference does not establish acquisition, generic
credit timing, nonzero rival effects or arbitrary live contexts.
