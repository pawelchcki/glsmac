# Initial Laboratories: physical map, setup preset and live cost context

`game.live_map_cost_context.v1` is optional asset-backed evidence, pending and
outside passing catalogs. Two independent complete original runs agree on all six
cases. Earlier records remain unchanged. Inputs declare synthetic physical width/height, an
actual setup-preset route and target ID 5. All fixtures use stock Gaians, Citizen
(difficulty ordinal 0), Blind Research off, held ready owned units, normal
first-city naming and one initial Laboratories opening at native counter 1.
There are no turn advances or technology acquisitions in this contract.

The synthetic map has uniform flat arid land and exactly the declared physical
dimensions. Installed rules, faction, unit and technology data remain stock.
Actual allocation and base Labs income are read before the report is opened.
No cost, scalar, counters or ownership-derived values are injected.

The `load-default` route uses actual Start Game → Load Map File. For `tiny` or
`standard`, actual Start Game → Make Random Map → Tiny Planet or Standard Planet
is selected first. The actual difficulty menu is verified, its raw `map_kind`
is read, and Escape returns to the actual map-source menu. Load Map File then
loads the same declared 40×80 physical map. Both the earlier preset-selection
value and the final live value remain observations; no persistence is assumed.

## Repeated actual observations

| Physical width×height | Setup route | Selected-preset raw map_kind | Final raw map_kind | Direct live map_area_sqrt | Displayed cost |
| --- | --- | ---: | ---: | ---: | ---: |
| 40×80 | load-default | no preceding action | 0 | 40 | 9 |
| 68×34 | load-default | no preceding action | 0 | 34 | 7 |
| 80×160 | load-default | no preceding action | 0 | 80 | 18 |
| 42×81 | load-default | no preceding action | 0 | 41 | 9 |
| 40×80 | Tiny prelude | 0 | 0 | 40 | 9 |
| 40×80 | Standard prelude | 2 | 0 | 40 | 9 |

The odd-height 42×81 map is accepted with those exact native physical dimensions.
Every actual report displays accumulated 0 and per-turn 1. Every actual base panel
displays allocation 50/0/50 percent and Labs total 1. F2 successfully opens the
actual report in every case in both complete runs.

Every live snapshot has faction 1, human true, target 5, difficulty 0, native
counter 1, saved-earned counter 0, ranking counter 0, research rating 0, discovery
100 percent, faction research cost 100 percent, stagnation false, cached cost -1,
auxiliary adjustment 0 and global difficulty 0. All seven faction-counter rows
have both stored counters 0. Ownership [6] is separately read, not used to derive
those counters. Actual context remains one held prototype-2 unit with no damage
or spent movement, and one city with population 1, Doctor 1, workers 0, worked
tiles 0, stored nutrients 0 and raw minerals 9. The raw mineral observation does
not establish an unconditional startup-production rule.

The Standard prelude's selected value 2 does not remain 2 after the actual load-map
route in these controls. This batch therefore does not produce equal physical
maps with different final raw map_kind values, and does not establish a candidate
map-kind equivalence. It does separately preserve the actual preset controls,
final physical dimensions, raw final map_kind, direct scalar and displayed costs.
No general map dimension or preset conversion is inferred from the four points.

## Observed field schema and units

`setup_preset_trace` holds the directly read raw integer `map_kind` at the verified
post-preset difficulty menu; direct-load cases have no preceding preset action.
`native` records actual physical map width and height in original tile-coordinate
units, final raw `map_kind`, native turn counter, faction ID, target ID, ownership,
owned unit roster and bounded first-city state. `map_kind` remains a raw setup-size
scalar; no candidate enum/type/preset equivalence is asserted by its name.

`report` contains actual rendered decimal cost, accumulated science and per-turn
estimate. Native accumulated science is independently cross-checked.
`initial_allocation` is actual economy/psych/Labs percent; `initial_labs_income`
is the actual displayed integer base Labs total.

`cost_context` is a direct native snapshot while the actual report is open:

| Fields | Units/provenance |
| --- | --- |
| faction_id, target_id | Native faction-mask ID and technology row ID |
| human | Actual human faction membership |
| difficulty | Selected faction's native ordinal; Citizen = 0 |
| turn | Native paused counter, not elapsed income turns |
| map_area_sqrt | Native integer map scalar, read directly |
| saved_earned_techs, research_ranking | Independent stored integer counters |
| research_rating | Signed integer rating |
| discovery_rate_percent, faction_cost_percent | Live integer percentages |
| stagnation | Actual rule flag |
| cached_cost | Signed native cache field, preserving its sentinel |
| auxiliary_adjustment | Signed native adjustment field |
| global_difficulty | Separate global ordinal |
| faction_counters | Seven actual rows, faction IDs 1..7; both stored counters in every row |

The scalar is not computed from dimensions or preset labels. Counters are not
reconstructed from owned IDs. Source discovery and faction TECHCOST schema are
specified in the existing technology-source and bounded cost-helper contracts.
General conversion rules, ownership/ranking relationships and nonzero rival
behavior remain unverified unless separately recorded.

## Actual shortcut and installed source identity

The report is opened by actual Windows SendInput F2 key-down/key-up into the
original foreground window. The self-authored input helper changes no game
memory, executable or installed source text. `entry` records this real action.
Installed source identity is `menu.txt` block `HQ`, zero-based nonseparator slot 5,
excluding the title, with declared hint F2. Successful entry is verified by the
actual Laboratories report, rather than inferred from the source hint. Earlier
X11 function-key delivery failures do not establish original no-op behavior.

The input helper is recording infrastructure. Build it using the local Wine SDK:

```sh
mkdir -p /tmp/research-wine-compiler-bin
ln -sf /usr/bin/gcc /tmp/research-wine-compiler-bin/gcc-15
ln -sf /usr/bin/g++ /tmp/research-wine-compiler-bin/g++-15
PATH=/tmp/research-wine-compiler-bin:$PATH \
  /tmp/glsmac-controls-research/wine-11.20-amd64-wow64/bin/winegcc \
  -m64 -mwindows -o /tmp/labs-f2-sendinput.exe \
  tools/behavior-tests/ui/wine_key_input.c
```

Record twice from fresh original fixtures:

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/ui/cases/live-map-cost-context.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/ui/live_map_cost_context_original.py --assets /var/home/pawel/reimplementation/smac-wasm/smac-assets --wine /tmp/glsmac-controls-research/wine-11.20-amd64-wow64/bin/wine --artifacts /tmp/research-live-map-cost-context-recording-v1 --key-helper /tmp/labs-f2-sendinput.exe' \
  --output tools/behavior-tests/ui/observations/live-map-cost-context.json \
  --repeat 2 --jobs 2 --timeout 600
```

The executable fingerprint is guarded before original execution. Complete installed
source-input provenance, observer fingerprint and Windows input-helper fingerprint
remain in observation metadata. No general cost algorithm, dimension conversion,
startup-production rule, credit timing or acquisition rule is supplied.
