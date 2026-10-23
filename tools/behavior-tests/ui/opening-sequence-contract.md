# Natural opening phases and first-turn progression

`ui.opening_sequence.v1` follows a bounded natural new-game path in the
fingerprinted original: Start Game, Make Random Map, Tiny Planet, Citizen,
standard rules, the initial explicit Cybernetic faction and its default leader.
The game creates the world normally. No map, city, unit, resource, turn counter
or original instruction is patched.

The two cases confirm Planetfall and the initial base name using either actual
Enter keys or pointer clicks. Both then click the right-hand tour-message
dismissal control and press Space on the selected Scout. Five observed
checkpoints cover Planetfall, first-base naming, the tour message, the playable
map and the next playable turn. Captions and the selected editor draft are
normalized to uppercase by image OCR. The turn field is read from the actual
native turn counter, not inferred from a screen, a phase name or elapsed time.
The first-base editor is read from its selected rendered text; the different
native type used by this editor is not treated as the faction-name editor.

Reference observations were accepted only after two fresh complete original
runs agreed. Both confirmation paths observe native turns 0, 0, 1, 1 and 2.
The base already exists before Planetfall acknowledgement; confirming the
first-base name starts the first turn before the tour message is dismissed.
These lifecycle observations guide production implementation; drawing a dialog
after turn one has already started would not satisfy this contract.

A candidate missing a required phase may report its actual partial trace and
an explicit missing-control failure. That is a comparable mismatch, never a
completed trace. Runtime/graphics/capture failures remain separate errors.
The validator intentionally allows a well-shaped but wrong observed phase or
turn so ordinary comparison can expose it rather than hide it as unsupported.

This is a rendered natural-flow contract requiring installed assets. It does
not enter the asset-free default UI case count. Synthetic native/backend/UI
regressions verify application mechanics separately; their names or source
text must never be populated from these expected observations.

Scope remains limited to the declared path, phase presence, captions, initial
draft and actual turn progression. Intro movies, paragraph text, font and
geometry, landing animation, visible HUD year, tutorial walkthrough, alternate
setup branches, first-base edits/cancellation, world generation, resources,
fog, unit sprites and computer-player behavior remain separate work. The
full opening-through-first-round request is not complete.
