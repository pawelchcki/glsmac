# Minimum custom worlds through native generation

`python3 tools/behavior-tests/state_trace/world_minimum.py --runtime build/wasm/bin/GLSMAC.js --report build/world-minimum.json`

This public, asset-free replay covers the four frozen minimum-axis cases in
`setup-controls`: UI 2×2, 2×32, 32×2 and 16×16. It drives the shipped custom-size
controls with equivalent synthetic installed text, then calls the actual
`Map::Generate` / `SimplePerlin` pipeline. The five observed fields come from the
generated native grid after native map serialization and decoding. They are
compared exactly with the two original repeat-two observation files, preserving
each capture's separate provenance. Every file in the pinned setup-controls
manifest is validated, including the roster records outside this replay.

The test-only generation seam owns a separate native session and uses declared
candidate seed 17. It checks reciprocal east/west links, shared elevation links,
codec roundtrip, actual RNG consumption and preservation of the calling session's
editable settings, map, players/base state, RNG and pending frontend requests.
Additional application controls check that a named 16×16 native map remains
16×16, imported 4×2 native geometry remains 4×2, and imported/out-of-bound inputs
cannot enter this bounded generation seam. These controls are not original
observations and do not increase the four-case agreement count.

The minimum normalization was already implemented. This adds coverage of its
real generation consumer; it does not claim a new production correction.
Display/audio, next-step UI and installed text are mocked. Generated terrain
contents, RNG equivalence, rendering, timing and every player's/city's original
state were not observed by the dimension contract and remain unsupported. The
other four roster/setup cases are outside this run, and the complete setup
package has zero passing cases. The report binds worker, loader, WASM, scripts,
adapter and template hashes; worker launch/timeout failures cannot reuse a stale
passing report. Hot CI executes this replay on its freshly compiled engine.
