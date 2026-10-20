# Loading installed SMAC data

This work reads the user's installed rules, menu definitions and dialog
templates through the existing asset resolver. Original files are not copied
into the repository. Synthetic fixture tests require no original installation.
Import fidelity is separate from original-executable gameplay agreement.

## Parser contract

The reusable C++ parser lives in `src/loader/txt/SmacText.h` under namespace
`loader::txt::smac`. It accepts a string and a format (`rules`, `menus`, or
`dialogs`). Its document retains ordered blocks and source line numbers.

- Accept UTF-8 BOM, LF, CRLF and a final unterminated line. Preserve other bytes.
- A trimmed `#` followed by an identifier starting with an uppercase letter (`[A-Z][A-Za-z0-9_]*`), without
  arguments, starts a block. `#END` terminates the document's active block.
- Preserve duplicate blocks in source order. Lookup without an occurrence must
  reject ambiguity; an explicit zero-based occurrence selects one block.
- Retain blank lines, text, comments and lowercase directives as ordered records
  inside each block. Preserve directive name/arguments and text, including `$`
  substitutions, `^` line markers, braces and brackets. This parser does not
  execute dialog conditions or substitutions.
- Semicolon-prefixed lines and hash documentation lines (`##...` and `# ...`)
  are comments, not data or new blocks.
- Rules rows omit comments/blanks and split comma-separated fields. Trim field
  padding, retain empty/trailing fields, strip semicolon comments outside quoted
  fields, accept quoted fields containing commas/semicolons and doubled quotes.
  Quotes inside an unquoted field remain literal. Reject unterminated leading
  quoted fields with source context. Text following a closed quoted token stays
  in the field (some explanatory tails use that shape). Return strings; numeric interpretation is
  the consuming rule's responsibility.
- Menu lookup takes the first data line as its title. Following data lines split
  label and shortcut at `|`; absent shortcuts remain empty. Keep mnemonic `&`
  markup and unknown shortcut text. Preserve internal blank-line separators;
  ignore leading/trailing blank separators. Unknown commands remain data, not
  automatically enabled actions.
- Dialog lookup returns its ordered records without guessing precedence among
  directives or discarding unsupported formatting. Duplicate IDs occur in the
  installed dialog data, so their precedence must not be guessed.

The production GSE API is `glsmac.load_smac_text(filename, format)`, using
the existing resource resolver/cache. The returned document offers `ids()`,
`block(id[, occurrence])`, `rows(id[, occurrence])`, `menu(id[, occurrence])`
and `dialog(id[, occurrence])`. Block/dialog results carry `id`, `line` and
`records`; records carry `kind`, `line`, `text`, `name` and `argument`. Menu
results carry `title` and `items`; items carry `label`, `shortcut`, `separator`
and `line`. Records use `text`, `directive`, `blank` and `comment` kinds.

The current reproduction requires SMACX assets; the first bundle therefore
explicitly loads `alphax.txt` as rules, `xscript.txt` as dialogs and `menu.txt`
as menus. Custom dimensions additionally load common `script.txt` and
`labels.txt` lazily. This common CUSTOMMAP source is an independently observed
selection, including with conflicting expansion text; it is not a fallback for
missing expansion data. Do not silently substitute files if a required source
is missing. Explicit alternate filenames may be supported for declared
fixtures/future base-game mode, with their own validation.

The first consumer manifest is deliberately tied to existing action slots:

| Shipped step | Dialog block | Required item count |
| --- | --- | ---: |
| `steps/main` | `TOPMENU` | 7 |
| `steps/start_game` | `MAPMENU` | 5 |
| `steps/scenario` | `SCENARIOMENU` | 4 |
| No equivalent shipped action map yet; preserve as data | `MULTIMENU` | 3 |

For these blocks, `#itemlist` introduces the following ordered text options;
`#caption` supplies the caption when present. Missing captions mean no caption.
The first three blocks decorate existing fixed action callbacks by ordinal.
`MULTIMENU` has three options while the reproduction currently presents two
transport choices; importing labels cannot resolve that behavioral discrepancy.
It remains data-only until its actions are implemented and observed. Data cannot
add an executable action. Reject missing/duplicate itemlist directives, ambiguous
captions, unexpected structure and wrong item counts. Layout directives `xs`,
`x` and `y` may remain unused by the reproduction's existing layout. Other
directives must be preserved by the parser and rejected by this bounded consumer
until supported. Blank separators/comments are not executable options.

