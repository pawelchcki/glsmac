# Bounded installed CVR component previews

The texture loader recognizes `.cvr` resources and produces a transparent
100×75 preview from a single geometry component. The geometry and physical
palette come from the installed resource, through an independent implementation
of the [public tagged Caviar format description](https://alphacentauri2.info/wiki/Caviar.html).
No original executable, renderer implementation, proprietary bytes or generated
original artwork is included in these tests.

This first slice is an application rendering policy: an unlit orthographic local
view with a fixed isometric projection, six-pixel fit margin and depth buffer.
It does not reproduce the original camera, scale, lighting, faction colors,
object transforms, visibility, facing selection, equipment assembly or animation
frames/timing. Parsed per-frame flags, matrices, locations and object pivots are
retained as metadata; their rendering semantics are deliberately not guessed.
Multi-component previews reject explicitly rather than silently dropping parts.
Existing sprite serialization and the billboard/movement pipeline are unchanged.
The ordinary stock Former now uses this component after the independently
repeated [original color-control observation](reference-drafts/vt-former-component-contract.md)
proved that pinned `VT.cvr` contributes to its chassis in both HUD and map.
The evidence retains all seven players and every native unit/city unchanged.
It proves a chassis contribution; attached tools and complete assembly remain
unimplemented. Scout and Colony Pod keep their existing portrait placeholders.

Parsed unit rules retain source prototype/chassis/weapon/armor/reactor ordinals.
The component gate accepts the recorded Former prototype 1, first land chassis,
first armor, fission reactor, one movement point and civilian 0/1 combat profile.
Display-name edits retain component identity; unobserved authored chassis/armor
or combat/movement variants keep their existing functional fallback. This gate
is an application boundary, not a newly inferred original rendering rule.

The decoder bounds input to 64 MiB, parts to 256, frames to 4096 and total voxel
records to 2,097,152 before output growth. It accepts documented flat and jump
layouts with the observed nonlinked, five-zero-byte tail variant. Supported
flat counters include their terminal colored record; jump counters exclude one
terminal record per group. These are resource-format observations, not original
gameplay or renderer algorithms. Unknown chunks, multi-header/linked geometry,
inconsistent counters, truncated records, nonfinite transforms and unsupported
versions reject. Physical RGB and optional material/shade tables remain distinct;
the preview uses physical RGB without claiming original shading agreement.

`python3 tools/texture-tests/run.py` compiles asset-free C++ tests for both FLIC
and CVR. CVR fixtures exercise signed Z/X/Y coordinates, all 26 neighbor codes,
emit-before-advance direction semantics, colored terminal records, independent
jump positions, raw animation metadata, palette colors, depth occlusion,
transparent background, clipping and fit margins. Malformed inputs include every
truncated prefix, unknown/duplicate chunks, invalid counts/links/tails/directions,
invalid scales and bounds. They are application invariants, outside recorded
original comparison totals. An optional local CLI input can inspect an installed
resource without copying it into the repository.

The independently repeated original three-role motion record observes distinct
Scout, Former and Colony bodies, visible intermediate translation and stable
all-seven-player state. It establishes neither CVR component binding nor this
preview projection. Stock wiring requires a separate clean asset-binding
observation. That separate binding is now recorded with evidence SHA256
`030269c9ce02b9d86f3388dcb5a694910d3e17f1013cd33429c5b1e6bfaa672d`.
Full unit visual and animation parity remains unsupported.

The optional installed-data application check is
`SMAC_ASSETS_DIR=/path/to/game WASM_APP_DIR=/path/to/app/bin npm --prefix tools/wasm-tests run test:unit-cvr`.
It uses the actual remote asset manifest/bridge/VFS flow, with no manually
injected model bytes. An actual production-defined Former exercises the existing
billboard and selected-unit HUD; physical east input exercises normal movement.
Seven native cities and units make opponent-state preservation meaningful.
An additional plain preview surface checks actual nonempty multicolor pixels
and transparent margins, and the stock HUD must show the same component colors.
Native snapshots, runtime/script/resource fingerprints,
screenshots and actual acquisition times are retained in the artifact directory.
These are application checks, with zero original visual passing cases. Frame
acquisition does not establish exact original timing or guarantee an intermediate
motion frame; captured images must be inspected before claiming translation.

The old `1e8913f6` production definitions emit `newicons.pcx`; the new source/native
regression overlay preserves that failing evidence. The same installed browser
input on the immutable `1e8913f6` engine resolves the actual CVR resource and reports
`Unsupported image format`. The fresh combined `17354442` native build contains the
CVR core and world test seam, with WASM SHA256
`79ddb4d63a107ac1b112e8fb71ba61963d37979edb244b4816eb2beab32e093d`.
Current host scripts supply the guarded Former definition; no engine rebuild is
needed for that script change. Focused native source/combat/Former-work checks
pass 64 scenarios/131 assertions across three suites. Full original visual cases
remain zero; these checks do not convert the original color-control experiment
into a passing candidate pixel comparison.

The existing body translation pipeline is preserved. Final stock browser
samples took 172–196 ms each and camera movement was visible, so they do not
establish intermediate body motion, a fixed-camera trajectory, limb animation
or exact cadence. The independently recorded fungus debit difference remains
pending: full one-point entry alone cannot distinguish intrinsic cost, clamping,
success probability or faction modifiers. This graphics change does not alter
that unsupported movement policy.

Final installed stock-Former application proof passes on that runtime: 3,156
nonblack preview pixels, 50 distinct RGB values and 2,679 matching component
pixels in the actual stock HUD. Actual east input settles at the adjacent tile,
exhausts its movement point and preserves all other observed native fields for
seven players, cities and units. Reports and private frames are retained at
`/tmp/unit-cvr-browser-stock-{old,new}`; the display-free red overlay is
`/tmp/unit-cvr-source-baseline/report.json`, and focused results are
`/tmp/unit-cvr-focused.json`. These local artifact paths are evidence locations,
not prerequisites for public CI.
