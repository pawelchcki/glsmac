# Pod landing before first-base naming

`ui.pod_landing.v1` follows Start Game, Make Random Map, Tiny Planet,
Citizen, standard rules, the initial explicit Cybernetic faction and its
default leader. The original creates the world normally. The two cases use
actual Enter or the visible Planetfall OK button, followed by no further input.

The optional rendered comparison identifies installed `drop_pod.flc` frames
1, 7, 15, 21 and 27 from multiple independent eight-pixel strips in captured
application images. The expected frame index never supplies the candidate's
answer: the observer searches actual captured pixels using the installed asset
as its input. Each frame records the horizontal movement sign relative to the
first sample. Native turn reads cover Planetfall, visible landing and the
first-base editor. The editor must appear after the sampled animation; it must
not replace landing immediately. Native turn remains zero throughout.

The declared projection intentionally excludes exact translations and vertical
motion. An initial recorder retaining exact coordinates was rejected because
natural world/camera state changed the measurements between independent runs.
Those captures remain private diagnostics and are not accepted observations.
The current contract requires fresh independent repeated original captures;
it does not round, overwrite or regenerate expected answers from GLSMAC.

Candidate playback uses the actual installed indexed FLC data. Synthetic
asset-free decoder tests cover palette changes, deltas, odd-width padding,
transparency, malformed bounds and allocation limits. Separate production
controller tests cover modal input, one playback per opening session, metadata
durations, completion and stale/lifetime cleanup. These application tests are
not extra original comparisons. No original art or video is committed.

`SMAC_ASSETS_DIR=/path/to/game WASM_APP_DIR=/path/to/app/bin npm --prefix tools/wasm-tests run test:pod-landing:browser`
runs the installed-data companion. It is separate from default asset-free UI
case totals. Actual browser or capture failures remain errors; a healthy app
that displays no pod reports a mismatch with its observed partial trace.
Each execution uses a fresh directory beneath the artifact root. Earlier
captures remain available as evidence and cannot supply frames to a new run.

The contract does not establish full-frame fidelity, exact path or presentation
cadence, smoke compositing, audio, camera equivalence, fog, generated worlds,
other factions or setup routes, intro movies or complete opening/game parity.
