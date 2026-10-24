# Bounded original setup controls, version 1

These independent original-executable observations cover setup decisions at the
first visible Planetfall checkpoint. They are clean input/output evidence for
observed-tuple regressions. They are outside the passing replay catalog and its
default totals until a versioned public adapter is integrated. No candidate
implementation was inspected or executed during these captures.

All JSON input files were frozen before the corresponding launches. World
outputs were read from the actual created original world, after visible
Planetfall and positive actual unit/base counts. No requested faction assignment
was substituted for an observed assignment. Each accepted suite passed two
independent complete runs with identical outputs and original metadata. Every
actual owner1..7 faction filename and actual human owner is retained.

## Dimension inputs and units

`map.custom_grid_dimensions.v1` accepts decimal UI strings `horizontal` and
`vertical`. The route is Start Game, Make Random Map, Custom Size; edit both
actual visible fields, confirm; stock Citizen, standard rules, default faction
and name; observe actual Planetfall. `width`, `height`, `half_width`, `tile_count`
and `size_kind` are native integer fields. Horizontal native width is twice its
half_width; tile_count equals half_width times height. The user-entered UI field
and the resulting native width are different units.

Recorded controls are UI2x2, UI2x32, UI32x2 and UI16x16. These isolate the minimum
independently on both axes. The evidence does not establish negative, odd,
maximum, overflow, or arbitrary nonnumeric behavior. Prelaunch visible input
values remain the values typed, independently of later launch normalization.

The old numeric OCR classified the actual rendered 32 as `$2`. The independently
reviewed retained frame supplies an exact blue numeric glyph witness for 32;
only the full-height blinking caret is removed and empty border pixels trimmed.
The witness is matched to actual subsequent field pixels, independently of the
requested input. Other digits use the existing numeric reader. All typed frames
and readbacks remain retained. The clean export removes only private native
field-address metadata and binds the full source record hash; all semantic
observations are unchanged.

## Roster inputs and output

`game.setup_roster_resolution.v1` inputs declare the flat-arid native40x80 map,
stock text, Citizen, standard rules, base or expansion displayed preset, roster
edits by UI row and dropdown option ordinal, selected UI row, selected/random
mode, reference seed1 at immediately-before-faction-OK, and first-post-world
Planetfall checkpoint. `leader_name` is the authored text supplied only if a
Name prompt is actually observed. It does not require inventing a prompt when
one is absent. The actual selected RANDOM dropdown and RandomMode are distinct
input controls. Before-launch `items`, zero-based `selected`, and `random` are
native UI state, not desired state. `after_launch.players` contains every actual
owner1..7 and actual installed faction filename; `human_owner` is the actual
human slot. `native_turn` is observed at Planetfall, before entering the first
playable turn. No player identities are projected away for reproducibility.

The bounded cases are base RandomMode; explicit duplicate Gaia rows0/1 with
human row0; expansion RandomMode; and base selected human row0 changed to the
RANDOM dropdown with the other six base factions explicit. These cases do not
claim a probability distribution over seeds or behavior of every possible
mixed/custom roster. Seed equivalence with a different engine is not claimed.

Prompt observations retain actual caption, label and action labels. Generic
`Name:` and ordinary gendered Name editors have different button geometry.
`leader_initial_value: null` means typed native value unavailable, not an empty
string assertion. Retained rendered images separately show the generic empty
editor. A prompt-free launch has `leader_prompt: null` and
`leader_prompt_confirmed: false`; it is not an inferred failure.

## Provenance and rejected attempts

`provenance-v1.json` binds original executable/assets, full private record hashes,
source fingerprints, repeated run artifacts, exact typed-field witness and
observed controller failures. Private original-only sources are hash-listed;
they are not part of this clean public package. Earlier accepted state-trace
manifests and all their files remain unchanged. Failed controller/OCR attempts
and the incorrect generic three-region button observation remain preserved;
none is promoted as an accepted semantic answer. No failing original result is
repaired by editing a post-action world answer.
