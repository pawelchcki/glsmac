# Three-unit activation picker

`ui.unit_activation_picker.v1` observes the original menu reached by pressing A
after actual Hold on a Scout Patrol, Former and Colony Pod. It uses the same
fresh Gaians/Citizen/standard, flat arid 40×80 original fixture as
`game.unit_selection.v1`, with real first-base setup and declared UNIT bonuses.
All three are owned, healthy and unmoved on the base; no unit is selected.
Pause at end is enabled and tutorials are off. Every case starts a fresh process;
whole captures repeat independently before evidence freezes.

Input has exactly `profile` (`default` or `edited-caption`) and `actions`. A
single `open` starts at most ten actions; optional final `enter`, `escape`, `ok`
or `cancel` ends input. `down`, `up`, `home`, `end` use actual keys. `click0`,
`click1`, `click2` mean one left click on row text at original x=400 and
respectively y=342/382/422; they do not mean clicking the unit icon. Mouse OK and
Cancel use the actual buttons. The caption profile changes only PICKUNIT's
caption in both installed Script.txt and xscript.txt. It does not establish
precedence between those files. Other source content and declared fixture
inputs remain controlled.

Output contains the initial state and every checkpoint as `trace`:

- `year_delta`: actual native turn difference; zero in this contract.
- `picker`: null when closed, otherwise the visible `caption`, ordered
  `choices` roles and highlighted `selected` role. Text is uppercase and
  whitespace normalized; unit roles come from recognized visible name suffixes.
- `selected`: actual native active unit role, or null.
- `units`: Scout, Former, Colony Pod in that order, each with `role`, actual
  `order` (`hold`/`none`) and integer `movement_spent` in thirds.

Original observations use actual visible caption/row OCR, the visible icon-frame
highlight and visible OK/Cancel controls, plus guarded read-only native state.
An unknown executable, disturbed three-unit fixture or ambiguous observation
fails. The adapters supply no expected answers. This contract excludes arbitrary
unit counts/types, icon clicking, double clicking, other terrain, movement,
combat, save/load, general popup ordering and localization.

Seven repeated traces cover default Escape/Enter, clamped arrow navigation,
Home/End, text clicking, actual OK/Cancel buttons and caption transfer. The
historical optimized browser failed the opening checkpoint: it activates Colony
Pod immediately, clears its Hold and selects it without showing a picker. The
original opens the picker while all orders remain held and selection empty.
The fixed production picker now matches all seven frozen traces through native
replay and actual browser input. Opening preserves native orders; only explicit
confirmation submits the chosen native identity. Display-free replay executes
production controls, native units/orders and the shared selection controller;
rendering, transport acknowledgements and frontend delivery are controlled
boundaries. The browser lane separately checks real input delivery, hit testing,
unit-preview widgets, animation settlement and normal asset loading.

Application guards beyond these observations require separate tests and do not extend original parity claims.

```sh
python3 tools/behavior-tests/ui/run.py --suite unit-activation
SMAC_ASSETS_DIR=/path/to/game npm --prefix tools/wasm-tests run test:unit-activation
```
