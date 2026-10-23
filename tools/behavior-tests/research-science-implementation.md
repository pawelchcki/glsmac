# Directed science ledger and Laboratories report

This is application integration coverage, distinct from original-game evidence.
The optional [initial progress contract](ui/initial-research-progress-contract.md)
and [sparse report control](ui/initial-research-progress-sparse-contract.md) remain
unregistered and outside passing comparison totals. In particular the native
first-city mineral store still differs from those original observations. The
[production stock witness](ui/initial-production-stock-contract.md) corroborates
that discrepancy rather than redefining it away.

The native `Research` component stores each of seven players' selected target,
priority mask, accumulated science and last processed income turn. Science is
independent of technology ownership. `get_research_science(player)` returns a
detached pair; changes require native game write authorization. An authoritative
host event transports owned integer values for player, turn and income, so a
receiving peer applies the transmitted plan without reading its own installed
rules or recomputing city allocations.

Credits apply the explicit planned amount and require an active, unfinished directed-research player, an eligible
selected target and the exact current turn. Negative income, duplicate credit,
invalid authority/types, stale turns and signed integer overflow reject before
mutation. Receipts retain the previous complete research state and require the
current session's monotonically increasing transaction identity for rollback.
The once-per-turn stamp is also restored by an accepted rollback. ResetGame
clears science and stamps together with target/priorities.

Snapshot version two carries all four fields. Version one restores choices with
zero science and zero stamp. Deserialization stages every player and validates
the entire component before replacement; malformed late players, negative
stores/stamps, truncation and trailing data reject atomically. A receiving world
additionally rejects stamps later than its serialized current turn. This is an
internal world transfer format, not a complete original save-file implementation.

The shipped host turn hook sums each owned city's Labs allocation and specialist
bonus using the same production calculation as the base HUD. It captures that
income before queued growth changes population/worked tiles. The host chooses
the planned amount using the player's actual native difficulty. Repeated
[stock timing variants](ui/early-science-variants-contract.md) show Citizen first
crediting at native counter five for both Gaians and Hive, while Gaians on Talent
credits from counter two. The independently repeated
[remaining difficulty timing projection](ui/early-science-difficulty-timing-contract.md)
adds Specialist at counter five and Librarian/Thinker/Transcend at counter two.
A universal native-turn-five rule failed the independent Talent observation and
was removed from the ledger. The host submits zero-credit plans during the
modeled opening delay, still marking the processed turn. The explicit named
difficulty lookup matches these measured openings; it does not establish an
internal cause, later founding behavior or arbitrary faction/policy modifiers.

The larger four-difficulty full-state comparison was rejected: independent runs
differed in Librarian unit count and later Thinker cost. Both complete runs and
the explicit mismatch witnesses remain in the separate v1 context archive.
Fresh original recordings establish only the narrower declared timing projection;
no expected costs or rosters were edited or promoted. The separate
[zero-Labs control](ui/zero-labs-live-context-contract.md) records actual income
zero and a zero balance through counter six, alongside independent live cost
counters. Allocation editing is not implemented by this batch.

F2 and HQ's installed nonseparator source slot five open the read-only
Laboratories popup. Its caption comes from `STATUSLABS`, while accumulated,
per-turn and summary labels use zero-based `LABELS` positions377,378,689. The
selected target name comes from the actual installed technology definitions.
Reopening reads current native science and current city income. Escape, Enter
and the footer button close the report without submitting gameplay commands.
The popup uses the current common-script input policy; expansion precedence and
original pixel/layout parity remain unverified.

The report currently shows accumulated science and the city income estimate.
It does not infer a displayed cost from ownership counts. The separately verified
[human cost helper](research-cost-contract.md) still requires explicit counters
and context; mapping live world state to all those inputs and reproducing the
original cost cache require further evidence. Blind target selection, acquisition,
overflow carried into another technology, target-switch penalties and research
effects are outside this batch. A selected target or growing ledger does not
grant technology ownership.

`research-science` executes the native ledger through shipped handlers, actual
turn-event processing, the actual event codec and a same-Game reset. Extended
`research-controls`/`research-setup` scenarios exercise mounted popup/menu controls,
source label mutations, stale controls, modal ownership and read-only behavior.
The optional Chromium `test:research` additionally delivers actual F2, Escape,
Enter and pointer input to the rendered game. Observer code reads existing state
and control geometry; it does not call gameplay actions. Browser metadata binds
the current production scripts and engine hashes. These are candidate integration
tests, not original screenshots or reference answers.
