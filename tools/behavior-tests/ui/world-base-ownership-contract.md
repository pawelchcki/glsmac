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

Production currently allocates seven slots but fills only the human slot.
Native `get_players` skips the six open slots, and the world script creates
one base for each occupied slot. The extracted initializer preserves that
behavior. Player/Slot types do not yet supply computer controllers; creating
six ordinary players would cause turn completion to wait for those players.
The ownership discrepancy therefore remains **pending transfer**, outside
passing totals. No artificial controller or automatic opponent completion is
introduced to satisfy this observation.

The first completed native-backed WASM comparison has zero matches, one
mismatch, zero unsupported cases and zero errors. It reports one human faction,
one human base, one owner with a base, one total base and an empty list of other
owner counts. The original seven-owner output remains unchanged. The separate
`world-single-player-setup` HOT regression passes one scenario/11 assertions,
including delivery of the real ready notification to the State-associated
native game. `Slot::Update` now uses that game, retaining the existing global
engine fallback for an unattached State.

Run the explicit strict comparison with a rebuilt FastDebug runtime:

```sh
WASM_APP_DIR=/path/to/rebuilt/bin python3 tools/behavior-tests/ui/run.py \
  --pending --suite world-base-ownership --jobs 1
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
