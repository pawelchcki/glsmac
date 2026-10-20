# Colony Pod joining an owned base

`game.colony_join_base.v1` observes actual B, W and Tab with a healthy owned
Scout Patrol, Former and Colony Pod stacked on one owned base, Colony selected.
The declared initial city input has one Doctor, no workers/worked tiles, zero
stored nutrients and nine stored minerals. Original preparation reaches this
state through real Gaians/Citizen/standard startup on flat arid 40x80 land,
declared UNIT1+0 bonuses and two real companion commands. Pause at end is enabled
and tutorials are off. The original reader guards that the declared initial
city is actually present; no original instructions or native state are patched.
A reproduction fixture may declare that initial city. This does not establish
natural starting-city defaults, which remain a separate transfer gap.

Input is exactly `{profile: 'stacked', initial_base: {...}, setup: [two commands],
actions: ['join', 'wait', 'tab']}`. Preparation commands are Wait, Skip, Hold or
Sentry. Four core sequences handle companions alike. Six further sequences mix
one waiting companion with one skipped, held or Sentry companion. Each original
case starts fresh and needs two whole independent agreeing captures.

Output is an initial checkpoint after preparation plus every action checkpoint.
Each state records `year_delta`, actual selected native role or null, actual
owned base count, population, workers, Doctors, worked-tile count, stored
nutrients/minerals, and the surviving units in Scout/Former/Colony role order.
Each unit records its role, actual order as public original byte ordinal 0/1/2,
and movement spent in integer thirds. Worker count includes unassigned workers;
worked-tile count excludes the base square. Doctor means installed CITIZENS row1,
verified in both original rule aliases, plus guarded native specialist ordinals.
Other specialist types are rejected. Names/IDs/counts/positions/ownership/health
and terrain are guarded; surviving identities stay live and unchanged. Actual
selected identity is cross-checked against the visible selected-unit name.
Global/owned base counts and the existing base identity cannot change during
these B/W/Tab traces. The reproduction must observe its own native state and
convert protocol units; fixture code must not supply join outcomes or selection
policy. Rendering and transport acknowledgements may be controlled separately.

Scope excludes natural startup city defaults, exact worked-tile positions,
base-window recalculation, income/turns, other population sizes or population
limits, other terrain/factions, damaged/foreign units, movement/combat, new-base
founding, save/load and multiplayer. Guards/transaction rollback are separate
application invariants. Recorded inputs and observations are not full-game parity.

All four core and six mixed inputs agreed across two complete independent
original runs. All ten now match production scripts and actual native state
without rendering, and real browser B/W/Tab with rendering. The application
regression suite adds 31 scenarios for transactions, stale receipts, guards,
worker-link preservation at population two-to-three, copied frontend updates,
button/pending controls and lifecycle behavior. These are separate from original
observations and do not broaden the observed population-one contract.

The preserved pre-fix baseline has four display-free mismatches and a strict
browser mismatch after B, with the complete declared initial city matching.
B leaves population one, no Worker and the live Pod; the observations require
population two, one unassigned Worker and the Pod removed. Original evidence
was frozen before implementation. The browser fixture declares an idle project
so initialization cannot credit extra minerals before the first checkpoint.
