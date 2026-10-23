# Original-game behavior comparisons

This harness lets reference research produce tests and lets implementation work
fill them. The reference runner executes a narrowly selected function from a
locally supplied original executable. The candidate runner calls production
GLSMAC code. Only synthetic inputs, observed outputs, build fingerprints and
test infrastructure belong in this directory.

For automatic discovery and replay of **real application UI flows**, including
menu choices, selection defaults, keyboard navigation and cancellation, use the
[dual-application UI harness](ui/README.md). Its default replay executes production
GSE menus and native-backed citizen/unit/work behavior without graphics against 754 recorded original cases. The original
custom-map controller also executes headlessly in Unicorn; an optional
Wine/Chromium lane discovers and checks rendered controls. The strict recorder
requires independent repeated original runs. This is separate from both the
helper contracts and the display-free GLSMAC-only regressions below.
[properties.json](properties.json) tracks the wider transfer scope and explicit
gaps; existing passing case totals do not imply complete SMAC parity.

## Hot and stable lanes

[lanes.json](lanes.json) explicitly classifies every current regression, UI,
economy and helper reference ID. A new catalog ID must be assigned to exactly one
lane; duplicate, overlapping, missing and unknown assignments fail validation.
Existing runner commands default to `--lane all` and retain their full catalog
selection. `--suite` and `--domain` selections intersect with the chosen lane.

```sh
# PR gate: regression and recorded UI groups, with two bounded workers.
npm --prefix tools/wasm-tests run test:hot
# Stable complement: run only on main, after merge.
npm --prefix tools/wasm-tests run test:stable
# Inventory only; no candidate execution or agreement claim.
npm --prefix tools/wasm-tests run test:lanes
python3 tools/behavior-tests/lanes.py --lane hot --validate-only
```

During an edit, select the suite or individual recorded case first. Both commands
load the current production scripts into an existing engine without relinking:

```sh
python3 tools/behavior-tests/fast.py --suite unit-menu-orders --jobs 2
python3 tools/behavior-tests/ui/run.py --suite unit-menu-orders --case unit-menu-slot-26-synthetic
```

Use the case IDs from `ui/cases/<suite>.json`; `--case` never substitutes or
rewrites the original observations. Run the hot gate once the focused checks pass.
The npm hot/stable commands default to two workers; use `--jobs 1` explicitly
when investigating isolation or collecting a serial baseline.

Hot contains 29 regression suites around research setup/controls, native research state, installed technology/startup, active unit menus, retirement/recycling,
keyboard controls, modal input, opening phases, pod landing, the interface tour,
automatic turn completion, setup, first-city lifecycle and texture filter chains
(269 scenarios/1,903 assertions). Original UI replay includes ten hot references with 43 recorded
cases. Stable contains the explicit complement: 111 regression suites, 49 UI
references (711 cases), two economy references and 15 current helper references.
These are bounded catalogs, not a full-game
coverage claim. Stable execution belongs on main; PR checks run hot and consult
the latest main stable result. Required-check policy is configured separately.

Completed Colony joining, founding and nearby city warnings, together with Former
and Terraform controls, run in stable. Active unit menus, retirement, recycling
and keyboard controls stay hot. The combined partition retains all 140 native
suites and 59 UI references (754 recorded cases), with five pending references/22
cases still excluded from passing release groups. One local native run pair with
identical scripts/runtime,
two workers and the standard 120-second per-suite limit took 227.96 seconds before
rotation and 122.70 seconds after (46.2% less). These are native replay timings;
CI and UI replay latency require separate measurements.

The lane dispatcher runs groups sequentially, defaults to one worker, and accepts
only `--jobs 1` or `--jobs 2`. Individual runners accept `--lane hot|stable|all` and
`--list`; hot/stable execution also caps each runner at two workers. Use
`lanes.py --runtime /path/to/GLSMAC.js` to select one cached WASM runtime for the
regression/economy/UI groups. Reports label the selected lane and distinguish
integrity validation (`candidate_executed: false`) from actual candidate replay.
Any executed mismatch, unsupported result, error or failed suite returns nonzero.
Rendered comparisons stay optional and separate:
`npm --prefix tools/wasm-tests run test:hot:browser`.

The separate [popup latency benchmark](../performance/README.md) measures real
setup windows with installed assets and matched Release builds. It retains
before/after screenshots and timing scope; its performance samples are not part
of the recorded Original comparison totals.

Opening artwork has a separate optional rendered comparison:
`SMAC_ASSETS_DIR=/path/to/game WASM_APP_DIR=/path/to/app/bin npm --prefix tools/wasm-tests run test:opening-art`.
It replays six real menu checkpoints against independently repeated original RGB
observations at twelve declared backdrop coordinates. These pixel checks require
installed assets and add no cases to the asset-free default UI totals. See
[the bounded contract](ui/opening-art-contract.md); full opening-through-first-round
fidelity remains explicitly partial in `properties.json`.

The separate optional `test:opening-sequence` command uses the same installed
assets and application runtime. It follows actual keyboard or pointer input from
the main menu through Planetfall, the first-base name, the tutorial prompt,
the playable map and Space into the next turn. Two independently repeated
original traces establish ten checkpoints, including native turn counters
0, 0, 1, 1 and 2 for each route. See [the sequence contract](ui/opening-sequence-contract.md).
This checks the declared phases and controls; full-frame visuals, the left-hand
guided Tour route, generated worlds and opponents remain outside these passing cases.

The optional `test:pod-landing:browser` command compares real installed pod frames before
first-base naming. Both confirmation paths have independently repeated original
observations of five rendered frames, horizontal motion and native turn zero.
See [the landing contract](ui/pod-landing-contract.md). Exact trajectory, cadence,
smoke compositing, audio and world visuals remain outside that projection.
The default hot lane separately checks the production playback controller and
synthetic FLIC decoder without installed game assets or pixel rendering.

The default `test:interface-tour` command is asset-free native/WASM replay.
Four independently repeated original traces exercise two own tutorial/label
profiles through first-page End or complete Continue/Close. Thirty-six checkpoints
read displayed topics, controls, MENU/Commlink visibility and edited heading text,
native turn one and unchanged human unit state. See [the declared input contract](ui/interface-tour-synthetic-contract.md).
It needs no installed game, browser or browser dependencies.

The optional `test:interface-tour:browser` command retains installed-data Tour
coverage. Its two independently repeated original traces cover the Tour/Close
prompt, first-page pointer End Tour, keyboard Continue/final Close, ordered
buttons and real MENU/Commlink panel visibility. Eighteen projected checkpoints
retain native turn one and unchanged human unit state. See [the Tour contract](ui/interface-tour-contract.md).
Terrain-dependent pages, pointer/keypad geometry and full-frame rendering remain
outside these contracts. Topic checks read mounted text independently of page
IDs; healthy blank/wrong/stale body mutations are strict mismatches. The current
shared Commlink view proves NO CONTACTS only
when the actual participant inventory contains the local player alone;
foreign-participant diplomacy and contact discovery remain unimplemented.

Main CI restores or builds one compatible headless engine and shares its artifact
with hot, stable and full GSE jobs. The full browser Debug/Release builds remain
fresh so their embedded application data also matches the checked-out revision.
Stable regression, economy and helper groups run independently. Stable UI replay
is partitioned by case position into four CI jobs, with at most two workers in
each job. Full GSE/native engine tests run in four partitions alongside the
application build. Every partition executes the native C++ engine tests and
retains all production scripts and underscore helpers. The aggregate requires
every current script entrypoint exactly once, matching complete source and
runtime hashes, actual scanned-directory membership and successful native engine
tests. Each process keeps the existing twenty-minute limit. Runner/workflow
repair PRs verify the four partitions; ordinary PRs retain their hot lane.

`npm --prefix tools/wasm-tests run test:gse` retains the complete serial run.
Use `node tools/wasm-tests/gse.test.mjs --shard 1/4 --report build/gse-shards/gse-1.json`
for one partition and `node tools/wasm-tests/gse-shards.mjs --reports build/gse-shards --count 4 --output build/gse-coverage/summary.json`
for strict aggregation. A subset is not a passing full-suite result.

`ui/run.py --lane stable --shard 1/4 --jobs 2 --report build/ui-shards/ui-1.json`
selects the first partition after validating its complete original references.
The other three jobs select `2/4`, `3/4` and `4/4`. The required aggregate uses
`ui/shards.py --reports build/ui-shards --count 4 --lane stable --report build/stable-ui.json`
and checks every configured case exactly once, each original evidence hash,
the current production source snapshot, the shared runtime hash, complete
candidate execution and zero mismatches/errors/unsupported results. A missing
partition or stale/partial report fails the release gate. Partitioning never
moves pending contracts into passing totals or runs stable CI on PRs.

Two recorded `base-open-recalc` cases, one
[`world-base-ownership`](ui/world-base-ownership-contract.md) case and six
[natural-first-city](ui/natural-first-city-contract.md) cases, seven archived faction startup cases and six archived startup source-control cases are **pending transfer**, outside default passing release groups. Their explicit strict red
replay remains available:

