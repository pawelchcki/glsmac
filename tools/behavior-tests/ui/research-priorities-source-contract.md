# Research priorities and Blind Research source inputs

This is input-schema documentation. Installed labels are supplied locally;
original asset block bodies are not checked in. The recorded UI cases are
optional and asset-backed, outside all default passing catalogs. Synthetic
examples below describe syntax and are not original-game observations.

The installed common `Script.txt` and expansion `xscript.txt` contain matching
relevant block schemas. They are Windows-1252 text sources with `#` block names and
semicolon comments. Relevant blocks are:

| Block | Input shape used by the bounded controls |
| --- | --- |
| `USERULES` | `#caption`, followed by `#itemlist` and three setup route labels in declaration order: Standard, Current, Customize |
| `RULES` | `#caption`, one extra `#button` label, `#itemlist` with 18 option labels; Blind Research is zero-based option 9 |
| `TECHNOLOGY` | `#caption`, two `#button` directives in declaration order (Info, Lookup), no body rows |
| `TECHRANDOM` | `#caption`, three body lines, blank separator, then four priority labels in declaration order |

The installed `labels.txt` `#LABELS` table declares 1131 rows. After the
count line, zero-based label indices 101 and 102 supply OK and Cancel. These
positions are source schema; edited-label consumption is outside this batch.

The four priority positions correspond to Explore, Discover, Build, Conquer;
that order maps to growth, technology, wealth, power respectively. Source text
supplies presentation; checked defaults and persistence are observed behavior,
not encoded by these labels. The extra `RULES` button is the reset-to-standard
control. The standard OK/Cancel labels come from the application's shared dialog
controls, rather than further `#button` lines in these two blocks.

A synthetic priority-block example illustrates the body/label boundary:

```text
#TECHRANDOM
#xs 440
#caption SYNTHETIC PRIORITIES
Choose areas for the synthetic study program.
Multiple areas may be selected.
This sentence is presentation text.

AREA A: Synthetic exploration
AREA B: Synthetic discovery
AREA C: Synthetic infrastructure
AREA D: Synthetic military study
```

For `RULES`, preserve declaration identity rather than matching an option by its
visible English text: the bounded Blind Research option has source index 9.
The other 17 options remain opaque inputs for this batch. Their game mechanics,
complete default mask, validation and interaction are not established here.

Common-versus-expansion precedence, edited labels/captions, custom source layout
variants and malformed input are not tested by these new recordings. In
particular, this schema is not evidence that arbitrary synthetic replacements
have been executed by the original game. Replaying the exact recorded installed
labels currently requires the locally supplied dataset or an independently
recorded equivalent synthetic source profile.

## HQ command identity

In installed `menu.txt`, block `#HQ` has one title line followed by 17
nonseparator source items. Zero-based **source slot 1** is the declared Set
Research Priorities command with the Shift+R hint. The title is not an item;
inserted presentation separators do not change this identity.

The existing independently repeated synthetic HQ presentation confirms this
slot is visible in the declared initial Scout/Gaian context: in
`observations/smacx-gog-2.0-ingame-menus.json`, case `ingame-menu-header-1`,
checkpoint 2 (`after_action: 1`), its source-derived `HQ ENTRY TWO` label is the
second displayed row and has observed light tone. The header-switch case repeats
the same row at checkpoint 3 (`after_action: 2`). These presentation observations
establish visibility and tone, not row effects or general enabled semantics.
The actual priority-dialog opening is separately established through the real
Shift+R traces in this batch. Binding the menu callback by `HQ`/slot 1 preserves
source identity under wording changes without interpreting the displayed label.
