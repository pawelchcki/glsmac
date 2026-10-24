# Rejected unseeded full-state runs

These two fresh original processes executed the same declared setup and actions.
All seven players, all units and all bases are retained at every checkpoint.
Initial coordinates and next-turn opponent coordinates differ, so these runs
are rejected and MUST NOT be loaded as accepted comparison observations.

`manifest.json` binds each unchanged full JSON observation. The input was frozen
before these observations; its bytes are preserved as `input.json`. The two
original identities are retained in `repeat-*/metadata.json`. No source, original
binary, byte dump, disassembly, or original asset is included.

A new, separately frozen scenario fixes PRNG input state before world placement.
It does not trim positions, change owner identities, or copy expected entities
into either engine.
