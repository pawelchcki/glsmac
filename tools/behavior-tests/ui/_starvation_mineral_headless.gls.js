const fixture = #include('./_starvation_mineral_fixture');
for (input of mineral_inputs) {
 #print('MINERAL_CASE|' + input.id); let f = null;
 try {
  f = fixture(input); const base = f.base; const origin = base.get_tile(); const base_id = base.id + 0; const base_name = base.name + '';
  const roles = input.mode == 'starvation' ? ['scout', 'former'] : ['scout', 'former', 'colony'];
  const defs = ['ScoutPatrol', 'Formers', 'ColonyPod'];
  const observe = (stage) => {
   if (#sizeof(f.game.bm.get_bases()) != 1 || base.id != base_id || base.name != base_name || base.get_owner().id != f.native.owner.id || base.get_tile() != origin || origin.get_base() != base) { throw Error('Changed city identity/ownership/position'); }
   if (stage == 'notice') { if (!f.popup.is_shown() || f.popup.popup.id != 'starvation' || !base.has('pending_starvation')) { throw Error('Missing pending native notice'); } }
   else { if (f.popup.is_shown() || base.has('pending_starvation') || f.context().screen != 'map' || f.turn_button.text != 'TURN COMPLETE') { throw Error('Map continuation is incomplete'); } }
   const production = base.get_production(); if (production.choice_id != 'STARVATION_FORMERS' || production.minerals >= 1000) { throw Error('Declared project completed or changed'); }
   let workers = 0; let doctors = 0;
   for (pop of base.get_pops()) {
    if (pop.get_type() == 'WORKER') { workers++; } else if (pop.get_type() == 'DOCTOR') { doctors++; } else { throw Error('Unexpected citizen type'); }
    if (pop.has('worked_tile') && pop.get('worked_tile').get('working_pop') != pop) { throw Error('Broken reciprocal worker link'); }
   }
   #print('MINERAL_STATE|' + stage + '|' + #to_string(f.game.get_year() - f.initial_year) + '|' + #to_string(base.get_size()) + '|' + #to_string(workers) + '|' + #to_string(doctors) + '|' + #to_string(#sizeof(base.get_worked_tiles())) + '|' + #to_string(production.minerals));
   if (#sizeof(origin.get_units()) != #sizeof(roles) || #sizeof(f.native.inspect().unit_ids) != #sizeof(roles)) { throw Error('Changed unit membership'); }
   let i = 0;
   for (role of roles) {
    const unit = f.units[i];
    if (!f.game.um.has_unit(unit.id) || f.game.um.get_unit(unit.id) != unit || unit.def != defs[i] || unit.owner != f.native.owner.id || unit.get_tile() != origin || unit.health != 1.0) { throw Error('Changed companion identity/state'); }
    let code = (0 - 1); const order = unit.get_order(); if (order == 'NO_ORDERS') { code = 0; } if (order == 'SENTRY') { code = 1; } if (order == 'HOLD') { code = 2; }
    if (code < 0) { throw Error('Unexpected companion order'); }
    #print('MINERAL_UNIT|' + role + '|' + #to_string(code) + '|' + #to_string(#round((1.0 - unit.movement) * 3.0))); i++;
   }
   #print('MINERAL_STATE_DONE');
  };
  observe('before-turn'); f.turn();
  if (input.mode == 'starvation') { observe('notice'); f.proceed(); }
  observe('after-turn'); #print('MINERAL_CASE_DONE');
 } catch { : (error) => { #print('MINERAL_ERROR|' + #to_string(error)); } }
 if (f != null) { f.view.root.remove(); }
}
