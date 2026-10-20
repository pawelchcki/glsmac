# Citizen reconciliation when opening a joined base

`ui.base_open_citizens.v1` compares citizen and control observations from two
fresh original executions per case. It has the same declared fixture and
Enter/Escape/B sequences as [the full base-opening contract](base-open-recalc-contract.md).
Its outputs observe context/title equality, selected role, year difference,
surviving unit orders/movement, owned base count, population, Worker/Doctor counts,
worked-tile count and minerals after every action.

The reference executes the original again for every capture. Its observer
projects those actual observations by excluding the signed native nutrient
counter. It reads no prior observations and calculates no game answers. The
separate full recording is unchanged and remains a strict pending comparison:
its signed nutrient counter differs after opening the joined city. This contract
establishes neither nutrient behavior nor equivalence between that raw field and
GLSMAC's stored-food property.

The unchanged one-Doctor city remains unchanged through two openings. Joining
adds one unassigned Worker on the map; opening the joined city converts it into
a Doctor, preserving population two, the existing Doctor, unworked terrain,
mineral stores, surviving units, selection and year. Closing/reopening preserves
the reconciled state. Natural startup defaults and other populations, terrain,
factions, governor settings, turns and allocation preferences are unobserved.

The reproduction prepares owned-base management through an authoritative,
reversible citizen reconciliation before showing the popup. It converts only
Workers without a tile assignment, preserves citizen identities and existing
assignments/specialists, and chooses no new terrain square. Its rollback,
ownership/stale-command guards and behavior with productive vacant terrain are
application regressions, not additional original observations. Rendering and
popup refresh remain read-only; opening acknowledgement and cancellation must
not change unit focus or open an obsolete selection.
