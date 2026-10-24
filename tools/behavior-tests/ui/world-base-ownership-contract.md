# First-city world base ownership

`game.world_base_ownership.v1` compares actual base ownership after ordinary
Gaian/Citizen/standard-rules startup on a declared flat land grid. The original
observer was run twice in fresh setup processes. Its immutable v2 evidence is
`observations/smacx-gog-2.0-world-base-ownership.json` (SHA-256
`71a75678cc7288fc9b90c8653864e154357e6fea600c125352bab97152b72436`).

The input's `world_width: 40` and `world_height: 80` are actual native coordinate
extents: 1,600 tiles have matching x/y parity. They are not custom-size UI field
values. The human first city has no Workers or worked squares, one Doctor, zero
stored nutrients and nine stored minerals. A Scout/Former/Colony stack is a
declared fixture control. These inputs do not establish natural starting units,
population allocation, stores, terrain or placement.

The observed output is one human faction, one human base, seven owners with
bases, seven total bases, and six other owners with one base each. The sorted
`other_owner_base_counts` deliberately omits owner identities. Owners without
bases are absent from this field and from `owners_with_bases`; this is not a
complete participant roster. Opponent faction composition, AI choices,
diplomacy, movement, turns and general single-player playability are unobserved.

The candidate starts an empty native State, tile grid and entity managers. It
loads equivalent synthetic faction/component inputs through shipped consumers
and the actual native faction manager. It then calls
`State::AddSinglePlayerSlot`, the same initializer used by ordinary
`GLSMAC::start_game` and Quick Start. No fixture player or opponent is seeded.
The shipped `game/world/default.gls.js` receives the actual native Game wrapper;
native `get_players`, registered startup handlers and the host event queue
produce the entities. The observer reads native base identities and owner
slots. It never supplies a player list, base-owner counts or expected answers.
Graphics, colors, base names, pre-world lifecycle and event-loop pumping are
controlled boundaries. Setup menus and rendered controls are not replayed.
The declared Doctor and resource stores are initialized directly through native
Base methods under a fixture write guard; this does not claim the full city
initialization lifecycle was replayed.

This probe omits a UI roster, so production startup fills the selected human
slot and up to six configured computers in declared faction order. Ordinary UI
startup instead supplies every displayed faction choice. Computer roles have
no network connection identity. Native turn lifecycle completes their currently
unimplemented order phase so they do not block the human round; AI decisions
and movement remain separate gaps.

The unchanged frozen ownership record now matches native-backed WASM replay:
one human faction, one human base, seven owners with bases, seven total bases
and six other owner counts of one. This one case is included in the hot passing
catalog. It establishes only the declared ownership counts; the complete
natural-state traces retain inventory, resource, placement and AI differences.
This replay executes the compiled C++ State, slots, event queue and entity
managers in WASM. It is separate from the full-discovery C++/GSE engine gate and
does not claim execution of a desktop-native binary.
The hot `world-single-player-setup` regression separately checks participant
identity, role transfer, source order, repeated ordinary rounds and authority.

Run the explicit strict comparison with a rebuilt FastDebug runtime:

```sh
WASM_HEADLESS_APP_DIR=/path/to/rebuilt/bin python3 tools/behavior-tests/ui/run.py \
  --suite world-base-ownership --jobs 1
```

A mismatch returns nonzero. `--validate-only` checks evidence integrity and
does not execute the candidate or establish agreement. The frozen runtime from
before the shared native fixture was added cannot execute this new probe.

For independent original recapture, use the fingerprinted
`world_base_ownership_original.py` with the original assets, Wine and the
[archived queued-input transport prerequisites](reference-archives/unit-menu-context-saved-v26/README.md).
Write a new observation file rather than replacing accepted gold:

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/ui/cases/world-base-ownership.json \
  --command 'python3 tools/behavior-tests/ui/world_base_ownership_original.py --assets /path/to/smac-assets --wine /path/to/wine --artifacts /tmp/world-ownership-recapture' \
  --output /tmp/world-ownership-recapture.json --repeat 2 --jobs 1 --timeout 600
```

Each case executes fresh ordinary setup. The recorder reads bounded actual
city owners and the human mask, repeats the read, and checks that city/unit/year
state remains unchanged. No original executable or assets are needed for
recorded-case candidate replay.
