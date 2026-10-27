# Terraforming core implementation ledger

The exhaustive request covers the 19 playable land declarations, seven sea
variants, and ten composite/automation orders in the installed source. Monolith
is editor-only (`Disable` on both surfaces). The shared action IDs come from
`default/game/terraforming_actions.gls.js`.

This document describes application infrastructure, not additional original-game
observations. Source names, prerequisites, work declarations and component facts
are inputs; they do not establish work multipliers, fees or terrain effects.
Original expected observations remain immutable. The master completion ledger is
maintained separately and must retain pending actions until their actual command,
work, terrain and traversal paths have been exercised.

## Explicit technology policy

`game.get_settings().global.rules.get_terraforming_policy()` returns version 1
and `ignore_technologies`. Normal play defaults to `true`, as requested by the
user. `set_terraforming_ignore_technologies(false)` selects real respect-tech
mode. The native Rules codec, copies and settings transfer retain the policy.
Legacy candidate comparison fixtures explicitly request respect-tech mode; this
is not a claim that their availability observations describe the new default.
`Disable` terrain rows and editor-only Monolith remain disabled in either mode.
No policy grants technologies or modifies any player's research ownership.

## Worker and sea access

The native immutable `Def.can_terraform` capability is derived from installed
Terraforming weapon mode 9, rather than a translated unit name or the broad
civilian category. It has a versioned definition-wire extension. Colony modules,
conventional weapons and legacy psi definitions do not implicitly become workers.

A separate `SeaFormers` application composition uses the installed Foil chassis,
Terraforming module, basic armor and fission reactor, with the existing component
cost calculator. It does not enable or reinterpret the disabled predefined
`*Sea Formers` template, append to the three-unit starting inventory, or claim
original recipe availability. The temporary production choice is available in
normal technology-waiver mode. Unverified naval artwork keeps the previous
portrait fallback.

Application naval-worker production uses a water city's own tile or the first
friendly unlocked adjacent water tile in W, NW, N, NE, E, SE, S, SW order. Inland
or blocked launches reject without consuming project credit. Production still
charges the actual mineral price and preserves the existing receipt, population,
worker-link, allocation-ID, random-state and lifecycle rollback guarantees.
This launch order is application policy, not an original-game observation.

## Detached terrain observations

`game.get_tm().get_terrain_state(x,y)` returns version 1, exact native coordinates,
world dimensions, actual neighbor pointers as detached coordinates, center and
four corner elevations, land/water classification, moisture, rockiness, bonus,
raw and named feature/improvement flags, and retained imported provenance.
Unavailable imported values are `null`. Elevations and imported centers are
engine units; the original map's raw height byte is not retained by this API.

The natural-startup test fixture's `audit_snapshot` additionally records every
player's native serialization, all units and bases, terrain, technology ownership
and definitions, research, rules policy, random state and allocation identities.
`audit_inspect` records actual pending native queues. These are read-only audit
seams, not seeded expected results.

## Atomic terrain changes

`apply_terrain(patches, worker_ids)` validates a bounded complete batch before
changing any field. Patches identify coordinates and optional complete named
feature/improvement dictionaries, moisture, rockiness and either four engine-height
corners or an explicit canonical center/class. The two coordinate models cannot
be mixed in one transaction. Duplicate tiles, conflicting shared vertices, invalid fields, out-of-range
values and locked affected tiles reject atomically. Actual shared vertices refresh
all affected centers/classes and invalidate imported provenance only when their
corners change. Existing terrain rendering regenerates neighboring layers and
repositions resident units and bases from the refreshed tile coordinates.

A declared conservative application safeguard rejects class changes that alter a
city's land/sea ground or strand unrelated units. Explicit live capable initiating
workers may finish on a changed class; the command layer must retain ordinary
compatible retreat and reverse-height controls. No drowning, conversion or
teleport behavior is inferred. Native rollback validates the current grid's
lifetime, every affected tile and any new occupants before restoring any field.
It restores shared corners and imported centers/classes together. Changed world
identity, stale terrain, locks and incompatible occupants reject the entire undo.

These engine operations do not define the original raise/lower amount, neighbor
cascade, fee, aquifer flow or improvement replacement policy. Those action-level
outcomes need their own recorded contracts or explicitly declared application
fallbacks and meaningful end-to-end tests.

## Treasury prerequisite

`player.get_energy_state()` exposes native credits, last income turn and the
explicit `initialized` stamp.
`change_energy(delta, expected_credits, turn_id)` and
`credit_energy_income(amount, turn_id)` require authoritative write scope, a live
player, current turn, affordable bounded arithmetic and current balance. Income
is credited at most once per turn. Receipt undo is fenced by native player
lifetime, turn, transaction revision and expected ledger state. Copies and the
versioned Player wire retain balances; exact legacy records remain unfunded zero.
New worlds initialize once from installed RULES row 20 plus their actual faction
ENERGY bonus. A zero reserve is also stamped as initialized. The versioned wire
preserves initialization and eligibility; old unfunded records cannot acquire a
new grant simply through loading. No infinite funds or free height work is implied.

