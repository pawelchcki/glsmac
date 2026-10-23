# Declared synthetic interface-tour inputs

`ui.interface_tour_controls.v2` is the asset-free recorded replay for Tour
controls. Four cases combine two own text/label profiles with first-page pointer
End and full keyboard Continue/Close. Their 36 checkpoints compare actual
displayed topics, ordered controls, MENU/Commlink visibility and heading text,
the native turn and preservation of human unit state.

[interface_tour_inputs.py](interface_tour_inputs.py) declares marker paragraphs,
the Tour button and Close/End/Continue/empty-contact label overrides. Every case
binds the complete declaration digest. The original receives exactly those
overrides in its private installed source files; its instructions and native
game memory are not patched. Both whole original runs must agree before evidence
is accepted. Unseeded terrain-dependent pages stay in private traces and are
excluded from the mandatory interface projection.

Candidate replay uses an actual native/WASM game fixture, reaches Tour through
the native opening commands and first-turn boundary, and dispatches the real
production UI controls without a display. It reads mounted text and native
state; its topic classifier uses raw declared source data rather than page IDs
or production parser results. Fixture prelude/world data is unmeasured: these
cases establish the declared control/source properties, not equivalence of
generated worlds or earlier setup. No original assets, Wine, browser or browser
dependencies are required for this replay.

The installed-data v1 [browser companion](interface-tour-contract.md) remains
optional. Healthy blank/wrong/stale paragraph mutations must be mismatches;
runtime and transport failures remain errors. Full paragraph wording, rendering,
font/layout, pointers/keypad, other tutorials, diplomacy and computer-player
behavior remain outside both passing control contracts.
