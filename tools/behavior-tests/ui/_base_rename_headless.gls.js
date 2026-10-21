// Observe actual mounted controls and native state. Missing Rename behavior is
// an error, never an expected dialog or a fixture-written name/title.
const fixture = #include('./_base_rename_fixture');
const run = (input) => {
 #print('RENAME_CASE|' + input.id); let f = null;
 try {
  f = fixture(input); const initial = f.game.get_year(); const base = f.base;
  const origin = base.get_tile(); const owner = base.get_owner().id; const base_id = base.id + 0;
  const pops = base.get_pops(); if (#sizeof(pops) != 1) { throw Error('Expected one initial native Doctor'); }
  const doctor = pops[0]; const doctor_id = doctor.id + 0;
  const ids = {}; const definitions = {scout: 'ScoutPatrol', former: 'Formers', colony: 'ColonyPod'};
  for (let i = 0; i < 3; i++) { const role = ['scout', 'former', 'colony'][i]; ids[role] = f.units[i].id + 0; }
  const role_of = (id) => {
   if (id == null) { return 'none'; }
   for (role of ['scout', 'former', 'colony']) { if (ids[role] == id) { return role; } }
   throw Error('Unknown native Rename selection');
  };
  const mounted_dialog = () => {
   if (!#is_defined(f.management.rename_dialog) || f.management.rename_dialog == null) { return null; }
   const dialog = f.management.rename_dialog; let actual_input = false;
   for (node of f.view.live('input')) { if (node == dialog.input && node.is_visible()) { actual_input = true; } }
   if (!actual_input || dialog.frame.is_removed() || !dialog.frame.is_visible()) { throw Error('Rename controls are not actually mounted'); }
   return dialog;
  };
  const observe = (index) => {
   const context = f.context();
   if (context.screen == 'base') { f.require_hud(); }
   else { f.require_map_label(); }
   const dialog = mounted_dialog(); const active_screen = dialog == null ? context.screen : 'rename';
   #print('RENAME_STATE|' + #to_string(index) + '|' + active_screen + '|' + #to_string(f.game.get_year() - initial) + '|' + role_of(f.selected_id()));
   if (context.screen == 'base') { #print('RENAME_TITLE|' + f.actual_title()); }
   if (#sizeof(f.game.bm.get_bases()) != 1 || base.id != base_id || base.get_owner().id != owner || base.get_tile() != origin || origin.get_base() != base) { throw Error('Rename changed native city identity/ownership/position/membership'); }
   const current = base.get_pops();
   if (#sizeof(current) != 1 || current[0] != doctor || doctor.id != doctor_id || doctor.get_type() != 'DOCTOR' || doctor.has('worked_tile')) { throw Error('Rename changed native citizen identity/job'); }
   if (base.get('accumulated_nutrients') != input.initial_base.nutrients || base.get_production().minerals != input.initial_base.minerals) { throw Error('Rename changed stored city resources'); }
   #print('RENAME_NAME|' + base.name);
   #print('RENAME_BASE|' + #to_string(base.get_size()) + '|0|1|' + #to_string(#sizeof(base.get_worked_tiles())) + '|1');
   if (#sizeof(f.native.inspect().unit_ids) != 3 || #sizeof(origin.get_units()) != 3) { throw Error('Rename changed native global/stack unit membership'); }
   for (role of ['scout', 'former', 'colony']) {
    const unit = f.game.um.get_unit(ids[role]);
    if (unit.def != definitions[role] || unit.owner != owner || unit.health != 1.0 || unit.get_tile() != origin) { throw Error('Rename changed native unit identity/owner/health/position'); }
    let code = (0 - 1); const order = unit.get_order();
    if (order == 'NO_ORDERS') { code = 0; } else if (order == 'SENTRY') { code = 1; } else if (order == 'HOLD') { code = 2; }
    if (code < 0) { throw Error('Unrecognized Rename companion order'); }
    #print('RENAME_UNIT|' + role + '|' + #to_string(code) + '|' + #to_string(#round((1.0 - unit.movement) * 3.0)));
   }
   if (dialog != null) {
    #print('RENAME_CAPTION|' + dialog.caption.text); #print('RENAME_PROMPT|' + dialog.prompt.text); #print('RENAME_LABEL|' + dialog.label.text);
    const value = dialog.input.input_state.get_value();
    if (dialog.input.value != value) { throw Error('Mounted input and native editor state disagree'); }
    #print('RENAME_VALUE|' + value); #print('RENAME_BUTTON|' + dialog.ok.text); #print('RENAME_BUTTON|' + dialog.cancel.text);
   }
   #print('RENAME_STATE_DONE');
  };
  f.action('open'); observe(0); let index = 1;
  for (action of input.actions) {
   if (action == 'rename') {
    const context = f.context(); if (context.screen != 'base') { throw Error('Rename requires actual management'); }
    let button = null;
    for (node of f.management.sections.buttons.buttons) {
     if (node.text == 'RENAME' && !node.is_removed() && node.is_visible()) { if (button != null) { throw Error('Ambiguous mounted Rename control'); } button = node; }
    }
    if (button == null) { throw Error('Missing actual mounted Rename button'); }
    button.emit('click', {button: 'left'}); f.flush();
    if (mounted_dialog() == null) { throw Error('Actual Rename dialog/input is not mounted by production control'); }
   } else if (action == 'button-ok' || action == 'button-cancel') {
    const dialog = mounted_dialog(); if (dialog == null) { throw Error('Missing actual Rename buttons'); }
    const button = action == 'button-ok' ? dialog.ok : dialog.cancel;
    if (button.is_removed() || !button.is_visible()) { throw Error('Rename button is not mounted'); }
    button.emit('click', {button: 'left'}); f.flush();
   } else if (action == 'confirm' || action == 'cancel') {
    const dialog = mounted_dialog(); if (dialog == null) { throw Error('Missing actual Rename key target'); }
    if (action == 'confirm') { dialog.input.raw_key('ENTER', '', 0, ''); }
    else { dialog.frame.emit('keydown', {code: 'ESCAPE', modifiers: {}}); }
    f.flush();
   } else if (action == 'open' || action == 'close') { f.action(action); }
   else if (#typeof(action) == 'Object' && #typeof(action.edit) == 'String') {
    const dialog = mounted_dialog(); if (dialog == null) { throw Error('Missing actual native Rename edit target'); }
    let clears = 0;
    while (dialog.input.input_state.get_value() != '' && clears < 256) { dialog.input.raw_key('BACKSPACE', '', 0, ''); clears++; }
    if (dialog.input.input_state.get_value() != '') { throw Error('Native Rename input did not clear'); }
    for (character of action.keys) { dialog.input.raw_key('NONE', character, 0, ''); }
   } else { throw Error('Unknown Rename action'); }
   observe(index); index++;
  }
  f.view.root.remove(); f = null; #print('RENAME_CASE_DONE');
 } catch { : (error) => { if (f != null) { f.view.root.remove(); } #print('RENAME_ERROR|' + #to_string(error)); } }
};
for (input of rename_inputs) { run(input); }