```sh
python3 tools/behavior-tests/lanes.py --lane hot --pending
# Equivalent explicit kind:
python3 tools/behavior-tests/lanes.py --lane hot --kind pending-ui
```

The ownership recording observes seven owners with one base each after the
declared first-city setup. Its candidate uses the actual production
single-player initializer and queued world startup; the initializer currently
fills only the human slot. Computer controllers and later turns remain gaps.
This pending comparison adds no passing original cases.

The natural first-city probe executes native configure/create_world, InitComplete,
FirstTurn and the settled host queue with shipped mechanical modules. The preserved baseline created
one Worker and one worked tile with zero stored minerals; stock original
recordings at all six difficulties have one specialist, no worked tiles and a
raw mineral field of nine. All six cases now match population
and worker state after the growth fix; the mineral field remains pending.
Automatic growth now uses a Doctor when no legal vacant tile has a positive
resource score. Verification of the bounded change is separate from the full
strict pending case, which adds no passing original cases.

The thirteen preserved faction/source-control startup inputs now have a separate
[native-backed pending replay](ui/natural-first-city-profiles-contract.md).
All seven stock-faction comparisons still differ in stored minerals. All six
full source-control comparisons remain explicitly unsupported because their
original setup-size scalar has no established native equivalent. Four supported
stock/TECH inputs also execute native startup and retain diagnostics; those are
not projected passing comparisons. Raw Formers Cost4/Cost8 are additionally
unsupported by the production unit parser. These thirteen pending cases add zero
passing original cases and preserve the exact archived evidence bytes.

The complete twelve-input `unit-menu-context` reference is HOT and supersedes
three archived pilots. Their case/evidence files remain unchanged and receive
static integrity validation without duplicate passing counts. The active UI
catalog has 58 references and 750 cases. Pending base recalculation remains a
strict red comparison outside passing totals. Four historical factor-v1
helper references are archived metadata with
static integrity validation only; they are outside current runnable groups.

## Fast parallel gameplay and UI checks

Build the FastDebug WASM app once using [the browser build instructions](../../web/README.md).
After that, changing GSE tests or production GSE scripts needs **no relink**:

```sh
npm --prefix tools/wasm-tests run test:fast -- --jobs 2
```

Eight [Terraform-menu work traces](ui/terraform-menu-work-contract.md) connect Farm,
Mine, Forest and Road to the existing native work handlers, with source identity
preserved under renamed inputs. Two [Colony-menu join
traces](ui/colony-menu-join-contract.md) connect the owned-city Action command,
including actual citizen changes, Pod consumption, selection and menu lifetime. Every
original trace was recorded twice independently. All ten match native replay; two
Terraform cases also match actual browser pointer controls.

Three further [Terraform presentation traces](ui/terraform-menu-presentation-contract.md)
compare the ready Former row membership, actual text colors and source-derived
work times, plus retained header highlighting through Escape, Tab and root
reopening. Rates one through four and edited names are inputs. Literal original
suffixes are retained; no Colony eligibility rule is inferred from a header
toggle. Eleven native application scenarios/69 assertions separately guard live
selection, eligibility, prerequisites and control lifetime. Advanced command
callbacks and broader terrain/technology contexts remain outside this batch.

The existing nineteen-scenario Action-menu regression is split into three
independent workers: orders (7/74), rows (4/352) and lifecycle (8/17). Every
original assertion and native path is retained under the same timeout. Optional
display-fixture dimensions remove redundant per-node wrappers; this changes no
production renderer or gameplay result.

The regression catalog exercises production movement/combat/spawn events, deterministic
random draws and rollback, base growth/starvation and worker decisions, menus,
map/faction selection, base navigation, turn controls, popups, prompts, timer
cleanup, terrain labels, the visible Skip Turn action, geometry and technology
bindings, facility and Colony Pod production, and technology/production snapshots. Older
assertion-only scripts count as one file scenario; the remaining scenarios have
individual names. This is current
GLSMAC regression/invariant coverage, separate from original-game parity.

The `ingame-menu` suite adds ten scenarios/65 assertions for installed menu
definitions, lazy child mounting, source-slot callback identity and native
land/water wording. Twelve independently repeated [original menu traces](ui/ingame-menus-contract.md)
cover nine headers and source-driven presentation/navigation at 63 checkpoints.
The comparison executes production scripts and native parser/state without
assets or pixels; actual browser input is checked in a separate lane. This
presentation contract excludes row effects, enabled semantics, hints, shortcuts
and complete menu/game behavior.

Six independently repeated [Action-menu command traces](ui/unit-menu-orders-contract.md)
match display-free native replay and actual browser controls at thirty complete
checkpoints. In the declared healthy, unspent Scout fixture, source slots
26/29/30 apply Sentry/Hold/Skip, advance selection to the Former while retaining
the root menu, and Tab selects the Colony Pod while closing the root. Both
synthetic and edited-label profiles preserve source identity. Nineteen separate
application scenarios/443 assertions cover shared handlers, native receipt
authority, failed submissions, popup/pending guards and stale callbacks.
A separate `unit-menu-context-orders` HOT suite adds one native Former/Hold
restoration scenario/11 assertions in a fresh worker. Combining all twenty
fixtures exceeded the frozen WASM runtime's 2 GiB limit during exit; the strict
failure is retained. The split preserves every assertion and changes no runtime
limit or production code; it does not establish a product memory-leak cause.
The complete [Action-menu context reference](ui/unit-menu-context-contract.md)
contains twelve independently repeated inputs and 78 complete checkpoints:
Former and Colony Sentry/Hold/Skip under synthetic and edited source wording.
All twelve match strict current-production/native replay. Five selected context
cases have actual browser pointer/SDL verification; this does not claim a full
twelve-case rendered replay. The Former/Colony Action children retain twenty and
twenty-two rows with observed light source labels and four/five separators.
The full reference supersedes three immutable pilots: nine additional inputs
are counted, with no duplicate pilot passes. Other rows, initial orders, spent
movement, active work and turn effects remain outside the contract.

The `native-input-state` suite adds seven scenarios/41 assertions for the shared
production text-edit state used by real UI fields and display-free replay.
It covers exact assignment, independent buffers, printable/Backspace/Enter,
modifier and Insert fallthrough, the existing clipboard filter, rejected raw
key descriptors and an optional field length limit with an unlimited default. Drawing, focus and platform delivery remain browser boundaries.
These are application regressions, separate from original Rename observations.

The `base-rename` suite adds 13 scenarios/59 assertions for production Rename
controls, native validation/rollback, receipts, saved-method lifetime and modal
cleanup. Eleven independently repeated [original Rename traces](ui/base-rename-contract.md)
match native replay and actual browser controls, including raw names, cancel and
reopen, source precedence and the observed 24-character field limit. Installed
common Script.txt RENAME and labels.txt supply the dialog. Native text fields
and display-free tests share production InputState; focused text now receives
x/z before map zoom. Unicode, duplicate-name behavior, other cities and complete
base-management parity remain unobserved.

The `unit-sentry` suite checks persistent native Sentry orders, readiness,
receiving-world serialization, authoritative guards, rollback, production L
controls and popup blocking with a valid selected unit. Eight independently
repeated [original Sentry traces](ui/unit-sentry-contract.md) also match native
display-free replay and actual browser controls through one paused turn.
Enemy-triggered waking, transport boarding and original Sentry work-cancellation
behavior remain outside those observations. Four further Sentry activation
traces compare actual picker confirmation/cancellation and W/Tab focus, including
activation without refunding spent movement. The native navigation notification
path is shared by frontend controls and display-free tests.

The `colony-join` suite executes production B and visible button controls against
native base/unit state. Its 31 scenarios check preserved citizens and worker
links, unassigned joined workers, stored resources, consumed-unit lifetime,
selection delivery, rollback, stale requests and popup/pending guards. A sole-Pod
case also checks the transition to Base preview while preserving assigned workers;
browser regressions check the joined base screen and input after native consumption.
Ten independently repeated [original join traces](ui/colony-join-contract.md)
match display-free replay and real browser B/W/Tab. The declared initial city
has one Doctor and nine stored minerals; this does not establish natural startup
defaults or population limits. Run browser comparisons with
`SMAC_ASSETS_DIR=/path/to/installed/game npm --prefix tools/wasm-tests run test:colony-join`.

The `base-citizen-reconciliation` suite adds 26 scenarios/85 assertions for
owned-base management preparation. Closed-map joining keeps its unassigned
Worker; opening reconciles it to a Doctor without assigning terrain. The native
transaction preserves assigned Workers, specialists, citizen identities, variants,
food/mineral stores and production, and emits frontend updates on apply/undo.
Production opening waits for its matching acknowledgement; cancellation, changed
focus, another modal and replacement panels cannot open an obsolete selection.
Foreign inspection stays read-only. Two separately recorded
[citizen-opening traces](ui/base-open-citizens-contract.md) match native replay and actual browser controls;
the full signed nutrient-counter contract remains pending. Run real browser
controls with `SMAC_ASSETS_DIR=/path/to/game npm --prefix tools/wasm-tests run test:base-open`.