`WORLDSIZE` and `DIFFICULTY` are not static item lists in the installed dialog
file. World-size choices now use the native installed rules table described
below; difficulty still needs its separate rules-table integration. Neither
control may be replaced with an empty list from a dialog definition.

The asset-free binding `test.parse_smac_text(source, format)` must use the same
production parser and GSE document wrapper. Invalid argument types/counts,
unknown formats, missing blocks, ambiguous IDs and invalid occurrence bounds
must fail explicitly. Returned collections must not mutate cached documents.

## Installed nutrient rule

The [nutrient rule contract](nutrient-rule-contract.md) maps `RULES` data row five
to native global rules. Startup validates the loaded multiplier before changing
settings, including CLI Quick Start. Existing nutrient arithmetic, growth and
food-grid consumers use the transferred native value. Exact legacy empty rules
retain multiplier 10; malformed current records reject before mutation.

Asset-free tests cover parsing, strict values, aliases/lifetime, native copies,
settings codecs, actual pre-world State transfer, growth/overflow and positive
and zero food grids. Browser checks replace only `alphax.txt` with synthetic
rules through the normal manifest/hash verification path, then check Quick
Start and ordinary Standard gameplay. Run them with installed assets:

```sh
SMAC_ASSETS_DIR=/path/to/installed/game npm --prefix tools/wasm-tests run test:nutrient-rules
```

These integration tests add no original-executable parity cases. The separate
recorded nutrient-factor arithmetic contract retains its existing scope.

## Installed mineral rule

The [mineral rule contract](mineral-rule-contract.md) maps `RULES` data row six
to independent native state. Both startup routes validate nutrient and mineral
scalars before committing either. Declared facility and Colony Pod rows use the
loaded factor for known human named-preset contexts; existing explicit fallbacks
retain their scope. Native transfer supports empty, nutrient-only and current
two-field rules records, with complete validation before mutation.

Synthetic tests cover native descriptors, preview, selection, exact completion,
overflow rejection, zero-priced declared projects and mineral-grid geometry.
The browser check loads nutrient 11 and mineral 13 through the real asset
verification path, enters generated Standard gameplay, checks the actual picker
and selected-project price, and advances a real production turn. A Tiny/rule-one
browser path also selects a free Pod through the real validator, verifies its
size-one population hold, then selects free Tanks and completes them through
real turn controls without spending stored minerals:

```sh
SMAC_ASSETS_DIR=/path/to/installed/game npm --prefix tools/wasm-tests run test:mineral-rules
```

Recorded factor arithmetic remains separate from these application construction
and UI checks; this integration adds no original-executable parity cases.

## Installed world-size table

The [world-size contract](world-size-contract.md) transfers all five ordered
names, descriptions and dimensions into native Rules. Source horizontal
half-widths become backend parity-coordinate widths. Ordinary and CLI Quick
Start initialize the loaded Standard size; explicit subsequent selections keep
their dimensions. The size picker and lobby use native values and stable preset
ordinals, including distinct choices that happen to have equal dimensions.

Configured tables survive native copies, Rules/GlobalSettings codecs and valid
pre-world State transfer. Exact historical records keep their historical
reproduction table; configured current records add a tagged extension after
the two cost values. Complete validation precedes mutation, including malformed
later entries and nested aggregate records. Named selection refreshes retained
map wrappers as one operation. Descriptions remain available as data; their
conditional display remains a separate gap. Four recorded original custom worlds
now establish selected input units and retained odd heights; see the
[generated-grid contract](../behavior-tests/ui/custom-grid-dimensions-contract.md).

Three asset-free suites exercise parser/source validation, strict native APIs,
copies and transfer, actual picker callbacks, the full animated menu controller,
cancel/re-entry, lobby command application/rollback and slave control guards.
With installed assets, verify both startup paths and all five alternate
generated dimensions through real menus, faction selection and real turns:

```sh
SMAC_ASSETS_DIR=/path/to/installed/game npm --prefix tools/wasm-tests run test:world-sizes
```

These are data/application tests, separate from existing original-executable
menu observations and recorded factor arithmetic. Original terrain generation,
full multiplayer synchronization and conditional dialog execution remain gaps.

## Integration and remaining work

The intended consumers are shipped rules/technology/unit/facility data, main
menu labels/captions, in-game menu definitions and dialog content. Parsing or
displaying a definition does not implement its associated gameplay command.
Conditional dialog execution, localized grammatical substitutions, unsupported
menu actions and unimplemented game mechanics need separate implementation and
behavior tests; they must remain explicit gaps.

