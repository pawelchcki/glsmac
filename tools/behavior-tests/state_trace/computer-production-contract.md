# Bounded offline computer opening production

The frozen [explicit seven-player world](explicit-world-contract-v2.md) supplies
one Doctor, three minerals, Colony Pod production and Centauri Ecology to each
participant before any actions. Six actual computer cities select Formers after
the recorded ordinary turn, with four minerals; the human retains Colony Pod.
Each original scenario was independently recorded twice. These observations
establish those results in that declared world, not an original AI algorithm.

Production configuration now installs a small offline computer controller. On
ordinary turns after turn one it considers a population-one land city building
a population-cost Colony Pod, with at most ten accumulated minerals, when the
owner has neither an actual Formers unit anywhere on the map nor a Formers
project in another city. If several cities qualify, the lowest persistent native
base ID wins. These selection and safety rules are application policy; they are
not new original observations. Existing native unit production cannot complete
a Colony Pod while its population cost would leave the city empty.

The Formers recipe and prerequisite come from the parsed installed basic-unit
rules. Availability reads the owner's current native technology table using the
source token, rather than assuming the faction's starting tokens are its current
ownership. An absent recipe is materialized from those source costs; existing
recipes are retained. Naval cities, larger cities, other project categories,
stock above ten, unavailable/disabled technology and existing support remain
outside this policy. A human's project is never selected by this controller.

The host-only `computer_base_production` event recomputes the proposal against
live native state. It rejects other callers, human/missing owners, nonordinary
or stale turns, duplicate processing and network/scenario contexts. A monotonic
receipt identity prevents saved rollbacks from affecting a later retry. The
receipt restores the actual selected project and its mineral/processing epoch,
removes only its newly added recipe, and restores the prior per-owner turn
marker. Receipt IDs remain monotonic after undo. Changed native base state,
recipe identity or another city using that recipe rejects rollback before any
mutation. Automatic turn callbacks run after the base production/growth queue,
so changing project does not erase the current turn's credited mineral.

Native `Base::GetProductionSwitchLoss` now supports computer basic-land-unit
switches only in the zero-to-ten opening mineral range and only with zero loss.
Higher stores and computer facility switches remain explicitly unsupported.
Forward selection still uses `select_production`, with its native validation,
mineral arithmetic, update delivery and processing epoch. Human production
switching retains its existing behavior.

The exact main baseline `f5d2483b7710045c94ea067629df700efc9ff24f` reports
two matched scenarios and one mismatched scenario. Before this change the latter
contains six opponent project differences plus University's technology ownership
difference. After this change all six projects match; University still owns
`[6]` instead of `[3, 6]`. The strict scenario therefore remains mismatched:
**2 matched, 1 mismatched, 0 unsupported, 0 errors**. All initial/move/Hold
checkpoints and every other observed player's/base's/unit's/research field retain
agreement. No original input, observation, manifest or passing total changes.

The separate `computer-production` GSE suite covers actual native participant
roles and ordinary queued turns, retained current-turn income, human isolation,
current owned technology and edited source costs, missing/disabled prerequisites,
population and mineral bounds, owned versus foreign support units, existing
projects, deterministic one-city selection, event authority, network guards,
duplicate/stale requests, receipt rollback/retry and dependent-project rejection.
Those are application invariants, separate from the three frozen scenarios.

```sh
python3 tools/behavior-tests/fast.py --suite computer-production --jobs 1
```

Complete AI movement, production priorities, research/acquisition, governor
decisions, later-turn strategy, network control, natural startup placement and
resource stocks remain gaps. The University difference is preserved as strict
failing evidence; no technology-grant rule is inferred from one checkpoint.
