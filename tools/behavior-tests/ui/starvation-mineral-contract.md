# First-turn mineral credit with and without starvation

`economy.starvation_mineral_credit.v1` compares native mineral stores through one
actual income turn in a fresh Gaian/Citizen/standard flat-arid game. Both cases
start from the declared one-Doctor Headquarters with zero nutrients, nine
minerals and a visibly incomplete Formers project. The initial city is a
controlled input, not a claim about natural startup defaults.

Actual W/W selects the Colony Pod. The unchanged control keeps it; the starvation
case joins it with B. Both open complete management with Enter and close it with
Escape. This reconciles the joined citizen in the starvation case. All surviving
units are held with H before clicking the actual TURN COMPLETE control.

Observations compare native population, Worker/Doctor counts, worked tiles,
mineral accumulator, relative year, and surviving unit roles/orders/movement.
The observer guards the original city identity/ownership/position, unit identities
and positions, complete management title/resource HUD and visible Formers project.
It samples before the turn and after the completed map continuation. The starving
case also samples while the actual notice is pending, then selects Proceed using
Down, verifies its actual highlight, and confirms with Enter. Finished map
continuation requires no known notice paint or base title plus visible TURN
COMPLETE; a changed year alone is insufficient. Known research dialogs are
handled only after existing visible-caption guards.

The original project stays incomplete. This establishes no price formula or
production-completion behavior. Candidate replay may use a declared synthetic
non-completing Formers price so that completion cannot obscure the mineral
accumulator; that price is not compared. The native project, source configuration,
queued production and growth must execute production code. Test fixtures must
not manufacture mineral outcomes, reset the accumulator after a turn, bypass the
pending decision, or call a replacement arithmetic implementation.

Each entire original capture is independently repeated from fresh state. Exact
recorded observations are immutable; only actual candidate replay can promote
the two cases into passing coverage. Display-free rendering/transport boundaries
must be declared, with a real-browser control check for each path.

Scope is these two first-turn contexts only. Raw signed nutrient-counter meaning,
mineral prices/completion, support/facility policies, other population/job layouts,
other factions/terrain, later starvation turns, suppression controls and general
economy/starvation algorithms remain outside this contract. Existing notification
wording/control observations stay in the separate starvation-dialog contract.