The `base-growth-worker-links` suite adds four native scenarios/31 assertions.
Growth excludes other base centers and already claimed terrain before ranking
vacant squares, and retains the Doctor fallback when none are available. This
fix prevents invalid Worker links from blocking management of nearby bases.
The 32-turn browser construction scenario checks reciprocal non-base Worker
links while navigating between two owned cities. These are application
regressions, separate from the bounded original opening observations.

The `base-resource-hud` suite adds six scenarios/166 assertions for native
resource labels, initial allocation, read-only refresh, population updates,
deficit recovery and cell cleanup. Two independently repeated
[original HUD traces](ui/base-resource-hud-contract.md) match display-free replay
and real Enter/Escape/B browser controls on first opening and reopening.
Result labels include the observed equals prefix and signed zero, status follows
the displayed shortfall, and initial allocation is 50/50/0. These observations
do not establish allocation editing, arbitrary rounding or general economy rules.

The `starvation-dialog` suite adds 11 scenarios/87 assertions for queued native
growth, pending confirmation, ownership/state guards, rollback and observer-safe
acknowledgement. Five independently repeated [original notification traces](ui/starvation-dialog-contract.md)
match display-free replay and actual browser controls. Common installed STARVE
text and indexed labels drive the popup; population stays two until confirmation,
then loses one citizen and continues to Zoom or the map. Run the browser lane
with installed assets and `npm --prefix tools/wasm-tests run test:starvation-dialog`.
Suppression activation, notice Escape, artwork/audio, mineral processing/order,
raw nutrient counters and general economy remain outside these observations.

The `starvation-mineral` suite adds seven scenarios/41 assertions for live mineral
income, balanced-food controls, native once-per-turn receipts and rollback/retry.
Two independently repeated [original first-turn traces](ui/starvation-mineral-contract.md)
match native replay and actual browser input: the control earns one mineral,
while the starving city keeps nine at its notice and after Proceed. The fix
changes credited income for incomplete projects and preserves the displayed
surplus and existing native completion behavior. A threshold-crossing regression
checks the latter using the native effective price. Project prices and
completion, raw nutrient-counter meaning and general economy remain excluded.
Run `npm --prefix tools/wasm-tests run test:starvation-mineral` with installed assets.

The `starvation-notice-controls` suite adds eleven native scenarios/112 assertions
for Escape, Shift+Escape and immediate suppression activation. Four independently
repeated [original control traces](ui/starvation-notice-controls-contract.md) match
native replay and actual browser input. Normal Escape confirms the highlighted
choice, Shift+Escape preserves the pending notice, and suppression confirms
Proceed. Receipt authority, delayed acknowledgement, duplicate/stale input,
rejection/retry, cleanup and rollback have separate application coverage. Future
suppression preferences and later notices remain unobserved. Run
`npm --prefix tools/wasm-tests run test:starvation-notice-controls` with installed assets.

Two native foreign-base income regressions check that center and worked-tile
yields use the actual owner's technology caps, in both cap directions, and
preserve city state and reciprocal worker links. This suite remains HOT while
opponent startup and turns are being developed. These are application
regressions, not additional original-game observations.

The `land-resource-sources` suite checks installed forest/farm/mine coefficients,
independent cap prerequisite tokens, actual native faction ownership, detached
configuration/results and invalid-source rejection before registering callbacks.
A separate 576-case original executable contract checks bounded land-worker
yields; see [the economy comparisons](economy/README.md).

The `terraforming-rules` suite checks installed `TERRAIN` action names, work
rates, prerequisites and order templates for farm, mine, forest and road.
Normal game configuration imports those declarations; two browser source
profiles verify the actual configured values. The `unit-work-state` suite
checks native progress ownership, inactive retained work, write authorization,
stale methods, frontend order delivery, receiving-world serialization and
malformed-record rejection. Hold/Activate rollback restores the complete prior
work state. These are application prerequisites, not original work-time parity.

The `terraforming-native` suite checks actual tile edits, detached reads,
unrelated improvement preservation, write/lock/coordinate guards, retired-world
methods, copied frontend packets, sprite-cache removal and random-state
restoration on success and failure. Runtime edits regenerate affected terrain
and neighbours, update sprites and selected previews, and preserve frontend
ownership through shutdown. The two asset-backed browser profiles apply four
declared edits, verify native resource income and unchanged stored food/minerals,
compare image regions in the map and preview, reject unexpected loading modals,
and exit the engine. These fixture edits do not simulate Former work.
The `former-work` and `former-controls` suites contain 46 scenarios for source-driven
work, cancellation, completion before base income, command rollback, native
guards, visible controls, authoritative results, labels and shortcuts. The
first playable scope is one healthy ordinary Former on flat arid non-base land.
Farm, Mine, Forest and Road buttons and F/M/Shift+F/R send authoritative commands;
Activate cancels active work. Retained work transfers between tasks; Mine-to-Farm
is the recorded cross-action case. Farm-to-Forest replacement requires the
installed dialog confirmation and keeps the Farm until completion. Other terrain,
other replacements and cooperative work remain unsupported. Eight independently repeated original
work traces now match native display-free replay; see
[the exact work contract](ui/former-work-contract.md). Additional action/control
regressions are application tests, not additional original observations.
The held-out timing cases add edited Road completion and first-year Farm
cancellation/resume. The first tick stays earned and movement stays exhausted;
resuming the same task adds no work. The `former-first-tick` suite adds six
regressions for completion, repeated cancellation/resume, guarded task changes
and exact receipts. Previously frozen observations remain unchanged.
The `terraforming-dialog` suite adds eight scenarios for installed MIMIMI
caption/body/choice consumption, parameterized improvement names, detached
results and malformed-source rejection. The real replacement flow also checks
Cancel/Continue delivery; removal, stale callbacks and changed authoritative
state cannot submit another order.

```sh
SMAC_ASSETS_DIR=/path/to/installed/game npm --prefix tools/wasm-tests run test:former-work
```

All eight browser work traces use real shortcuts, native event transport and actual
turn advancement on a declared small arid world, compare every frozen work
checkpoint, check source order labels, save one final frame and exit the engine.

Three additional [road/work comparisons](ui/former-movement-contract.md) now
transfer three road steps per turn and Farm work after one or two moves. Same-year
cancellation retains that tick and exhausted movement; same-task resume grants
no extra tick. The next-turn cancellation restores full movement and retained
prior work. Installed `RULES` supplies the road rate. The `movement-rules` and
`former-movement` suites add source, actual native movement/animation, locking,
rollback and exhausted-resume regressions. Alternate rates are application tests,
separate from the unchanged-rate original observations. `test:former-work` also
drives these three frozen traces through real browser arrows, F/A and turns.

Two further [road-network comparisons](ui/road-network-contract.md) verify implicit
base road entry/exit and flat arid forest roads. Bases connect without acquiring
an explicit road flag. Native regressions check missing non-base roads, live
edits, exact rollback, exhaustion and turn restoration; the browser lane drives
both traces with actual arrows. Moisture and rockiness variation remain unobserved.

The actual native/WASM thread probe deliberately holds collection and worker
traversals in flight. Shutdown joins collection, drains background iterations,
removes UI timers/listeners and script state while game data remains alive, then
finishes background teardown. The browser work traces exposed a late `get_player`
read after backend state was cleared; exit is now a strict regression check.
This thread-lifetime coverage is separate from original gameplay observations.

The `unit-source-transfer` suite mutates synthetic installed component records and
executes shipped consumers, definition events and startup against native managers.
Its 23 scenarios check names and definition codecs, movement on all three basic
land units, civilian/conventional strength separation, armor, all seven standard
and native morale labels, renamed/reordered component aliases, cost forwarding
and detached results. Technology cases check actual native production choices
and the opening project, including a renamed prerequisite and a nonmatching
case variant. Terrain, coordinate draws, one selected owner, artwork/frontend
delivery and base population initialization are controlled. These are application
integration checks; the six independently recorded original inventory comparisons
remain separate.

The `turn-playability` suite exercises consecutive production event sequences,
movement restoration, healing, completion/uncompletion and stale confirmation
callbacks. `world-startup` controls coordinate draws to check bounded placement,
land/naval starts, spacing and failure before initialization events. These are
GLSMAC regressions; their mocked native boundaries do not establish original
rules or prove the native lifecycle works.

For the actual browser lifecycle, supply your installed original assets:

```sh
SMAC_ASSETS_DIR=/path/to/installed/game npm --prefix tools/wasm-tests run test:gameplay
```

The five synthetic-world cases use current host production scripts,
real rendering/input and read-only backend telemetry. They check terrain labels,
base navigation, Skip Turn, next-turn movement restoration, a keyboard move and
opening the destination base. The production case cancels and confirms the facility picker,
then constructs Recycling Tanks through real turn controls, checking each mineral
credit, completion, overflow and the refreshed base screen. Completion also
raises actual base-square nutrients, minerals and energy by one each and pending
mineral production by one in this reproduction fixture. Two separate paths
move a Colony Pod, check modal blocking, found via B or FOUND BASE, open the new
base and advance another turn after consumption.