## Standalone verification and inspection

Run synthetic parser fixtures without installed assets or an engine build:

```sh
python3 tools/smac-data/run.py --target native --report /tmp/smac-text-native.json
python3 tools/smac-data/run.py --target wasm --report /tmp/smac-text-wasm.json
```

The WASM target needs Emscripten and Node. `CXX`, `EMXX` and `NODE` override
the respective commands. Each invocation compiles with warnings as errors in
its own temporary directory, requires the fixture's actual PASS summary, and
emits a JSON report with source, compiled artifact and runtime SHA-256 hashes,
commands, exit codes and captured output. The process exits nonzero on failure.
The runner compiles the fixture program; it records the inspector's source hash
but does not claim to execute an inspector audit.

Build the production-parser inspector separately for source-data audits:

```sh
c++ -std=c++17 -O2 -Wall -Wextra -Werror -Isrc tools/smac-data/inspect.cpp -o /tmp/smac-text-inspect
/tmp/smac-text-inspect rules < /path/to/installed/alphax.txt
/tmp/smac-text-inspect menus < /path/to/installed/menu.txt
/tmp/smac-text-inspect dialogs < /path/to/installed/xscript.txt
```

The inspector emits `{format, blocks}` as strict ASCII JSON. Blocks retain
`id`, `line` and all raw `records`; rules blocks also include `rows`, and menu
blocks include `menu` with `title` and `items`. Duplicate blocks stay ordered.
Every input byte at or above 0x80 is encoded as `\u00XX`, so audit readers must
interpret decoded JSON strings as Latin-1 byte values rather than decode the
source as UTF-8. Parsing/projection errors produce a nonzero exit and stderr
without a partial success document. This checks data import fidelity, not
agreement with an original game executable.


### Installed-file audit

After building the inspector above, run the optional source fidelity check:

```sh
python3 tools/smac-data/audit.py --assets /path/to/installed/game \
  --inspector /tmp/smac-text-inspect --report /tmp/smac-text-import.json
```

It compares raw ordered blocks/records, independently splits unquoted rule rows,
and checks complete menu projections. Quoted grammar is checked separately by
synthetic fixtures. The checked local dataset contained 1,362 rule rows across
`alpha.txt`/`alphax.txt`, 1,501 blocks in each dialog file, and 180 menu items.
No installed text is copied into the checkout. This does not execute original
instructions or verify associated gameplay mechanics.

## Custom-dimension dialog text

The [18 original dialog comparisons](../behavior-tests/ui/dimension-dialog-contract.md)
select common `Script.txt` CUSTOMMAP caption and zero-based `labels.txt` LABELS
entries 1090/1091. `bundle.dimension_dialog()` loads these optional sources only
on first use, validates both before caching and returns a detached definition.
The source count must be canonical, match all label records and include both
ordinals. The caption block accepts a single plain caption, blank/comment records
and the known `xs`/`x`/`y` layout directives; it rejects unexpected body text or
directives. Target text rejects empty values and unsupported formatting markers
(`^`, `|`, `$`, `{`, `}`). Missing/duplicate blocks, malformed counts and unsupported
text fail explicitly. Existing static menus remain usable when optional text fails.
Layout directives are preserved by the shared parser but do not drive layout.
Untouched fields use the recorded raw `40` and `80`. Four separate original
generated-world records verify doubled horizontal coordinates and unchanged
vertical counts for selected values, including odd height 49. Bounds outside
the recorded inputs remain application policy.

## Installed large-map warning

The [84 original warning traces](../behavior-tests/ui/large-map-warning-contract.md)
select common `Script.txt` VERYLARGEMAP even with conflicting expansion text.
`bundle.large_map_warning()` shares the lazy common document with the dimension
consumer and returns detached caption, paragraph lines and two choices. A lone
`^` becomes a blank paragraph line; unsupported inline formatting, directives,
missing body/caption and duplicate blocks fail explicitly. Original paragraph
prose stays in the user's installation. Layout directives remain parsed data.

Production shows this definition when either typed dimension exceeds 128.
Selection clamps, mouse clicks select, and Enter/Escape/OK confirm the current
choice. Nine synthetic source scenarios and twelve control/lifecycle scenarios
exercise caching, malformed input, native settings, caller return and repeated
callbacks without pixels. The installed-source browser check also hashes the
actual loaded body and follows rejection, re-entry and confirmation into a
generated odd-height world and a real gameplay turn.
