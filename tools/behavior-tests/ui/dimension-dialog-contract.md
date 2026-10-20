# `ui.map_dimension_dialog.v1`

Observe the visible custom-dimension dialog after entering random or custom
planet setup, either directly or after choosing one of five presets and
canceling back to size selection. Inputs are exactly `route` (`random` or
`custom`), `prior_preset` (`null` or integer 0..4), and `text_profile` (`default`,
`alternate`, `core` or `both`). Every original case starts a fresh process and
reset INI.

Outputs are the actual caption, two field labels, two untouched raw input
strings and two action labels in screen order. Visible text is normalized to
uppercase/one-line whitespace; raw numeric strings are retained without unit
conversion or expected-value substitution. No answer is supplied to OCR.

The original runs the pinned GOG Alien Crossfire v2.0 executable in a private
Wine/Xvfb installation at 1024x768. The 14 initial cases and four additive
caption-source cases are frozen in separate reference files; neither replaces
the other. Source files are pinned to the hashes in
`dimension_dialog_contract.py`. The alternate input changes only the CUSTOMMAP
caption in `xscript.txt` and LABELS entries 1090/1091 in `labels.txt`, in a private
copy. The separate four-case caption-source suite changes common `Script.txt`
only (`core`), then common and expansion captions to conflicting values (`both`).
The original selects the common caption in both routes and takes the two labels
from zero-based LABELS entries 1090/1091. The alternate expansion caption alone
does not change the visible title. Filenames are resolved case-insensitively and
the existing basename is preserved in private copies. These controlled inputs
verify source dependencies rather than assuming matching literals prove
consumption. Each field requires OCR consensus over three image scales;
complete dialog observations must stabilize. Recording requires two independent
identical runs. Screenshots and original assets stay outside the repository.

The candidate executes current menu steps, sliding/popup controls, actual native
Rules and MapSettings, production text parsing and source consumers without
graphics. Synthetic source text supplies equivalent preset dimensions and
declared text inputs; no original file is embedded. Display nodes, audio,
synchronous timer delivery and pre-world initialization are controlled
boundaries. Actual field/caption/action factory values are read. Reordered,
missing or duplicate cases, incomplete markers, runtime errors and unsupported
contracts cannot count as matches.

This contract does not observe edited input, validation limits, focus traversal,
dialog geometry, generated terrain, resulting original map coordinate units,
save/load or complete setup. Existing keyboard-navigation and browser tests
remain separate. The separate [generated-grid contract](custom-grid-dimensions-contract.md) now
observes selected horizontal conversions and retained odd heights; these are
not additional observations under this visible-text contract. Case counts do not establish complete SMAC parity.

The separate `dimension-data` and `dimension-controls` regressions cover lazy
loading, malformed optional sources, detached cached definitions, actual popup
callbacks, application dimension limits, cancellation and retained native settings
aliases. These 22 scenarios/149 assertions are application coverage. Rendered
`test:dimensions` checks actual installed-source resolution, conflicting source
text, native typing/Enter, generated dimensions, Headquarters and a real turn
through both random and custom setup. These browser checks add no original cases.