The worker-assignment case clicks the actual resource-map diamonds to turn a
Worker into a Doctor, assigns a different productive tile, checks the refreshed
resource labels and all three native worker links, closes/reopens the screen,
and advances a real turn to verify the new food and mineral income. Its declared
imported terrain and normal base initialization are controlled GLSMAC fixtures.

The additional `normal-game.test.mjs` case uses the real New Game menus to
choose Tiny and Gaians, generates terrain through the production world path,
opens Headquarters, verifies one conventional Scout and the Ecology-enabled
initial Former project, skips the Scout, advances a turn, verifies
movement replenishment and reopens the base. It then switches to a Colony Pod at
size one while retaining the initial project's earned mineral credit and follows naturally earned food and minerals through actual growth
and construction, with a fixed 32-turn ceiling. Every credit, population charge,
project clearing and retained overflow is checked. Read-only stage/child-event
observations require growth to settle before the next turn. The original
Scout survives and a distinct new owned Pod appears. Its injected entry
adds read-only telemetry; it supplies no world/map/RNG, population or mineral
override. Run it separately with
`npm --prefix tools/wasm-tests run test:normal-game`. These browser regressions
do not establish original-game agreement. The additional
`colony-production.test.mjs` case starts with three actual workers on controlled
productive terrain and no seeded pods or minerals. It earns 12 minerals toward
Tanks, previews and cancels an active switch, then confirms the recorded
one-mineral loss before finishing a Colony Pod. It checks every mineral credit
and population charge, moves the first
constructed pod and founds a base, then manually constructs a distinct second
pod. Run it separately with `npm --prefix tools/wasm-tests run test:colony-production`.
Browser failures and graphics errors remain failures.

The production suites cover a bounded GLSMAC facility-building policy, separate
from original-game economy comparisons. An owner selects an available unique
facility; subsequent turns credit the nonnegative mineral surplus captured before
growth changes workers. Each turn credits once. Completion installs the facility,
clears the project and retains overflow. Idle bases do not accumulate minerals.
The shipped project is Recycling Tanks, using four declared mineral rows when an
explicit named map preset is known: 32
minerals for Tiny, 36 for Small, and 40 for Standard/Large/Huge under the modeled
human rule10/INDUSTRY0 setting. Explicit Custom kind 99 uses 40 minerals. Unknown dimensions and imported maps retain its
explicit 32-mineral fallback. Its base-square resource bonus is checked separately
against original observations.
A bounded land Colony Pod project is described below. The native construction path also accepts defined static land units with no
population charge; shipped land choices include Scouts, Colony Pods and Ecology-gated Formers. The
`land-unit-production` suite checks size-one Scout/Former construction on
synthetic declarations, worker preservation, rollback, actual codecs and guarded
non-land rejection. These are application prerequisites for the six original
[first-base inventory cases](ui/startup-inventory-contract.md); construction checks
remain application coverage beyond the original inventory observations. Queues and hurrying remain absent. Bounded active switching is described below.

`facility-cost-native` and `facility-cost-completion-native` check that actual
Player descriptors and Base completion share the same effective cost. Declared
rows and preset provenance survive their native codecs; unknown dimensions,
imported maps, unmodeled roles and facilities without rows retain declared
mineral costs. Dimension changes clear provenance, and live settings wrappers
stay consistent through native decoding and lobby apply/rollback. The factor
comes from the recorded original contract; row declarations and item completion
are GLSMAC application tests, not additional whole-item original observations.

`base-production-native` uses real Base, Player and registry code with a synthetic
asset-free native world. It checks write guards, integer validation, notifications,
rollback and production snapshots restored into a fresh receiving world. The
fixture supplies graphics and event-loop boundaries. `base-production`
checks production events and turn integration; `base-production-ui` checks the
actual picker and base-screen scripts with controlled display/native boundaries.

`growth-production-sequence` follows an actual native Tiny base from one
worker and zero stored food/minerals through idle food accumulation, growth,
Colony Pod completion and same-turn regrowth. It checks pre-growth mineral
credits, consumed citizen identity and worker links released before reclamation.
Synthetic terrain yields and manual turn delivery are controlled boundaries.
The worker and doctor undo cases execute the shipped growth event against
native objects, restoring food storage and worker links while preserving the
existing monotonic allocation counters. These are GLSMAC application checks,
separate from recorded original factor observations.

`player-copy-native` checks independent native production payload ownership,
descriptor values and removal/destruction lifetimes for the player copies used
by connection notifications. `pop-snapshot-native` restores populated bases with
definition IDs different from display names, checks receiving parent bindings,
variants, next population IDs and production state, and rejects an unknown type
without replacing the receiving world. These bounded codec tests do not establish
complete world save/load.

`base-work-snapshot-native` runs shipped growth, worker and production callbacks
over real native bases, populations, tiles and resource managers with controlled
terrain yields. Fresh deferred decoding preserves accumulated nutrients, pending
production, population IDs and receiving worker/backlink identities. Complete
base batches validate centers and worker claims before attaching them; malformed
references and conflicting later records leave no partial tile assignments.
Ordinary startup preserves IDs, while an explicit empty snapshot restores its
next ID once. These checks cover the current internal snapshot format, not
original save files, old-format migration, complete world replacement, graphical
spawn callbacks or a save/load menu.

The colony suites add land expansion through constructed Colony Pods. Dedicated
command fixtures seed a Pod; ordinary startup now follows the recorded one-Scout
inventory and initial project. They also check
shared FOUND BASE/B eligibility, immediate worker assignment or doctor fallback,
and a native transaction that consumes the pod after base initialization. Native
tests check exact pod state, worker links, names, RNG and IDs through failure and
guarded rollback, plus rejection of stale commands, foreign stacks and civilian
attacks. The prototype uses an existing static portrait; authentic vehicle models,
naval pods and original founding/movement rules remain
outside this feature's coverage.

`objects-list-lifecycle` uses native entities and the shipped tile list to check
same-tile founding updates, queued input after removal, live ID resolution and
owned deferred base-screen callbacks.

`async-lifecycle-native` exercises the actual scheduler with controlled equal
deadlines: sibling/self cancellation, replacement, repeat, stop-all and handle
isolation. It does not force concurrent collection. The browser founding flow
exposed an Async GC race; queue processing and rescheduling now share the existing
collection guard, and synchronous timer operations enforce interpreter ownership.

`event-result-native` checks local acceptance/rejection notifications, immutable
scalar request identity, optimistic/deferred response handling and safe outgoing
serialization before commands delete their payload objects. It exercises actual
event processing and connection queues with a synthetic transport; it does not
establish complete multiplayer synchronization.

The `game-modal-input` suite initializes the production game UI and checks modal
consumption, listener cleanup and popup timer cleanup on restart. The
`map-size-keyboard` suite checks both inputs, validation/correction, completion
versus cancellation and the real setup stack. Only the four recorded keyboard
navigation cases establish original agreement; dimension values and limits
remain reproduction regressions.

The worker uses the actual WASM GSE parser/interpreter and production scripts.
Only native managers, display nodes, input events, animation completion and
random inputs are replaced where a fixture needs control. UI tests check
transitions and emitted commands, not pixels, font layout, hit testing or real
browser input routing. Browser smoke tests remain in the existing suite.

Each process gets fresh engine state, a unique prefix and the same immutable
script snapshot. Scripts live under an isolated virtual root, so deleting a
host module cannot accidentally run its old embedded copy. Reports identify
both runtime hashes and the script snapshot hash, and reject a runtime changed
during execution. Rebuild the engine after C++ changes; run builds and tests
sequentially. Default concurrency is at most four workers and can be reduced on
memory-constrained machines. The catalog places longer suites first.

```sh
python3 tools/behavior-tests/fast.py --list
python3 tools/behavior-tests/fast.py --domain ui --jobs 4
python3 tools/behavior-tests/fast.py --suite gameplay-events --suite base-decisions --jobs 2
```

Failures, crashes, timeouts, skipped scripts, zero assertions, missing completion
markers and partially completed scenarios all fail the run. Reports include
named scenarios, actual assertion counts, durations and failure output.

CI has a separate parallel **Fast headless behavior** job. Its engine cache is
keyed by C++ sources, native test bindings, CMake, compiler/toolchain version and
build inputs. A cache miss builds the engine once; script-only changes reuse
the engine but always execute fresh scripts. The full native/WASM/browser jobs
and Pages publishing remain gated, and the headless report is downloadable as
the `headless-behavior` artifact.

## Original observations and implemented contracts

The `map.same_row_distance.v1` contract measures distance between two
valid tiles **on the same row of a round map**. Ninety cases cover all coordinate
pairs on widths 4 and 8, both row parities, wraparound in both directions,
half-width boundaries, widths 80/128/4096 and high row numbers. The checked-in
observations were captured twice from the original GOG Alien Crossfire v2.0
`terranx.exe`, SHA-256:

