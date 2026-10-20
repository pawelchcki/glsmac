# `map.custom_grid_dimensions.v1`

Four independently repeated cases measure ordinary custom input through an
actual original generated world: 30×48, 30×49, 31×49 and 129×49. Inputs are typed
canonical decimal strings; no expected dimensions are passed to the observer.
The original runs a fresh process/INI, random-map setup, Citizen, standard rules,
the default selected factions and default leader name. It waits for the visible
post-generation PLANETFALL checkpoint. Terrain content and random seeds are
excluded from the output, so the fixture does not replace the original RNG.

Five four-byte fields are read from the verified private executable mapping:
setup kind at RVA `0x54A2A0`, width at `0x549870`, height at `0x549874`, half-width
at `0x28FAF0` and tile count at `0x549884`. Owned process/prefix, mapped path and MZ
header checks apply. Independent field consistency and two stable reads are
required. The even/odd and differing-width controls verify field identity.
No memory is written and unrelated values, memory dumps, screenshots and game
assets are absent from the reference JSON.

The observations retain odd height 49, use full widths 60/62/258, and contain
1,470/1,519/6,321 actual valid tiles respectively. The even control uses 60×48
and 1,440 tiles. A private rendered-world check additionally dismissed PLANETFALL
and inspected the same odd dimensions. The reference files remain immutable.

Pixel-free candidate replay executes the production custom-size/warning
controls, parser and native settings, then constructs real production Tiles and
round-trips them through the production native map-file decoder. Width, height,
valid first-row count and total valid cells come from that actual restored grid.
Its links and byte round-trip must be valid. Rendering, terrain generation and
the next setup step are controlled boundaries in this bounded replay; it is not
a complete native generation comparison. A separate real-browser path generates
258×49 terrain, verifies the same dimensions and advances a real gameplay turn.

These cases establish selected custom-grid dimensions, not terrain equivalence,
AI, all size limits, imported SMAC file validity, every named source-table row,
save-game compatibility or full-game parity. Original minimum/clamping behavior
outside the recorded inputs remains an explicit gap.

The `odd-map-grid` application regressions additionally execute actual polar-row
normalization, native tile codecs, mesh allocation and the final tile pass without
textures or graphics. Single-row native files remain rejected before linking.
Even-height controls preserve the polar helper's random
draw count. Synthetic all-water state controls the mesh fixture; this does not
compare original terrain, mesh topology or random generation.
