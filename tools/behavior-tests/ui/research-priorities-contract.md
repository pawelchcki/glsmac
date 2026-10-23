# Initial blind research priorities and setup toggle

These are optional asset-backed original observations, pending candidate
transfer and excluded from default passing catalogs. The pinned original
executable is 3,084,288 bytes with SHA-256
`01901cbf7196b0c5d0df9540a029520f5df8fd9a6b343deef8b5663872805fcf`.
No original code, process memory or installed text is patched. Every case starts
a fresh original process in a private installation and resets its preferences.
Screenshots and exploratory failures remain private `/tmp` artifacts.

`ui.initial_blind_priorities.v1` starts a Tiny/Citizen Gaian Standard Rules game,
accepts the default identity and first-base name, closes Tour and delivers the
real Shift+R shortcut for MENU → HQ → Set Research Priorities. Five synthetic
sequences cover untouched OK/reopen, individual Discover/Build/Conquer toggles,
Explore off to leave all four unchecked, OK, Enter, Escape and reopening. There
is no gameplay turn advancement. Outputs read the actual caption, ordered four
labels, checked checkbox glyphs, OK label and map/dialog return state. Changes
are not inferred from the requested action.

`ui.blind_research_rule.v1` begins at the actual Customize Game Rules dialog on
the same Tiny/Citizen setup route. It observes only the Blind Research row,
caption and three buttons. Three cases cover a canceled toggle and re-entry;
a confirmed off toggle, back through difficulty and Current Rules, then an
actual Gaian first-research opening; and the Standard Rules reset followed by
an actual first-research opening. Intermediate faction selectors and sliding
menus are observed. The first-use About Research tutorial is accepted only
when it is actually visible. Research mode is observed from the resulting
real dialog caption, rather than calculated from a requested checkbox value.

The source-input schema is separate:
[research-priorities-source-contract.md](research-priorities-source-contract.md).
Each recorder requires two independent complete identical original runs.

```sh
python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/ui/cases/initial-blind-priorities.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/ui/research_priorities_original.py --assets /var/home/pawel/reimplementation/smac-wasm/smac-assets --wine /tmp/glsmac-controls-research/wine-11.20-amd64-wow64/bin/wine --artifacts /tmp/research-priorities-recording-v1' \
  --output tools/behavior-tests/ui/observations/initial-blind-priorities.json \
  --repeat 2 --timeout 600

python3 tools/behavior-tests/compare.py record \
  --cases tools/behavior-tests/ui/cases/blind-research-rule.json \
  --command '/tmp/glsmac-reference-venv/bin/python tools/behavior-tests/ui/blind_rule_original.py --assets /var/home/pawel/reimplementation/smac-wasm/smac-assets --wine /tmp/glsmac-controls-research/wine-11.20-amd64-wow64/bin/wine --artifacts /tmp/blind-rule-recording-v2' \
  --output tools/behavior-tests/ui/observations/blind-research-rule.json \
  --repeat 2 --timeout 600
```

This batch does not establish blind-research technology selection probabilities,
RNG, costs, progress, acquisition, other factions/difficulties, all combinations
of priorities, persistent settings across application restarts, keyboard
checkbox navigation, generic Customize Rules mechanics or full rendered
fidelity. Other 17 custom-rule effects and their complete defaults are explicit
gaps. No optional evidence is counted as native/WASM candidate agreement until
those implementations replay it.

## Repeated results

Two independent complete original runs agree on all eight cases: five priority
cases / 19 checkpoints and three rule cases / 16 checkpoints.

Priority bit strings below follow screen/source order Explore, Discover, Build,
Conquer and describe observed checked glyphs, not a native storage encoding.
Every priority case initially displays `1000`.

| Sequence after opening priorities | Draft checks | Close result | Checks after reopen |
| --- | --- | --- | --- |
| OK; reopen | 1000 | Map | 1000 |
| Toggle Discover; OK; reopen | 1100 | Map | 1100 |
| Toggle Explore; OK; reopen | 0000 | Map | 0000 |
| Toggle Build; Escape; reopen | 1010 | Map | 1010 |
| Toggle Conquer; Enter; reopen | 1001 | Map | 1001 |

Thus all-off is attainable and retained. Escape closes this priority dialog
while retaining the edit; it is not an edit-discard operation in this fixture.
Only an OK button is observed.

The Blind Research setup checkbox starts checked. Toggling it off then Cancel
returns to Game Rules with Customize highlighted; reopening Customize shows it
checked again. The Standard Rules button restores a toggled-off checkbox to
checked without closing Customize; subsequent OK and first-base setup reach the
blind-priorities dialog.

In the recorded abandoned-setup sequence, toggling Blind Research off and OK
reaches the faction selector. Escape returns to difficulty. Choosing Citizen,
then Play With Current Rules, and completing the first Gaian base reaches blind
priorities again. This is the exact observed route; it does not establish
Current Rules persistence after finishing a modified game or across process
restarts. The separate immutable
[directed-research contract](initial-directed-research-contract.md) already
records that turning Blind Research off and proceeding directly through OK into
the actual game reaches the directed chooser. No altered Standard Rules default
is inferred.


## Optional candidate transfer

`research_headless.py --assets /path/to/game` replays all five priority cases
(19 checkpoints) through installed source parsing, actual native startup,
Shift+R, shipped checkbox/close callbacks and native event receipts. Actual
source text, check glyphs and popup return states match the immutable original
records, including all-off and Escape retaining edits. It supplies display/audio,
flat terrain, art definitions and base-name artwork inputs. It excludes pixels,
setup navigation and the first-use tutorial. These checks require local assets,
stay outside public release catalogs and do not add public asset-free cases.
The three complete setup-navigation recordings remain pending candidate replay;
synthetic setup regressions separately cover the implemented rule draft behavior.
