// Controlled world geometry/display and synchronous frontend delivery only.
// Commands, citizens, turn restoration and queued growth execute production.
const fixture = #include('./_starvation_notice_controls_fixture');
const run = (input) => {
 #print('STARVE_CASE|' + input.id); let f = null;
 try {
  f = fixture(input); f.turn(); const start = f.initial_year;
  // Baseline must fail here if the production turn emits no notification.
  if (!f.popup.is_shown() || f.popup.popup.id != 'starvation') {
   throw Error('Missing actual starvation notification; native population=' + #to_string(f.base.get_size()) + ', year_delta=' + #to_string(f.game.get_year() - start));
  }
  const notice = f.popup.popup_defs.starvation;
  const origin = f.base.get_tile(); const base_id = f.base.id + 0; const base_name = f.base.name + '';
  const original_ids = [f.units[0].id + 0, f.units[1].id + 0]; const owner = f.native.owner.id;
  const visible = (node) => {
   if (node.is_removed() || !node.is_visible() || #typeof(node.text) != 'String' || node.text == '') { throw Error('Missing visible starvation control'); }
   return node.text;
  };
  const observe = (index) => {
   const project = f.base.get_production();
   if (project.choice_id != 'STARVATION_FORMERS' || project.minerals >= 1000) { throw Error('Declared native project changed/completed'); }
   let context = 'map';
   if (f.popup.is_shown()) {
    if (f.popup.popup.id == 'starvation') { context = 'notice'; }
    else { const c = f.context(); if (c.screen != 'base' || !c.title_matches_base) { throw Error('Incomplete starvation Zoom base screen'); } context = 'base'; }
   }
   if (context == 'base') {
    const screen = f.popup.popup_defs.base_screen;
    for (type of ['nutrients', 'minerals', 'energy']) { const labels = screen.sections.resources.labels[type]; visible(labels.left); visible(labels.right); }
    const panel = screen.sections.bottom_bar.parts.production;
    if (visible(panel.production_title) != 'Formers') { throw Error('Missing incomplete Formers project'); } visible(panel.production_amount);
   }
   if (context == 'map') {
    if (f.context().screen != 'map' || visible(f.turn_button) != 'TURN COMPLETE') { throw Error('Map continuation is incomplete'); }
   }
   #print('STARVE_STATE|' + #to_string(index) + '|' + #to_string(f.game.get_year() - start) + '|' + context);
   let owned = 0;
   for (base of f.game.bm.get_bases()) {
    if (base.get_owner().id != owner) { continue; } owned++;
    if (base != f.base || base.id != base_id || base.name != base_name || base.get_tile() != origin || origin.get_base() != base) { throw Error('Starvation changed base identity/ownership/position'); }
   }
   if (owned != 1 || #sizeof(f.game.bm.get_bases()) != 1) { throw Error('Starvation changed base membership'); }
   let workers = 0; let doctors = 0; const pop_ids = {};
   for (pop of f.base.get_pops()) {
    const key = #to_string(pop.id); if (#is_defined(pop_ids[key])) { throw Error('Duplicate starvation citizen'); } pop_ids[key] = true;
    if (pop.get_type() == 'WORKER') { workers++; } else if (pop.get_type() == 'DOCTOR') { doctors++; } else { throw Error('Unexpected starvation specialist'); }
    if (pop.has('worked_tile') && pop.get('worked_tile').get('working_pop') != pop) { throw Error('Broken starvation worker link'); }
   }
   #print('STARVE_BASE|' + #to_string(f.base.get_size()) + '|' + #to_string(workers) + '|' + #to_string(doctors) + '|' + #to_string(#sizeof(f.base.get_worked_tiles())) + '|' + #to_string(owned));
   if (#sizeof(origin.get_units()) != 2 || #sizeof(f.native.inspect().unit_ids) != 2) { throw Error('Starvation changed unit membership'); }
   let i = 0;
   for (role of ['scout', 'former']) {
    if (!f.game.um.has_unit(original_ids[i])) { throw Error('Missing starvation companion'); }
    const unit = f.game.um.get_unit(original_ids[i]);
    if (unit != f.units[i] || unit.owner != owner || unit.get_tile() != origin || unit.health != 1.0 || unit.def != (i == 0 ? 'ScoutPatrol' : 'Formers')) { throw Error('Starvation changed companion identity/position/health'); }
    const order = unit.get_order(); let code = (0 - 1); if (order == 'NO_ORDERS') { code = 0; } if (order == 'SENTRY') { code = 1; } if (order == 'HOLD') { code = 2; }
    if (code < 0) { throw Error('Unexpected starvation companion order'); }
    #print('STARVE_UNIT|' + role + '|' + #to_string(code) + '|' + #to_string(#round((1.0 - unit.movement) * 3.0))); i++;
   }
   if (context == 'notice') {
    #print('STARVE_NAME|' + base_name);
    #print('STARVE_CAPTION|' + visible(notice.header));
    for (node of notice.texts) { #print('STARVE_BODY|' + visible(node)); }
    for (node of notice.rows) { #print('STARVE_CHOICE|' + visible(node)); }
    if (notice.rows[notice.selected].border != 'rgb(120,164,212),2') { throw Error('Starvation highlight disagrees'); }
    #print('STARVE_SELECTED|' + #to_string(notice.selected));
    #print('STARVE_BUTTON|' + visible(notice.suppress)); #print('STARVE_BUTTON|' + visible(notice.ok));
   }
   #print('STARVE_STATE_DONE');
  };
  observe(0); let index = 1;
  for (action of input.actions) {
   f.control(action);
   observe(index); index++;
  }
  #print('STARVE_CASE_DONE');
 } catch { : (error) => { #print('STARVE_ERROR|' + #to_string(error)); } }
 if (f != null) { f.view.root.remove(); }
};
for (input of starvation_inputs) { run(input); }
