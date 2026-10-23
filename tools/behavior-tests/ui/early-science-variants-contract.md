# Early science: stock faction and difficulty variants

`game.early_science_variants.v1` is optional asset-backed evidence, pending and
outside passing catalogs. Two independently repeated complete original runs
agree on both cases and all12 checkpoints. Earlier records remain unchanged.

The synthetic map remains flat arid40×80. All installed faction, technology,
unit and citizen data is stock. Both cases select directed target5 through the
real chooser, read actual base allocation and Labs income, hold ready owned
units, and observe Laboratories after the first-city setup and each of five
actual Turn Complete advances. Verified communications channels are declined
if interrupted. No internal credit phase or cause is supplied as an input.

| Profile | Actual setup choice | Native human faction ID | Initial actual Labs total | Initial allocation economy/psych/labs |
| --- | --- | ---: | ---: | --- |
| `hive-citizen` | Stock Hive, Citizen (difficulty ordinal0) | 2 | 1 | 50/0/50 percent |
| `gaians-talent` | Stock Gaians, Talent (difficulty ordinal2) | 1 | 1 | 50/0/50 percent |

Native turn counters1..6 are checkpoint units; they are not elapsed income-turn
counts. At each checkpoint the actual rendered cost, accumulated science and
per-turn estimate are read independently. Accumulated science is cross-checked
against the read-only native field. Ownership, selected target, actual city and
unit roster remain observable context, rather than guessed starting state.

| Profile | Actual accumulated science at native counters1..6 | Displayed cost | Displayed per-turn estimate |
| --- | --- | ---: | ---: |
| Hive/Citizen | 0,0,0,0,1,2 | 9 throughout | 1 throughout |
| Gaians/Talent | 0,1,2,3,4,5 | 10 throughout | 1 throughout |

The Talent case contradicts universal suppression before native turn5. These
records do not establish an unobserved difficulty threshold, a generic startup
delay, an internal credit phase, arbitrary faction timing or acquisition.

Laboratories entry uses actual MENU → HQ → Laboratories Status controls. Installed
`menu.txt` block `HQ` has this command at zero-based nonseparator source slot5,
excluding the title line, with declared hint `F2`. The earlier independently
repeated synthetic HQ presentation shows its source identity `HQ ENTRY SIX`
as a visible light row. These timing cases establish menu entry. A successful
F2 entry has not yet been established by the original Wine input transport;
no general F2 no-op behavior is inferred from unsuccessful delivery attempts.

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/ui/cases/early-science-variants.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/ui/science_timing_variants_original.py --assets /var/home/pawel/reimplementation/smac-wasm/smac-assets --wine /tmp/glsmac-controls-research/wine-11.20-amd64-wow64/bin/wine --artifacts /tmp/research-science-variants-recording-v2' \
  --output tools/behavior-tests/ui/observations/early-science-variants.json \
  --repeat 2 --timeout 600
```

No source code, original algorithms or asset bodies are transferred. Candidate
agreement and broader timing policy require separate validation.