Normal-play income reuses the existing actual base energy allocation's
economy share once per completed turn as declared application policy. Original
income timing and height fee formulas remain unsupported until recorded
separately. The starting reserve is a source declaration rather than a fitted
post-turn balance. The technology waiver never waives fees.

## First foundation checkpoint: verified, incomplete action coverage

The first native runtime is bound to source `ffa9d296` (C++ tree
`ea493cd3c36650d14c12246596da5c22cb0d3201`), FastDebug/Emscripten 4.0.22.
Its JS SHA256 is
`c062e77ab4bb735e8184ea1588b51947d8740e5b7851a13e0a3546b955d5e1de`;
WASM SHA256 is
`7cbedfef7c7a73c400bc922af02e0d91fa7849e8fb29e01f10ce7781302252c5`.
Current host scripts override embedded scripts in the strict isolated workers.

Focused native checks passed 68 scenarios / 213 assertions across terrain,
source-component and land/naval production suites. The terrain suite includes
all-seven-owner completed-turn income from declared resource inputs, pure
preflight, unknown raw flag preservation, an actual capable worker's controlled
land/water transition, ordinary retreat validation, reverse edit and LIFO undo.
These synthetic engine edits are application invariants. They are not original
height-operation, fee or animation observations.

The exact main `048596fe` CI engine (`40396556071`, artifact `12688085153`)
rejects the new native naval recipe and lacks the full terrain observer. A
separate actual mounted-control probe records visible Raise and Lower rows
submitting zero commands while preserving its complete native fixture graph.
That control baseline contains two owners, three units and one base; it is not
seven-owner original agreement. Preliminary reports with invalid test syntax are
retained separately and are not valid feature evidence.

The existing four work effects remain the only action completion implementation
at this checkpoint. The full parser inventory, worker metadata and native edit
API do not count the other actions, sea work variants, height commands or ten
automation/composite orders as implemented. Original height effects, duration,
fees, refunds, cascades, victim handling and energy timing remain unaccepted or
unsupported. Subsequent batches must complete the full requested matrix.

The same immutable runtime also passed 14 compatibility suites: 203 scenarios /
880 assertions, including existing Former controls/work/first ticks/movement,
Rules and unit production codecs, research, turn playability, punctuation input
and exact Float transport. An independent Python raw-bits audit confirmed all
eight numeric samples, including `1/3` and signed zero, using actual native
execution. The strict JSON value equals the exported native binary32 value;
reconstructing merely the same rounded binary32 from a shorter JSON decimal is
not accepted. These checks add no original terraforming agreement totals.

## Combined native checkpoint v3

The combined runtime is pinned to source `bdbe6e420222f92e12d2bfe56a6b25876b894212`
and C++ tree `54d79dd9136f93ae1263bc8b7ab2be5c2bde2005`. Its JS SHA256 is
`4dc26e4d0116f4e31fffd1b258dcad76dd2fef1fe8bf67452208106e08149839`; WASM
SHA256 is `2774ca920a914709bb3671c6440c1269b81803f8bf4188513eaa4a12717cc205`.
The private FastDebug build used two workers and the same verified unchanged
installer outputs as the previous checkpoint. Host GSE source is separately
snapshotted by the isolated test harness.

Canonical center edits retain untouched neighboring gameplay heights/classes
while refreshing shared render corners. Both canonical values and any retained
imported provenance survive real receiving-map serialization and subsequent
`Update()` calls. Direct-corner edits retain their earlier behavior. Invalid
mixed-coordinate batches reject before mutation. These are engine invariants,
not a raise/lower effect algorithm.

The native treasury now validates an entire logical LIFO chain before restoring
any entry. Legitimate multiple credits/debits unwind together; bad middle
tokens, wrong order, duplicates, reuse and equal-balance ABA reject atomically.
New-world initialization from source zero supports fenced undo/retry before
startup and cannot be repeated afterward. Seven-owner startup also verifies
source reserve 10 plus one authored faction ENERGY 100 bonus, without grants
to unrelated owners. Original post-turn treasury agreement is not claimed.

The durable native automation intent and owned home-base identity have real
codec, receiving-owner, detached read, cancellation, strict payload and frontend
synchronization checks (26 scenarios / 68 assertions). A real source-capable
naval worker's production notification sees its originating owned base before
publication; the production receipt still restores project, IDs and graph. The
pointer-target helper has a real seven-owner no-mutation check, including absent,
false, true, removed and malformed named handlers. This metadata and event hook
do not establish functionality of the ten automation commands by themselves.

