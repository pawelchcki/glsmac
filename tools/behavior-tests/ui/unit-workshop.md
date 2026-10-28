# Existing-design Workshop application contract

The base production pane's WORKSHOP button opens a modal browser of the owner's
existing available unit designs with nonnegative production costs. This is the
same inventory used by the production pane; it does not establish that every
design can launch from this particular base. Facilities and unsupported project kinds are
excluded. It starts on the production draft's unit when possible, otherwise the
first available unit. Arrow keys preview a bounded adjacent choice; pointer
SELECT or Enter transfers its stable production ID to the existing draft. The
normal production OK, switch-loss preview, availability and ownership validation
still submit the eventual production event. Browsing and SELECT issue no game
event. Escape or CANCEL discards the Workshop selection and preserves the draft.

The browser displays each live production descriptor's name and mineral price.
Existing installed rule definitions supply combat, reactor, movement and worker
module details. `default/units/render.gls.js` is the same render-policy helper
used by the real unit definitions: the guarded stock land Former uses the
independently bound `VT.cvr` chassis component; other designs retain the existing
portrait fallback. No new model, original assembly, tool binding, transform,
facing or animation semantics are inferred. This is an application preview of
the existing renderer, not a passing original pixel comparison.

The Workshop has its own modal Window, an explicit `game.unit_workshop` dialog
presentation identity, retained selected list ID, mounted preview surfaces/text
and ordinary keyboard events. Closing/removing the base, refreshing its data or
discarding its production pane removes the Workshop. Session tokens fence old
callbacks. Selection also rechecks the base identity, ownership, local player,
turn and currently available unit/production ID before transferring the draft.

`GLSMAC_data/tests/unit_workshop.gls.js` executes the actual production pane,
WORKSHOP button, Workshop controller and render helper through the existing
display boundary. It covers costs and source edits, guarded chassis identity,
naval/authored fallbacks, keyboard/cancel, draft-only transfer, normal production
validation, modal submission fencing, empty inventory and stale lifecycle/state.
The display boundary does not claim native hit testing, focus delivery, actual
resource loading, pixels, sound or animation cadence. Existing native production
and installed stock-Former graphics checks cover their separately stated scopes.

Custom design authoring, component customization, renaming, save/obsolete/upgrade
flows, original Workshop layout and controls, assembled previews, rotation,
movement facing, work animations and audio remain unsupported. Original Workshop
agreement adds zero cases; no original Workshop observation is currently supplied
to this implementation. Full visual and game fidelity remain incomplete.
Per-base eligibility presentation also remains a gap: an inland base can see a
globally available naval design, while normal native production confirmation
rejects it. The observer must retain that inventory and the actual quote error;
it must not remove the design or reinterpret rejection as a free switch.

Bounded verification on production source `db457e8f` and fixture repair
`be1db9e1` used the immutable v6 WASM runtime from native source `115032ff`:
Workshop passed 12 scenarios/42 assertions, existing base-production UI passed
16/72 and startup rule sources passed 25/75. All three processes returned raw
zero with the native success marker and complete behavior summaries; runtime
hashes stayed unchanged. Exact source/runtime/probe hashes and raw logs are in
`/tmp/unit-workshop-proof/fixed2-*`. The actual old `73ef820b` dead-button red,
first session-literal setup failure and later mock-descriptor setup failure are
retained separately under that proof directory. The final test repair only
materializes plain mock inventory descriptors; it changes no expected output.
These are application checks, with zero original Workshop/visual cases. Real
native-window input, resource pixels and final integration CI remain separate.

The shared test observer's quote/source reader also passes a separate native
3-scenario / 13-assertion probe on `1b6a1a89` with raw exit zero and one complete
summary in 2.042 seconds. It retains the inland naval rejection, reaches the
following land design, accepts the same naval quote at a coast and preserves
the native state. Its shifted weapon-table case uses synthetic input through
the real native text parser; installed table linkage remains browser-pending.
Probe SHA-256 is `c31d5875bdaf9b1e562a5311e1d433a99804efa2fcb279e898304a944708bf1b`;
reader SHA-256 is `b5cede1b2f1f7902dc3c50df75858de133bbf8f715574f1e983a5f9134d538d1`.
Artifacts are `/tmp/unit-workshop-observer-native-v2`; the preceding duplicate
summary failure is retained separately and excluded from passing totals.
