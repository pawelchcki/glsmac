# Installed world-size choices

Load the unambiguous `WORLDSIZE` block from installed `alphax.txt` through the
production rules parser. Its count record declares five ordered named presets.
Each subsequent row has a label, horizontal half-width and height. Convert the
horizontal value to the backend's parity-coordinate width by multiplying by two;
retain height. This coordinate conversion and generated-world integration are
application coverage, separate from recorded original terrain behavior.

Split an optional single `|` in the label into name and description. Keep both
in native state. Names must be nonempty. Require canonical decimal dimensions,
even backend dimensions within width 4..4096 and height 2..4096, exactly five
rows, and no nonempty extra fields. Allow parser padding, comments and trailing
empty fields. Reject ambiguous blocks, malformed counts, labels or dimensions
before changing any native configuration. Other rule blocks remain independent.

Native Rules expose detached `get_world_sizes()` results and a strict
`set_world_sizes(array)` accepting five entries with level, name, description,
size_x and size_y. Ordinals 0..4 identify the presets even when dimensions repeat.
Saved readers/writers must remain live across assignment and fail safely after
destruction. Copies and receiving settings own independent values.

Keep the exact empty, nutrient-only and two-cost-field historical Rules records
compatible. They retain the historical reproduction's preset table. A configured
table adds a tagged typed extension after the two cost fields. Validate its
complete record, count and every entry before committing any cost or table value.
Native Rules, GlobalSettings and valid pre-world State transfer preserve the
table; malformed nested records preserve the receiving aggregate.

Startup validates nutrient, mineral and world-size callbacks before committing
any of them. First startup selects the loaded Standard dimensions for the
ordinary and CLI Quick Start paths. Reinitialization and receiving-world setup
must preserve an explicitly selected size rather than replacing it with Standard.

The size picker and lobby use the native ordered table. Selecting a named size
through `rules.select_world_size(map, level)` changes width, height and explicit
preset provenance together and refreshes retained native map wrappers. Reject
invalid indices/types and imported map contexts before mutation. Keep random
and custom-climate routes, cancellation, remembered choice and Custom Size.
Descriptions remain available as data; conditional dialog formatting and custom
dimension input units require separate observed contracts.

Use synthetic source and actual native objects for asset-free tests. Existing
original menu observations remain immutable and must still replay strictly.
Actual browser tests verify installed alternate names/dimensions through the
normal asset/hash path, real setup controls, world generation and a real turn.
This adds application/data tests; it does not add original terrain observations.