```text
01901cbf7196b0c5d0df9540a029520f5df8fd9a6b343deef8b5663872805fcf
```

The reference calls original `x_dist` at `0x00579790` and converts its horizontal
coordinate units into tile steps by dividing by two. It initializes all three
map globals read by that function. Each case gets a fresh x86 emulator; the
original entry point is never run. Execution is limited to this function and
its original `abs` dependency, with memory, stack, register, instruction and time
checks. There are no substitutes for original function results in this runner.

GLSMAC's existing distance calculation is shared with its tile manager through
`src/game/backend/map/tile/Geometry.h`. The candidate adapter compiles this same
helper as native C++ or WASM. This extraction preserves the previous arithmetic.
The original's general `vector_dist` has different semantics: the same-row cases
make no claim about arbitrary two-dimensional distances or flat maps. The
separate vector contracts below cover that bounded score. Neither distance
contract measures movement costs, tile yields, combat or AI.

There are also **1,692 additional original observations** across seven versioned
contracts: raw/coordinate vector distance, technology possession, weight
category, research availability, bounded prerequisite queries and the human
nutrient cost factor without base effects. Their precise
fixtures and exclusions are in [contracts.md](contracts.md). The C++ helper
reference set also includes **5,531 ability-free prototype cost cases** and
**5,679 human mineral-factor cases** and **2,528 basic production switch-loss
cases**, plus **24 fixed-Custom nutrient/mineral factor cases** and **20 calibrated zero-rating witnesses**, making **15,564 cases** in total. These probes cover small rule helpers; they do
not constitute a complete economy, AI turn or research planner.

A separate [economy script lane](economy/README.md) replays **504 original
base-square resource cases** through the shipped GSE callback without rendering
or assets. It transfers Recycling Tanks’ nutrient/mineral/energy increments and
checks Headquarters/river combinations in a precise synthetic fixture. It uses
the WASM interpreter with controlled native inputs and is separate from the
15,564 native/WASM C++ helper cases. Run it with
`python3 tools/behavior-tests/economy/run.py`; CI requires agreement.

The bounded C++ contracts are implemented by shared production GLSMAC helpers.
The vector helpers expose the original vector score separately from tile steps.
The technology table implements possession, weight classification, availability
and bounded prerequisite queries. The installed-source consumer populates that
table at world creation; research planning remains unimplemented. The mineral-factor helper transfers the
recorded map-preset and industry behavior. Recycling Tanks now uses its explicit
row declaration with known named presets, installed multipliers and initial faction INDUSTRY; social policy choices,
AI/difficulty and per-base cost effects remain outside this integration. The candidate adapter calls these same
helpers for native and WASM replay:

```sh
npm --prefix tools/wasm-tests run test:parity
```

This checks all **15,564 cases**. It runs independent reference suites in
parallel; each result remains bound to its recorded input hashes. Run both
compilation targets with:

```sh
python3 tools/behavior-tests/audit.py --target native
python3 tools/behavior-tests/audit.py --target wasm
```

The WASM target requires the Emscripten SDK and Node.js. To validate all recorded
evidence without executing a candidate, use the explicitly separate operation:

```sh
python3 tools/behavior-tests/audit.py --validate-only
```

Evidence validation reports no parity score. CI strictly compares all recorded
contracts on native and WASM candidates. Never change original observations to
match the candidate.

Gameplay scripts can call `game.geometry` for the three distance queries and
`game.technologies` for table definitions and technology predicates. Technology
mutation keeps the engine's event write guard; restarting a game clears the
table, and world snapshots carry its definitions, weights and ownership. Faction
arguments are original ownership-mask IDs (0 for native life, 1–7 for factions),
separate from GLSMAC player slot indices. The `behavior-rules` suite exercises
these production bindings, lifecycle reset and snapshot validation.

## Installed technology definitions and starting ownership

Normal and Quick Start configuration now parse all 89 `TECHNOLOGY` declarations
from installed `alphax.txt`. Source order supplies native IDs; abbreviated tokens
resolve both prerequisites after the complete table has been read. Names and
validated flag text remain metadata. The four source AI weights map to the
native growth/technology/wealth/power order. See the precise
[source schema and exclusions](../smac-data/technology-source-contract.md).

A host startup event initializes the native table and concrete faction starting
technologies before first-turn effects, including the interactive opening at turn
zero. The host plans and validates every faction TECH before queuing world
creation, so incompatible inputs abort without spawning a partial world. Its
complete scalar table travels in event data; recipients validate that payload
without recomputing their own installed declarations. GLSMAC slots 0–6 map explicitly to native
ownership-mask faction IDs 1–7. Duplicate TECH tokens do not duplicate ownership;
numeric free-tech choices remain outside this batch. The native `replace` binding
validates all 89 rows before one table replacement; `get` returns detached row
data, and `validate_replacement` checks a whole plan without mutation. Replacement
retains native write authorization and snapshot transfer. ResetGame clears the
initialization marker alongside the native table for the next session.

`technology-sources` and `technology-startup` add 27 application scenarios and
121 assertions for source parsing, malformed late rows, independent ownership,
availability, atomic replacement, receiving snapshots, actual shipped startup,
once-only initialization and receipt rollback. They include ordinary/interactive
startup, host event serialization with different receiving sources, invalid
mandatory-plan rejection and an actual reset/second startup on the same native
Game with changed ownership. The startup fixture supplies
declared terrain and synthetic text, with artwork/sound definitions explicitly
omitted; other gameplay events execute their shipped handlers. Run:

```sh
npm --prefix tools/wasm-tests run test:technology
```

Local installed-file checks load the complete table and all fourteen factions'
concrete TECH declarations without committing asset bodies. These are source
integration checks, separate from the unchanged 632 recorded native/WASM helper
cases. Research choice UI, costs/progress, acquisition effects, flag effects and
complete save/load remain unimplemented or unverified.

## Fixed gameplay and UX regressions

The five previously failing probes now run in the required passing catalog and
the default GSE suite. Their expanded cases cover the original failures and
related dismissal, retry and rollback paths:

| Suite | Fixed behavior |
| --- | --- |
| `base-growth-regression` | Growth with no unworked tiles creates a doctor |
| `combat-rollback-regression` | Restoring a casualty preserves its spawn descriptor |
| `faction-retry-regression` | A chosen faction survives a rejected start and error dismissal |
| `popup-sound-regression` | Replacing a quit popup stops its owned speech exactly once |
| `popup-resize-regression` | Resizing during popup exit delivers the pending result exactly once |

```sh
npm --prefix tools/wasm-tests run test:regressions -- --jobs 3
```

`test:known` remains an alias for this focused regression command. There are no
remaining red probes from this set. Keep future confirmed defects in a separate
`known-issues.json` catalog until fixed; the worker executes non-underscore
aliases for those probes to avoid the engine's underscore skip rule. A skip
never counts as an expected failure or a pass.

## Compare without the original game

Run from the repository root. Python 3 and `g++` are sufficient for the native
comparison; no Python packages or original assets are required:

```sh
python3 tools/behavior-tests/compare.py compare \
  --cases tools/behavior-tests/cases/map-distance.json \
  --reference tools/behavior-tests/observations/smacx-gog-2.0-map-distance.json \
  --command 'python3 tools/behavior-tests/glsmac.py --target native' \
  --report tools/behavior-tests/.build/native-report.json
```

To run the same cases against actual WASM, activate the project's Emscripten SDK
and use Node.js:

```sh
python3 tools/behavior-tests/compare.py compare \
  --cases tools/behavior-tests/cases/map-distance.json \
  --reference tools/behavior-tests/observations/smacx-gog-2.0-map-distance.json \
  --command 'python3 tools/behavior-tests/glsmac.py --target wasm' \
  --report tools/behavior-tests/.build/wasm-report.json
```

`EMXX` can select an Emscripten compiler path. Each candidate invocation builds
in its own temporary directory, so comparisons do not share stale binaries.
Exit status is **0** for complete agreement, **1** for mismatches or unsupported
candidate algorithms, and **2** for invalid evidence, malformed responses,
crashes or other execution errors. Reports identify each case and differing
JSON paths. Outputs are compared exactly, including field presence, types and
trace order. Unsupported or missing cases never count as passing.

The CI workflow runs native checks and the implemented WASM comparison from
recorded observations. It does not download or execute the original game.

## Capture or compare with the original

Install the optional reference dependencies into a local virtual environment:

```sh
python3 -m venv tools/behavior-tests/.venv
tools/behavior-tests/.venv/bin/pip install \
  -r tools/behavior-tests/requirements-reference.txt
```

Supply your own unmodified supported executable. Paths below are examples for
an installation outside the checkout:

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/cases/map-distance.json \
  --command 'tools/behavior-tests/.venv/bin/python tools/behavior-tests/original.py --exe ../smac-assets/terranx.exe' \
  --output tools/behavior-tests/.build/new-original-observations.json
