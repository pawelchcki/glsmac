# First directed research choice

`ui.initial_directed_research.v1` is a bounded real-application UI contract.
Each case starts a fresh original process: Start Game, Make Random Map, Tiny,
Citizen, Customize Rules, turn off Blind Research, select base-game Gaians,
accept the default identity, finish Planetfall, accept the first-base name and
close the Tour prompt. Generated terrain varies and is outside the observed projection. No gameplay
turn is advanced. Shift+R opens Set Research
Priorities; the About Research prompt is accepted before the initial checkpoint.
The executable is the pinned GOG Alien Crossfire v2.0 image accepted by the
existing driver (3,084,288 bytes; SHA-256
`01901cbf7196b0c5d0df9540a029520f5df8fd9a6b343deef8b5663872805fcf`).

Inputs choose card ordinals 0..6 in screen reading order (left to right, then
top to bottom), press Escape, or reopen through Shift+R. Outputs observe the
actual caption and ordered card names/category labels while the chooser is open,
and the read-only native selected research ID at every checkpoint. The reader
guards the actual human faction and initial native turn counter. Titles are read from their
rendered glyph color; category text and captions use independent OCR readings.
No expected-name dictionary, source table or candidate implementation supplies an
output. Each complete checkpoint must stabilize across repeated observations. A selected
ID of -1 means no goal has been chosen. The HUD can retain an old research name
after a change, so HUD wording is deliberately outside the output projection.
Native selected IDs were independently cross-checked through three actual card
choices before defining this observer. No target ID is calculated from the
synthetic action ordinal.

Three synthetic action sequences distinguish selection, Escape and re-entry.
The strict recorder requires two independent complete identical original runs;
per-case setup always starts a fresh game process. Screenshots and logs remain in
private `/tmp/research-choice-recording-*` artifacts. Only synthetic inputs,
observed output JSON and reference infrastructure belong in the checkout.

Record with the local original installation and the reference Python environment:

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/ui/cases/initial-directed-research.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/ui/research_choice_original.py --assets /var/home/pawel/reimplementation/smac-wasm/smac-assets --wine /tmp/glsmac-controls-research/wine-11.20-amd64-wow64/bin/wine --artifacts /tmp/research-choice-recording-v5' \
  --output tools/behavior-tests/ui/observations/initial-directed-research.json \
  --repeat 2 --timeout 600
```

This is optional asset-backed evidence, outside all default passing catalogs.
It is pending transfer until native/WASM candidate replay executes the same
bounded contract. It adds no passing release cases by itself. It establishes no
research cost, science allocation, progress, acquisition, subsequent choices,
random research exclusions, AI research, other factions, advanced technologies,
flag effects, Info/Lookup behavior, keyboard card navigation, or rendering
fidelity. Standard Rules use blind research priorities and are outside this
directed fixture. Source import schema is documented separately in
[technology-source-contract.md](../../smac-data/technology-source-contract.md).

## Independent initial eligibility set

The separate `technology.initial_source_eligibility.v1` input supplies only
`owned_ids: [6]`, `faction_id: 1`, and `expansion_enabled: true`. At runtime the
reference adapter reads the installed source and supplies its prerequisites to
the existing original `technology.available.v1` helper. It queries each of IDs
0..88 in a fresh helper fixture. Two independently recorded complete runs yield
`available_ids: [0,1,2,3,4,5,78]`. These are exactly the seven visible card
identities for this initial Gaian fixture, compared through the installed ID/name
association. Source bytes are bound by SHA-256 metadata and never copied into
the synthetic case or observation.

This establishes agreement of initial membership with the existing availability
predicate for this fixture. It does not establish an additional filter, the
absence of additional filters in later contexts, or general choice ordering.
The UI records separately establish reading order and categories for these seven
cards. Candidate choices should come from source-backed availability rather than
embedding the observed display strings.

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/ui/cases/initial-research-eligibility.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/ui/research_eligibility_original.py --assets /var/home/pawel/reimplementation/smac-wasm/smac-assets' \
  --output tools/behavior-tests/ui/observations/initial-research-eligibility.json \
  --repeat 2 --timeout 60
```

This extra source-backed helper case is pending transfer and requires local
installed text to recapture. It contributes no asset-free passing UI count.

## Repeated observations

Both complete original passes agree on all three cases and ten checkpoints.
Reading order is Doctrine: Mobility, Progenitor Psych, Biogenetics, Information
Networks, Industrial Base, Social Psych, Applied Physics. Their observed category
labels are respectively EXPLORE 1, EXPLORE 1, DISCOVER 1, DISCOVER 1, BUILD 1,
BUILD 1, CONQUER 1 (uppercase OCR observations, not a punctuation fidelity claim).

The native target sequences are:

| Input sequence after initial opening | Observed native goal IDs, including initial checkpoint |
| --- | --- |
| Escape; choose card 0 | -1, -1, 5 |
| Choose card 2; reopen; Escape; choose card 6 | -1, 0, 0, 0, 3 |
| Choose card 4 | -1, 1 |

A card click immediately closes the chooser and commits the selected target.
Escape leaves this chooser open and preserves the goal, both before the first
choice and after re-entry. No separate confirmation or cancel button is observed
in this seven-card page. Choosing a research target is not evidence of acquiring
that technology. Progress and acquisition remain unsupported by this batch.


## Optional candidate transfer

`research_headless.py --assets /path/to/game` now replays all three directed
cases (ten checkpoints) through installed source parsing, real native Gaian
single-player startup and the shipped Shift+R/popup/backend-event path. Actual
card text/category nodes, native selected IDs and popup visibility match all
three immutable recordings. Display/audio, flat terrain, art definitions and
base-name artwork inputs form the declared boundary. Setup navigation, tutorial
presentation and pixels are excluded. These locally supplied-asset checks remain
outside the default release catalogs. They add no public asset-free case count.
The independent all-89 eligibility helper record remains unregistered/pending
its own candidate adapter.
