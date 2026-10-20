# Base-screen opening after a Colony Pod joins

`ui.base_open_city_recalc.v1` is a pending, separately bounded original-game
contract. Two fresh complete original captures agree for each of its two cases.
It is not part of the passing catalog until candidate replay agrees.

Inputs declare an owned first land city on the same controlled flat arid
40×80 world as the join contract, with one Doctor, no Workers or worked tiles,
zero nutrients and nine minerals. Three healthy owned Scout/Former/Pod units
start stacked on that base. Real W/W selects the Pod. One case opens/closes the
base twice; the other first joins the Pod with B, then does the same sequence.
Open is Enter; close is Escape. No turn advances. The initial city is a guarded
fixture input, not evidence for natural starting-city defaults.

Each checkpoint observes actual map/base context, equality of the visible base
title to its own native base name, selected role, year difference, surviving unit
identities/orders/movement, owned base count, population, Workers, Doctors,
worked-tile count, minerals and the signed native nutrient counter. The literal
city name is normalized away. Movement is spent thirds of a normal land turn;
order codes are the existing original protocol 0/1/2. The base title is observed,
not inferred from the requested action. All surviving unit/base identities,
positions, owner and health are guarded.

The control preserves its one Doctor and all counters through both openings.
The joined case initially adds one unassigned Worker and preserves the existing
Doctor and counters. At its first opening the observed population is two Doctors,
zero Workers/assigned tiles; the signed nutrient counter is -1 and minerals stay
nine. Closing and reopening preserve those observations. Existing map selection
persists throughout each base window.

The nutrient field is a raw signed native counter. These observations do not
establish its general meaning, an income formula, or a universal -1 rule. Do not
add a special-case negative resource mutation just to satisfy this fixture. A
production transfer needs a coherent lifecycle rule supported by further tests;
unresolved fields must remain mismatches or explicitly unsupported.

Other populations, stock values, terrain, factions, governor modes, citizen
assignment preferences, resource income, later turns, save/load and multiplayer
remain outside this contract. The independently frozen closed-map join evidence
is unchanged. Candidate fixtures must drive actual production base opening and
closing and read native citizen/resource state; they must not replay observations
or simulate the recalculation in test code.

Current candidate replay agrees on all citizen, unit, context, title, mineral and
year observations. The control matches; the joined trace remains strictly red
only at its four post-opening signed nutrient checkpoints. The independently
recorded [citizen-only contract](base-open-citizens-contract.md) does not include
that unresolved field. Neither recording has been edited to fit the candidate.