```

Capture requires two identical runs, rejects unsupported reference cases, binds
the whole suite and each case to hashes of their exact inputs, and records the
executable fingerprint and adapter/emulator versions. It refuses to overwrite
existing evidence unless `--force` is supplied. A modified executable, including
a differently patched build, is rejected before execution. Supporting another
build requires separately verified addresses and separate observations.

`record --jobs 2` runs two independent reference processes concurrently. Each
runner must own isolated fixture state; the Wine driver uses private game copies,
prefixes and displays. Every requested repetition must return identical outputs
and metadata before evidence is written. The default is one worker.

For a live comparison, replace `--reference FILE` in the comparison command
with:

```sh
--reference-command 'tools/behavior-tests/.venv/bin/python tools/behavior-tests/original.py --exe ../smac-assets/terranx.exe'
```

Commands are parsed into argument arrays and run without a shell from the
repository root. Quote paths containing spaces inside the command string.
Runners read one JSON request from stdin and write one JSON response to stdout;
diagnostics go to stderr. The request includes only case IDs, algorithm names
and inputs. It never includes expected outputs.

## Work from tests to implementation

1. **Reference research:** identify a bounded behavior, its inputs, relevant
   world state and observable outputs. Disassembly may reveal missing boundary
   conditions or which state must be initialized. Keep disassembly, pseudocode
   and research notes outside the checkout.
2. **Test authoring:** write synthetic scenarios and make the original adapter
   execute them. Save outputs with `record`; do not infer expected values from
   the current GLSMAC implementation or hand-edit reference answers. Confirm
   the results repeat after resetting the complete fixture state.
3. **Implementation:** give an implementation agent the case contract, recorded
   observations and existing GLSMAC source. Start it with a fresh context that
   excludes reverse-engineering notes and original/reconstructed source. It
   changes GLSMAC until the candidate passes, then adds more cases to challenge
   the solution. Keep the reference runner independent of candidate changes.
4. **Verification:** rerun new cases against the original, replay all recorded
   cases on native and WASM candidates, and retain every confirmed mismatch as
   a regression case. Never regenerate expected outputs from the candidate.

This is a separation of research and implementation work, not a guarantee about
the legal status of any particular reverse-engineering activity.

For stateful behavior, compare both the returned decision and the relevant
state changes. Use a sequence of actions when one action is insufficient to
expose the behavior. A matching final state can otherwise conceal different
decisions. Random behavior needs controlled random state or an explicit draw
sequence and recorded draw consumption; a seed alone is insufficient if the
implementations consume different numbers of draws. Do not add broad numeric
tolerances to conceal rule or rounding differences.

These are the next contracts to investigate, **not implemented reference probes**:

| Contract | State that must be explicit | Outputs to observe |
| --- | --- | --- |
| Tile yields | Moisture, rockiness, sea/land, features, improvements, bonuses, faction, technologies, base/facilities, rules | Nutrients, minerals, energy, including caps and rounding |
| Movement | Unit prototype/domain/abilities, remaining moves, source/destination terrain and improvements, owners, neighbors/ZOC, rules, randomness | Allowed/successful move, movement consumed, resulting position and flags |
| Growth/production | Base population, storage, intake, support, facilities, faction/difficulty modifiers, queue, rules | Population, storage, completed item and resulting state after one turn |
| AI choices | Complete relevant world snapshot, available choices, faction/personality, difficulty, rules and controlled randomness | Selected action/target, action sequence, state changes and random draws |

An algorithm name is a versioned contract. Define its JSON fields, units,
coordinate mapping and exclusions before adding an adapter. Unknown contracts
must return `unsupported`; they must never fall back to a guessed formula.

## Test the harness

```sh
python3 -m unittest discover -s tools/behavior-tests -p 'test_*.py' -v
```

This checks evidence binding, nondeterministic references, mismatches, missing
results, unsupported cases, subprocess failures and the real native candidate.
With the optional dependencies installed, use the virtual environment's Python
to also run emulator guard tests. Those tests contain explicitly synthetic x86
instructions and need no original executable; without Unicorn they report
skips. They are separate from the genuine game observations.

## Ability-free prototype base costs

The original-game replay additionally checks **5,531** synthetic unit component
cases against `src/game/backend/unit/PrototypeCost.h`, on native C++ and WASM.
The output is mineral rows before map/faction factors and prototype surcharges.
The fixtures cover land, sea, air, reactor and component ranges, missile offense
boundaries, selected weapon modes and table-slot independence. A further 1,024
of these cases were recorded after the implementation was frozen.

See [contracts.md](contracts.md) for exact bounds and evidence. The full
C++ helper lane also includes nutrient factors and totals 15,564 original cases; resource callback and UI traces remain
separate. This arithmetic transfer does not establish full design, ability or
production parity; the bounded Colony Pod application lifecycle below is separate.

`prototype-cost-native` also exercises the real unit manager's read-only
`get_prototype_base_cost` binding with recorded witnesses, unchanged-world
checks and invalid bounds/types/argument counts. The public query accepts eight
component properties; original table slot IDs belong only to the reference
fixture. Regenerate synthetic inputs with
`python3 tools/behavior-tests/generate_prototype_cost.py --suite all`;
observations require separate repeated original execution.

## Installed world-size integration

Three additional suites add 29 scenarios and 303 assertions. Complete synthetic
world-size tables pass through the production parser into native ordered
choices, with names, descriptions, dimensions and stable preset identities.
Native selection updates dimensions and provenance together, refreshing retained
map wrappers. Copies, historical/current codecs, malformed aggregate records,
saved callable lifetime and actual valid pre-world State transfer are covered.

The shipped picker and full animated menu controller use native labels and
dimensions on both random/custom routes, including cancellation and remembered
selection. Lobby controls use ordinal IDs so equal dimensions remain distinct;
real settings application/rollback and receiving-control updates are exercised.
Display-only legacy fixtures explicitly declare their native-rules boundary.

With installed assets, `npm --prefix tools/wasm-tests run test:world-sizes`
checks loaded Standard defaults on CLI Quick Start and all five alternate
generated worlds through real setup/faction controls, production and turns.
These source-data/application checks add no original terrain observations;
existing original menu, economy and helper comparisons remain separately gated.
Descriptions are preserved as data; original custom-dimension units and
conditional dialog formatting remain gaps. See the
[world-size contract](../smac-data/world-size-contract.md).

## Installed mineral rule and settings transfer

Six additional suites cover 61 scenarios and 578 assertions. The real parser
feeds the mapped mineral scalar into native rules independently of nutrient
data. Both startup paths validate both values before committing either. Current
rules carry both values; exact empty and nutrient-only records retain their
declared compatibility. Copies, aliases, destruction and actual pre-world State
wire remain native application checks.

The shared declared-price resolver applies the loaded factor to facilities and
Colony Pods, including descriptor, preview, selection, exact completion and
retained overflow. Tests preserve exact zero prices on Tiny/rule-one settings,
next-turn completion and population holding. Real native choices also pass the
shipped base picker and command validator/apply, including zero labels, preview,
cancellation, ownership, installed/invalid exclusions and positive-price recovery.
Multiplication is checked against
the actual factor; overflow rejects through script-call boundaries before
production changes. This transfers the existing recorded factor arithmetic;
row declarations and whole-item construction add no original parity cases.

The actual mineral panel handles zero rows without geometry division, clears
old cells and recovers positive prices. Funded projects report one turn even
without new income; unfunded projects retain NO SURPLUS and population-blocked
pods retain NEEDS POPULATION. Synthetic display boundaries do not establish
original rendered UI parity.

A separate 23-scenario suite transfers every exposed map property, difficulty
and game name through real native codecs. Assigned wrappers and fresh wrappers
must match the serialized receiving state. Rejected map/global records preserve
all fields; unregistered full-width difficulty values reject before mutation,
including a value that would narrow into a valid mapped key. These checks do
not claim malformed whole-State/faction atomicity or complete save/load.

With installed assets, `npm --prefix tools/wasm-tests run test:mineral-rules`
loads distinct nutrient/mineral values through normal manifest verification,
checks Quick Start and generated Standard gameplay, the actual picker and
selected-project prices, then advances a real production turn. See the
[source-data contract](../smac-data/mineral-rule-contract.md).

## Installed nutrient rule integration

Five additional suites add 33 scenarios and 218 assertions. Synthetic rules
reach native settings and the shipped growth/food-grid code; aliases, object
lifetime, copies, legacy/current codecs and valid pre-world State transfer are
checked without rendering. Invalid nested rules and truncated late fields leave
GlobalSettings unchanged. This does not establish whole-State malformed-packet
atomicity or original growth/UI parity.

The probes exposed and now guard zero-column food-grid division, partial
GlobalSettings mutation on rejected records, and lost GSE function returns in
classic `for` loops. The language suite checks return values, nested loops,
side effects and existing break/continue behavior. Failing baselines were
preserved before fixes; fixed probes are promoted into the passing catalog.

With installed assets, `npm --prefix tools/wasm-tests run test:nutrient-rules`
checks actual Quick Start initialization and ordinary Standard menus, world
generation, native factors and the displayed growth label using a verified
synthetic rules asset. See the [source-data contract](../smac-data/nutrient-rule-contract.md).
These are application regression tests; original parity totals are unchanged.

## Calibrated human cost factors and faction bonuses

The active helper catalog has 764 nutrient/GROWTH cases, 5,679 mineral/INDUSTRY
cases, 24 Custom-kind cases and 20 explicit zero-rating witnesses, all freshly executed twice in the original.
The original Social Engineering screen and distinct installed rule overrides
establish the field names. The old v1 labels were reversed; their immutable
records remain in `factor-v1-historical-catalog.json` and do not inflate totals.
See [contracts.md](contracts.md) for modes, units and exclusions.

The source consumer imports initial SOCIAL GROWTH/INDUSTRY from the installed
fourteen faction definitions. Native factions retain both ratings through
wrappers and wire transfer. Supported human bases use GROWTH for nutrient
thresholds and INDUSTRY for explicitly declared mineral rows. The 18 initialized
original rating cases compare all fourteen factions and four source overrides.
Real browser paths check the Consciousness growth penalty and Drone industry
bonus through source loading, selection, generated worlds, displayed prices,
food thresholds and turn credits. These application sequences are separate
from the bounded original helper outputs.

Other social bonuses, policy changes, AI, per-base adjustments and population
booms remain gaps. Unknown map provenance and unmodeled roles retain the
existing application fallback; complete game parity is still unproven.


## Renewable Colony Pod construction

The `glsmac.unit_production.v1` application contract extends the actual production
registry, event, base screen and native completion to a declared land Colony Pod
recipe. It uses three mineral rows, with supported human preset costs of
24/27/30/30/30 and an explicit 30-mineral fallback for unknown provenance. The
component rows and human mineral factor each have recorded original evidence;
whole-item construction is not an additional original comparison.

An owner selects the project through CHANGE. Subsequent turns credit the existing
nonnegative surplus once. Completion consumes one actual citizen, releases its
worker assignment, spawns one real owned pod at the base center, keeps overflow
and clears the project. Manual reselection allows another pod. A size-one base
retains its credited project until another citizen exists; the original game's
abandonment dialog remains unimplemented. Produced movement, health and morale
follow the reproduction's existing spawn defaults, not a new original contract.

Native completion owns the unit, citizen and production transaction. Spawn
callbacks observe that state under a scoped native mutation guard. Consumed
citizen references reject later mutation; receipt undo preserves the same
citizen identity. Arbitrary script closure state and configuration or handler
registry changes are outside this native journal.
Its tests exercise callback failure, identity-sensitive undo, receiving-world recipe
resolution, prices and invalid mutations. Script tests check owner validation,
duplicate turns, optional unit receipts and the actual picker/display with a
controlled display boundary. These are GLSMAC application tests. Fresh-world unit definitions resolve morale through the receiving manager,
including the associated backend manager used by frontend definition requests.
Unit support, home-base rules, abandonment, automatic repeat/default selection, queues and
whole original completion ordering remain outside this batch.

## Basic production switching

The original helper lane includes **2,528** human basic-item switch-loss cases
at default retool rules, with no installed facilities. The 512 held-out cases
were generated after the candidate header was frozen. Native and WASM call
the same production helper; [contracts.md](contracts.md) records exact bounds.

The separate `glsmac.basic_production_switch.v1` application contract allows
active Recycling Tanks↔land Colony Pod switching for modeled human owners,
without Skunkworks and within bounded mineral storage and project costs. The
actual picker previews each target's mineral loss; cancellation preserves the
project and credit. Confirmation debits only the loss and marks the current
turn so switching cannot credit production again. Aliases of the same actual
project preserve all state. Native tests check both directions, thresholds,
read-only previews, exact event rollback and atomic rejection of unsupported
contexts. The picker displays an unavailable message for those contexts.

This application policy, including installed Headquarters, rollback and UI,
is separate from the original helper observations. It does not establish whole
original switching behavior, AI/social modifiers, projects, orbitals, Stockpile
Energy, queues or hurrying.

## Deferred growth and population event lifecycle

`queued-base-turn-native` sends commands through the actual native host event
queue with shipped handlers and validation. Its natural Tiny sequence reaches
a population-constrained pod project, then grows into a food deficit. On the
following turn, production consumes the new worker before growth decides whether
starvation is needed. The separate `process_base_growth` event reads this updated
state, retaining 43 minerals and one nutrient with no stale population removal.
Terrain yields and manual turn delivery remain controlled fixture boundaries.

The native fixture now consistently identifies its economy host as slot zero
for the player, slot and event caller. No authorization validator is replaced.
Controlled immediate-dispatch fixtures remain separate from native queue tests.
The growth stage validates host, current turn and completed active production;
only the master queues population child events. Its undo restores nutrient
storage; population children retain their independent event lifecycle. Manual
production receipts are unchanged. This does not provide atomic whole-turn undo
or complete multiplayer synchronization.

`remove-base-pop-native` checks actual worker/doctor removal and undo. Surviving
citizens retain their identity and links; undo recreates the removed citizen
through the existing monotonic allocator. It does not rewind citizen identity,
variant randomness or allocation counters.

`pop-membership-native` checks that actual citizen identity is required by
`Base.destroy_pop`, including foreign bases/worlds with matching per-base IDs.
Rejection leaves both snapshots, RNG, counters, notifications and worker links
unchanged; a fresh wrapper for the actual local citizen remains accepted. The
queued turn suite additionally grows and starves a genuine worker while idle,
checking successful host removal and the surviving worker graph. These are
GLSMAC API/lifecycle invariants, separate from original-game helper evidence.

`base-work-events-native` checks actual shipped work/unwork handlers using real
Base/Pop/Tile objects: owner and world membership, eligible noncenter tiles,
Worker/Doctor transitions and receipt undo restoring the previous job and tile.
Rejected requests preserve snapshots, RNG, IDs and native notifications.
`base-worker-ui` executes the real resource-panel mouse handler and weighted
selector without graphics, covering request ordering, diamond hit tests, empty
populations, refresh to another base and panel removal. Its local display
boundary models native Container.clear handler cleanup. These are application
regressions; the separate citizen-job contract below transfers bounded starting-job UX and the Doctor bonus.


## Citizen job controls and Doctor Psych

`ui.citizen_job.v1` adds 14 independently recorded original sequences and 67
checkpoints: the starting Worker/Doctor choices, selected job, draft/confirm/
cancel behavior, clamped arrows, ignored Home/End and visible Psych bonus.
The actual original chooser reports +2 Psych for Doctor; confirmation changes
the displayed bonus from zero to two, while drafts and cancellations preserve
it. The native-backed candidate initially failed because portraits had no input
handler and real Doctors still displayed a zero bonus. Both failures remain
strictly represented by the recorded cases; see [the UI scope](ui/README.md).

`base-specialist-bonus-native` checks shipped energy payloads for actual native
citizens, unchanged native snapshots/RNG/IDs/notifications on reads, and real
unwork receipt undo. Summing multiple Doctors is separately labeled GLSMAC
application policy, beyond the original one-citizen recordings.
`citizen-job-lifecycle` executes the shipped portrait, chooser and base screen
with native identities and real work/unwork validators. It checks draft-only
selection, stale controls, ownership/removal/consumed-citizen handling and a
no-square Worker restoration guard. Display, terrain and immediate event
delivery are controlled boundaries. The browser case separately drives actual
mouse/keyboard input, queued commands, all three worker links, rendered Psych,
close/reopen persistence and unchanged food/minerals/project/population.

Only Worker/Doctor and the bounded visible Doctor bonus have original evidence
here. Other jobs/unlocks, drones/talents, energy allocation and rounding, and
original Worker square selection remain gaps. The latter uses the reproduction's
existing best-vacant-square policy.

The first actual chooser browser run also exposed a display-boundary mistake:
native Window does not forward the ChoiceList factory. The shared mock now
models its actual forwarded factories; the same recorded replay fails without
an inner panel, preserving this as a display-free regression. The chooser uses
that supported panel and an explicit zero-height header for its own layout.


## Installed rules, menu and dialog data

The production main-menu controller now loads `alphax.txt`, `xscript.txt` and
`menu.txt` through the native asset resolver and shared cached parser. TOPMENU,
MAPMENU and SCENARIOMENU labels/captions decorate their existing callbacks.
The parsed rules and in-game definitions are available to further consumers;
loading data does not implement their unmodeled mechanics or commands.

`smac-text-loader` adds eight asset-free native binding scenarios with 72
assertions. `smac-data-menu` adds nine production UI scenarios with 41 assertions,
using alternate synthetic labels to verify actual callbacks, strict malformed
input handling and loading once per controller. The existing original menu lane
also executes the consumer with explicitly declared synthetic data. Actual
installed-file startup remains a separate rendered integration check.

See [the shared-parser tests and installed-file audit](../smac-data/README.md).
Its nine C++ synthetic scenarios/67 assertions run on native and WASM in CI.
The optional audit compares installed source records and projections without
running the original executable; those counts are never original-game parity.

## Recorded unit orders

The default UI replay includes 13 frozen original `ui.unit_orders.v1` traces and
45 checkpoints, recorded twice in fresh original processes with paused turns.
They verify visible Hold/Activate/Skip effects, exhausted-unit selection, two
explicit turns, idle Space opening a base, actual OK closing and modal key
blocking. The candidate executes native units, actual turn advancement and
shipped controls/events without pixels or original assets:

```sh
python3 tools/behavior-tests/ui/run.py --suite unit-orders
```

Three additional regression suites provide 36 scenarios and 320 assertions for
native order persistence/readiness, strict command validation, exact rollback,
legacy/corrupt snapshot handling, frontend request propagation, pending controls,
modal guards, focus restoration and callable/DOM lifetime. They are GLSMAC
application invariants, separate from original-executable parity.

Five optional browser paths replay recorded expectations through SDL, actual
frontend selection and event transport on a declared synthetic one-Scout world:

```sh
SMAC_ASSETS_DIR=/path/to/installed/game npm --prefix tools/wasm-tests run test:unit-orders
```

They add no original-input parity cases. The companion `test:buffers` command
checks independent copied-buffer reads and appends under native AddressSanitizer
and WASM. The allocator regression was found by the actual unit-codec probe.
The browser checks caught a separate frontend refresh defect that cleared
explicit exhausted-unit focus; the selected unit must now settle along with
the native order and visible labels before another command is sent.
See the [bounded order contract](ui/unit-orders-contract.md) and
[transfer inventory](properties.json) for exclusions. The pending catalog retains two independently repeated full base-opening traces.
Citizen reconciliation now agrees; the signed nutrient-counter observations
remain a strict failing transfer contract and are excluded from passing totals; see
[the bounded contract](ui/base-open-recalc-contract.md).

## Custom-dimension source and control transfer

The 18 frozen [dialog comparisons](ui/dimension-dialog-contract.md) cover actual
original captions, labels, untouched `40`/`80` strings and buttons on random and
custom routes, after every preset and with controlled text changes. They prove
that CUSTOMMAP uses common `Script.txt`, even with conflicting `xscript.txt`
text, and that horizontal/vertical labels use `labels.txt` entries 1090/1091.
Production loads those two sources lazily, validates them before opening a
window and caches detached definitions. Native map wrappers now refresh retained
assigned dimension/type values when custom settings change.

`dimension-data` and `dimension-controls` add 22 display-free scenarios/149
assertions for real source parsing, control actions, validation, cancellation
and native settings aliases. The separate generated-grid contract verifies
selected horizontal-to-backend conversions and odd heights. Bounds outside
recorded inputs remain application policy.
With installed assets, `npm --prefix tools/wasm-tests run test:dimensions` checks
both real setup routes, native typing/Enter, source resolution, conflicting text,
terrain generation and a complete turn. Those checks remain application coverage.

## Large-map warning and odd-height generated worlds

The default UI replay includes 84 independently repeated original warning traces
and four original post-generation dimension observations. Production consumes
common Script.txt VERYLARGEMAP, defers setup when either edited dimension exceeds
128, and transfers the recorded clamped selection and Enter/Escape/OK behavior.
Never mind returns to the caller. Warning prose is loaded from installed data;
only synthetic paragraphs belong to the asset-free source tests.

Four generated original worlds establish selected doubled horizontal dimensions,
unchanged odd heights and valid tile counts. The native grid decoder now retains
odd heights. Polar normalization addresses the actual bottom-row parity and
updates derived centers. Terrain mesh allocation includes the final wrapped edge
diamond for odd heights. The `odd-map-grid` suite executes real grids, codecs,
polar normalization and mesh/final-tile code without pixels; textures and earlier
terrain passes are controlled boundaries.

`npm --prefix tools/wasm-tests run test:dimensions` runs three real browser paths:
random and custom setup, plus warning rejection/re-entry/confirmation followed by
258×49 terrain, Headquarters and a real turn. These are application integration
checks; original terrain, RNG and full-game equivalence remain unproven. See the
[warning contract](ui/large-map-warning-contract.md) and
[generated-grid contract](ui/custom-grid-dimensions-contract.md) for exact scope.


## Basic land startup and installed unit definitions

Six independently repeated original first-base inventories now match native
replay, including controlled TECH swaps that distinguish Ecology-enabled Formers
from the default Pod project. The unchanged two-case reference preserves the
initial red result. See the [precise contract](ui/startup-inventory-contract.md).

Installed UNITS/CHASSIS/WEAPONS/DEFENSES/REACTORS and MORALE tables supply the
three basic land definitions, component prices, combat attributes, movement and
standard/native morale names. Concrete faction TECH tokens reach native storage
and codecs and gate the starting choices. Numeric free-tech choices, broader
technology progression and other starting bonuses remain unimplemented.

Native tests distinguish conventional, civilian and psi definitions, validate
receiving/legacy codecs, use actual conventional strength during the current
combat policy and prevent civilian attacks. Real browser source swaps construct
the queued Former without a population charge; normal installed-table gameplay
grows and constructs a Pod. Static conventional portraits, faction morale bonuses,
reactor damage, original combat odds, terraforming beyond the bounded work scope and computer players
remain explicit gaps. This is not complete game parity.

The `colony-found-menu-controls`, `colony-found-menu-authority` and
`colony-found-native` stable groups add 20 application scenarios/97 assertions.
Two independently repeated [original city-naming flows](ui/colony-found-menu-contract.md)
match native replay at twenty checkpoints: Action source0, common NEWBASE
caption/label, faction name-pool input, edits, button/keyboard cancellation,
reopening and chosen-name confirmation with native city/Pod effects. Naming
also shares the B/FOUND controls. Previewing a draft does not reserve it, and
accepted names are applied within the native founding transaction. These
observations exclude post-confirm artwork, general adjacency/name policy and
AI. Current native APIs require a rebuilt engine; subsequent GSE-only iteration
reuses that engine.

The twelve-case menu-context replay uses sequential four-case workers,
retaining exact outputs and script/runtime fingerprints. One equal-input local
measurement reduced peak worker RSS from 2,075,620 to 1,169,536 KiB (43.7%) and
longest worker time from 33.7 to 12.5 seconds; total time rose from 34.1 to
38.2 seconds. Naming regressions also use separate small workers to bound
retained native world graphs. No assertion or timeout was removed.


## Initial research controls

Shift+R and HQ source slot 1 open the source-backed research dialog. With Blind
Research off, eligible cards use native technology availability and categories;
a card commits only its target. With Blind Research on, the four independent
priority toggles persist immediately, including all-off and Escape/Enter close.
Native state is separate from technology ownership and science income, guarded
by player/turn/opening authority, copied in world snapshots and reset with the
session. Strict receipt rollback and malformed snapshot rejection have native
and WebAssembly coverage. Customize Rules currently implements only the Blind
Research option, its reset and draft cancellation/launch behavior.

Public hot tests use synthetic source declarations and require no original
assets. Three additional directed-choice and five blind-priority recordings can
be replayed optionally with locally supplied installed data. The adapter executes
native single-player startup, shipped source parsing, Shift+R, actual popup
callbacks and native backend events. It observes actual labels, check glyphs,
return screens and selected target IDs; it does not manufacture expected answers.

```sh
python3 tools/behavior-tests/compare.py compare \
  --cases tools/behavior-tests/ui/cases/initial-directed-research.json \
  --reference tools/behavior-tests/ui/observations/initial-directed-research.json \
  --command 'python3 tools/behavior-tests/ui/research_headless.py --assets /path/to/game'
