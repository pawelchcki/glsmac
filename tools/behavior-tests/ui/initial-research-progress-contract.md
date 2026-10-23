# First directed science cost and progress

`game.initial_research_progress.v1` is optional asset-backed evidence, outside
all default passing catalogs and pending candidate transfer. The pinned GOG
Alien Crossfire executable fingerprint is the same as the earlier directed
choice contract. Each case starts a fresh original process/private installation.

The sole source replacement is the existing synthetic 40×80 flat-arid map
(`former_work_sources.arid_map`), transported as PLANET.MP. Installed faction,
technology, unit and citizen data remain unchanged. Setup selects Citizen,
Gaians and Customize Rules with Blind Research switched off; accepts the first
base; chooses the visible Doctrine: Mobility card; enables pause at end;
disables tutorials; opens the actual base screen to read allocation percentages;
then holds the sole Scout. No original code or process memory is patched.

The input declares target ID5, five real end-turn advances, the synthetic map
profile and default economy/psych/labs percentages 50/0/50. Percentages are read
from actual rendered controls and guarded against that fixture declaration.
Every checkpoint enters the actual MENU → HQ → Laboratories Status report.

Outputs include the original native turn counter, selected target ID,
accumulated science, complete owned-technology IDs for the human faction, and
native first-city population/jobs/worked tiles/nutrients/minerals. The held Scout,
owned city identity and map dimensions are guarded. The report independently
reads displayed cost, accumulated science and per-turn estimate, with the
accumulated numeral cross-checked against native state. The per-turn estimate
is a distinct field from observed changes between checkpoints.

Two of three scaled OCR readings must agree on the decimal report fields. The only
character normalization is O-to-zero within declared numeric regions, consistent
with the existing resource HUD recorder. It never calculates a numeral from the
action or substitutes a candidate result. Initial allocation uses independent
scaled readings of the actual percentage controls. Raw screenshots, calibration
failures and private research remain under `/tmp/research-progress-*`.

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/ui/cases/initial-research-progress.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/ui/research_progress_original.py --assets /var/home/pawel/reimplementation/smac-wasm/smac-assets --wine /tmp/glsmac-controls-research/wine-11.20-amd64-wow64/bin/wine --artifacts /tmp/research-progress-recording-v3' \
  --output tools/behavior-tests/ui/observations/initial-research-progress.json \
  --repeat 2 --timeout 600
```

Acquisition is explicitly unsupported by this six-checkpoint trace. It also
establishes no general cost formula, reason for early accumulation behavior,
other allocations/citizens/difficulties/targets, research overflow, target
switching penalties, later progress, AI contacts or science acquisition effects.
The later ordinary-game path introduces AI contact interruptions and remains
unverified. The separate synthetic
[human cost-helper contract](../research-cost-contract.md) supplies broader
bounded cost inputs; it does not establish mapping ownership to its ranking and
earned-technology counters.

Source identities needed for the report: common/expansion script block
`STATUSLABS` declares its report caption. In installed `labels.txt` `#LABELS`,
TECH COST, TECH ACCUMULATED, TECH PER TURN and LABORATORY SUMMARY are table labels;
their zero-based positions are documented separately below. Source edits and
common-versus-expansion precedence for this report have not been recorded.

| Label identity | Zero-based source index |
| --- | ---: |
| TECH COST | 376 |
| TECH ACCUMULATED | 377 |
| TECH PER TURN | 378 |
| LABORATORY SUMMARY | 689 |

## Repeated observations

Both independent complete runs agree on the six checkpoints. Initial actual
allocation is economy50%, psych0%, labs50%. At native turns1 through6, displayed
cost stays9 and the displayed per-turn estimate stays1. Native accumulated science
and the independent report numeral agree on `0,0,0,0,1,2`. The selected target
stays ID5 and the human owns exactly ID6 throughout: selecting and accumulating
toward a target does not grant it within this trace.

The city stays population1 with one Doctor, zero Workers, zero worked tiles and
zero stored nutrients. Stored minerals advance from9 to14. These city readings
are relevant original context, not a claim that candidate natural startup
already matches them. In particular this optional reference does not silently
exempt the existing first-city mineral discrepancy.

## Checkpoint timing boundary

Timing is specified only by the external fixture protocol: the first checkpoint
is native counter1 after first-base setup, target selection, actual allocation
panel open/close, and Hold on the sole Scout. Each subsequent input is exactly
one click of the map's Turn Complete control. Capture waits for the requested
native counter2..6 at the settled map, then opens the real Laboratories report
and reads both rendered and native state there. No checkpoint is claimed to
represent an unobserved internal credit phase.

Thus this trace fixes the measured state after each declared control sequence.
It does not establish a general science-credit timing rule, explain why the
early counters do not change, or establish equivalence to another arrangement
of callbacks, UI recalculation, turn hooks, setup paths or skipped report opens.