The new Level primitive reduces one native rockiness category per completion.
The accepted original rate-1 `level-twice-rate1-v2` witness records original raw
2→1→0; the existing importer maps those to native 3→2→1. The candidate checks
the two real successive-turn operations, full terrain preservation, no energy
fee, exhausted movement and cleared work/order. Receipt rollback and stale
receipt rejection are additional application invariants. Stock source rate 8
progress/cancellation remain application checks until stock-rate observations
exist. Seven scenarios / 21 assertions pass. This brings completed primitive
implementation to the existing four actions plus Level, not the full 26 variants.

Final focused checks on v3 passed terrain 37/162, source declarations 25/75,
land/naval production 13/40, native input/target hook 9/64, existing Former work
31/62, source transfer 23/358 and world startup 12/202, in scenarios/assertions.
The initial new initialization test used an unsupported GSE call-index expression;
its failure is preserved and the corrected expression was rerun successfully.
No original expected observations were edited. General height amount, fee,
cascades, remaining primitive effects, sea action completion, all ten plan engines,
resource/traversal consequences and visual timing remain separate pending work.

## Documented primitive functionality checkpoint

The installed player-facing `Manual.pdf` (SHA256
`21d2e5f602ecce969456b0281c017686772002d219d1648ba1b66ffcda640ec8`,
pp46–54) supplies qualitative player rules. No manual pages or game assets are
redistributed. Installed TERRAIN/RULES/RESOURCEINFO numbers and accepted original
observations take precedence over conflicting manual examples. These inputs
justify functional application implementations; they are not new black-box
comparison passes.

Seventeen land primitives and five sea variants now execute through ordinary
work commands, native terrain transactions, movement exhaustion and reusable
rollback receipts. This includes source-backed improvement replacement consent,
sea shelf guards, fungus changes and one-step rockiness reduction. Condensers
apply the documented bounded moisture increase. Aquifers use an explicitly
declared deterministic application route to actual water through nonascending
neighbors; absent drainage rejects before work. Original river routing, condenser
footprint details and all unrecorded validity/replacement contexts remain outside
original-match totals. Land/sea Raise and Lower remain pending numeric policies.

Resource queries now consume actual Ocean, Improved Sea and Borehole source
coefficients, solar elevation bands, enrichment and adjacent mirrors. Resource
caps still require actual owned technologies; the worker availability waiver
never grants a resource-cap technology. Live native technology ownership is used
when research is initialized, otherwise declared faction technologies apply.
Imported unknown improvement owners remain unknown. Newly constructed named
improvements receive only their builder's owner; overlapping roads cannot silently
transfer a sensor. Explicit authoritative transfer and local support consequences
are being integrated separately.

The v4 engine source is `1da3296b` (C++ tree
`a196dd03780a448d4f21f35d92ef2d3f96f29edd`), JS SHA256
`3c65fa5ba297b9dd3e5712dca625cba26606f0014305628302c72ffa78746a15`, WASM
`2e84cad638fed7c02649b53df7dec2fa66a9131999859b4b2222f801dcac63d7`.
Native ownership/transfer/canonical/treasury checks pass 40 scenarios/187
assertions; native plan-phase/home codec and undo checks pass 30/75. The primitive
application suite passes 24/136, resource-source checks 17/48. These are bounded
controlled-world checks. Independent seven-owner whole-world observation passed
ten stages using exact native JSON, resolving the earlier GSE encoding OOM; that
observer proof does not itself establish the new actions' all-owner parity.

## Local support bounded runtime verification

The separate support checkpoint connects documented bunker/sensor defense and
stationary bunker/owned-airbase repair to the existing combat and turn paths.
Numeric defense coefficients are read from actual RULES; two bonuses stack
multiplicatively as an explicit application policy pending original odds probes.
Sensor coverage follows only known native construction ownership, with a pure
range query and an authoritative CAS transfer event/receipt. Unknown imported
sensors never become guessed-friendly. An airbase hook reports site ownership
and refueling permission while explicitly reporting that no aircraft fuel system
is implemented. Full territory/fog, collateral damage and aviation fuel remain
wider-system gaps. `terraforming_support.gls.js` now passes four native application scenarios /
10 assertions on the private PR2 runtime. The report and exact source/runtime
bindings are recorded in `terraforming-height-policy.md`; wider combat, fuel and
fog agreement is not inferred from these local checks.
The height research rotation takes priority over another worker.

Construction-owner transport has two distinct application modes. A reusable
`.gsm` terrain import (including map-only debug startup) has no saved roster
mapping, so every construction owner becomes Unknown (`-1`); all physical
terrain and enhancement flags are retained. Detached tile/map decoding and
in-memory clones preserve the encoded owners. A full world snapshot uses
`Map::LoadWorldTerrain` after its canonical player slots have been restored:
unknown owners remain unknown, registered player owners are retained, and an
empty or absent referenced slot rejects the candidate before the active map is
published. This is an application ownership policy, not original-game border or
conquest agreement.