# Repeat using initial-blind-priorities.json for both --cases and --reference.
```

These eight asset-backed cases remain outside public release catalogs and totals.
The separate three setup recordings remain pending full navigation replay. Local
source swaps test parser/control consumption, not original edited-source parity.
The initial Gaian controls do not establish other faction defaults, later card
filtering/order, keyboard card navigation, Info/Lookup, rendered layout fidelity,
research costs/progress, blind selection probabilities or acquisition effects.
Common Script.txt is the current presentation policy; common-versus-expansion
precedence is unverified. Other 17 custom-rule effects remain unimplemented.


The separate optional Chromium regression uses real keyboard and pointer input
through normal setup and both research modes:

```sh
SMAC_ASSETS_DIR=/path/to/game WASM_APP_DIR=/path/to/app/bin \
  npm --prefix tools/wasm-tests run test:research
```

It mounts current production scripts into a compatible application runtime.
`WASM_SCRIPTS_ROOT` selects a different source checkout; `RESEARCH_ARTIFACTS`
selects the local screenshot/log directory. Reports bind production and observed
script snapshots and the runtime with SHA-256 fingerprints. The observations
read native target/priorities and visible check glyphs. Game actions use browser
input, including the actual Customize Rules checkbox, Cancel, Standard Rules
reset, confirmation footer and directed card, plus the blind-priority footer.
The driver waits for the native slide animation before clicking. This is
candidate integration coverage, separate from original behavior comparison;
full-frame rendering fidelity remains unverified. Screenshots, logs and original
asset bodies are not committed or included in public passing totals.
