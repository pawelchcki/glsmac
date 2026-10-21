# In-game menu presentation and navigation

`ui.ingame_menu_trace.v1` declares twelve input sequences in fresh
Gaian/Citizen/standard flat-arid games. The initial owned Headquarters is Gaia's
Landing with one Doctor, no Workers or worked squares, zero nutrients and nine
minerals. Scout, Former and Colony Pod are stacked, healthy and unspent; the
Scout is selected. No year advances. These are controlled fixture inputs, not
natural startup defaults or gameplay findings.

The actions click the visible MENU button, click a displayed header by zero-based
index, or press Escape while a child is open. Nine cases visit one header each,
then press Escape and click MENU. One case clicks MENU four times. One visits
headers 0, 1, 3 and 8 before Escape and MENU. The final case repeats header 0 with
an edited source profile. Closing the parent uses the MENU toggle. Root Escape,
Quit confirmation and child-row actions are excluded. The case generator supplies actions
only; transitions, selected headers, child rows and tones must come from actual
observations, never an expected-state calculation.

Both applications receive the same synthetic `menu.txt` and `alphax.txt` TERRAIN block from
`ingame_menu_inputs.declarations(profile)`. Its nine blocks have this declared
display order and number of source items:

| Index | Block | Source title | Items |
| ---: | --- | --- | ---: |
| 0 | GAME | &Game | 13 |
| 1 | HQ | &HQ | 17 |
| 2 | NETWORK | &Network | 9 |
| 3 | MAP | &Map | 21 |
| 4 | ACTION | &Action | 31 |
| 5 | TERRAFORM | &Terraform | 10 |
| 6 | SCENARIO | &Scenario | 28 |
| 7 | EDITOR | &Edit Map | 29 |
| 8 | HELP | &Help | 22 |

The `synthetic` profile uses readable ordinal labels such as `&Game Entry One`
and generic hints such as `Key One`, through `Thirty One`. The `game-edited`
profile changes the GAME title to `&Core`, zero-based GAME row 1 to
`&Compact Choices`, and GAME row 12 to `&Depart`; counts, source order and hints
stay the same. These ASCII declarations contain no original asset body and no
output answers. A source mnemonic marker is an input, not a prescription of its
rendered appearance. The twenty synthetic TERRAIN rows declare Site One through
Site Twenty, Water One through Water Twenty, land/sea prerequisites None,
work rate four, order template `Shape $STR0` and input hints q/Q. Only this block
replaces installed alphax rules; unrelated blocks retain their original values.
Both applications receive these same relevant inputs. They do not establish
original technology prerequisites, terrain names, work rates or shortcuts.

Each trace contains the initial checkpoint and one checkpoint after every
action. `after_action` is -1 initially and then the zero-based action index.
Every checkpoint records `screen` (`map` or `menu`), `year_delta` (zero), selected
unit role or null, the raw native base name, population/Worker/Doctor/worked-square
and owned-city counts, and all three native companion units in Scout/Former/Colony
order. Unit `order_code` is 0 for no orders, 1 for Sentry, 2 for Hold;
`movement_spent` uses thirds of one movement point, bounded 0 through 3 for this
fixture. Native identity, ownership, position, health and global/owned membership
are strict observer guards; city resource stores are guarded against fixture
values. They must not be synthesized from the prescribed actions.

On the map, `menu` is null. A menu checkpoint has nine mounted header observations
`{label, active}` and either a null child or
`{header_index, rows}`. Each child row is exactly `{separator: true}` or
`{label, tone}`, where `tone` is the observed `light` or `dark` text class.
Rendered row order and internal separators are observed rather than reconstructed
from source item ordinals. Tones establish presentation only: this batch makes
no claim about enabled state, accelerator binding, or the effects of choosing a
row. Output validation checks complete shapes and native bounds without mapping
actions to expected screen, header, row, tone or selection outcomes.

GLSMAC separately retains its existing New Game/reset and Quit/exit actions
through an explicit application compatibility map: zero-based GAME source slot
11 invokes New Game and slot 12 invokes Quit. Source-slot identity survives
presentation filtering and inserted separators; displayed labels still come
from installed data. Production confirmation and lifecycle handlers own these
actions. This map is application policy, not an observed original row-effect
contract. No row action is executed by these twelve traces; original effects,
availability and other commands require future action observations. The bounded
presentation groups record observed omissions without assigning unobserved
conditional causes to them.

Comparison normalizes displayed menu labels to uppercase, collapsed whitespace
and straight apostrophes. Native base names retain actual case and spaces.
Shortcut hints, coordinates, pixel colors, fonts, artwork, audio, hover effects,
focus traversal, other keys, child-row action effects, other game contexts and
complete original menu parity are excluded. A light/dark classification does not
establish exact colors or interactive behavior.

Record every complete original case independently twice from fresh state and
bind immutable observations to input and observer/source fingerprints. This
input contract does not itself assert that observations have been recorded or
that a candidate agrees. Candidate replay must execute mounted production MENU
and header controls, production Escape handling, the installed-text parser and
actual native state. Missing controls, incomplete readings, unknown rows or
failed native guards remain strict errors. Declare rendering, timer and event
transport boundaries. Real browser clicks and keys verify SDL delivery and
geometry separately from display-free replay; neither lane may fabricate
controls or expected results to complete a trace.

The [accepted original record](observations/smacx-gog-2.0-ingame-menus.json)
contains twelve traces and 63 checkpoints. Both complete independent captures
agree exactly, including source wording, grouping, text classes and native
context. The separate [switching pilot](observations/smacx-gog-2.0-ingame-menu-switch-pilot.json)
is retained for provenance and excluded from catalog totals. Rejected setup,
input-delivery and nondeterministic attempts remain failed research artifacts;
they never supply reference answers or passing counts.

The frozen pre-change reproduction reaches every initial native map checkpoint,
then fails all twelve traces because its mounted MENU has one header. Those
are twelve strict control errors, with no matched cases, rather than numerical
row mismatches. The first strict candidate replay matched nine traces and
retained three mismatches: a duplicate Terraform separator, incorrect initial
Editor/Terraform text tones and the edited GAME title failing to become CORE.
The original observations were preserved. After correcting those production
projections, all twelve traces match display-free native replay and actual browser controls.
The browser lane also confirms native pointer access to every visited child
list's final row. Ten application scenarios provide 65 assertions; the three
affected native suites pass 81 scenarios and 506 assertions.

Replay the bounded contract without original assets or rendering through
`python tools/behavior-tests/ui/run.py --suite ingame-menus`. Its candidate adapter executes production startup, MENU/header
callbacks and Escape, the native installed-text parser and authoritative
city/unit state. Scene nodes, art/audio, class-declaration capture and explicit
event transport are declared display-free boundaries. Browser tests use real
native controls, pointer hits and SDL Escape; their declared native IDs and
stack are guarded, while full unit membership is guarded in headless replay
because the frontend wrapper does not expose global unit enumeration.
Browser replay verifies the initial selected Scout through its actual rendered
name, then checks both production selection controllers against the declared
native unit ID at every checkpoint. Hovering can independently preview a unit
or base; subsequent preview contents are outside this menu contract and do not
stand in for selection. The pointer transport requires actual native hover
events, keeps the canvas in the viewport and parks outside the world map.
