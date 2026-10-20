// Read live production popup context/title, native city/units and selection.
const fixture = #include('./_base_open_fixture');
const run = (input) => {
	#print('BASEOPEN_CASE|' + input.id); let f = null;
	try {
		f = fixture(input); const initial = f.game.get_year(); const origin = f.base.get_tile();
		const owner = f.units[0].owner; const base_id = f.base.id + 0; const base_name = f.base.name + '';
		const base_count = #sizeof(f.game.bm.get_bases());
		const initial_pops = f.base.get_pops(); const doctor = initial_pops[0]; const doctor_id = doctor.id + 0;
		const ids = {scout: f.units[0].id + 0, former: f.units[1].id + 0, colony: f.units[2].id + 0};
		const defs = {scout: 'ScoutPatrol', former: 'Formers', colony: 'ColonyPod'};
		const role_of = (id) => {
			if (id == null) { return 'none'; }
			for (role of ['scout', 'former', 'colony']) { if (ids[role] == id) { return role; } }
			throw Error('Unknown selected base-open identity');
		};
		const observe = (index) => {
			const context = f.context();
			#print('BASEOPEN_STATE|' + #to_string(index) + '|' + #to_string(f.game.get_year() - initial) + '|' + role_of(f.selected_id()) + '|' + context.screen + '|' + #to_string(context.title_matches_base));
			if (#sizeof(f.game.bm.get_bases()) != base_count) { throw Error('Opening changed global base count'); }
			let count = 0;
			for (base of f.game.bm.get_bases()) {
				if (base.get_owner().id != owner) { continue; }
				count++; const tile = base.get_tile();
				if (base != f.base || base.id != base_id || base.name != base_name || tile.x != origin.x || tile.y != origin.y || tile.get_base() != base) { throw Error('Opening replaced/moved existing base'); }
				let workers = 0; let doctors = 0; let original_doctor = false; const pop_ids = {};
				for (pop of base.get_pops()) {
					const key = #to_string(pop.id); if (#is_defined(pop_ids[key])) { throw Error('Duplicate native citizen identity'); } pop_ids[key] = true;
					if (pop.id == doctor_id) { if (pop != doctor || pop.get_type() != 'DOCTOR') { throw Error('Existing Doctor identity/type changed'); } original_doctor = true; }
					if (pop.get_type() == 'WORKER') { workers++; }
					else if (pop.get_type() == 'DOCTOR') { doctors++; }
					else { throw Error('Unexpected base-open specialist'); }
					if (pop.has('worked_tile')) { const worked = pop.get('worked_tile'); if (worked.get('working_pop') != pop) { throw Error('Broken native worker link'); } }
				}
				if (!original_doctor || base.get_size() != workers + doctors) { throw Error('Native citizen identities/size disagree'); }
				const nutrients = base.get('accumulated_nutrients');
				if (#typeof(nutrients) != 'Int') { throw Error('Raw native nutrient counter is not signed integer'); }
				#print('BASEOPEN_BASE|' + #to_string(base.get_size()) + '|' + #to_string(workers) + '|' + #to_string(doctors) + '|' + #to_string(#sizeof(base.get_worked_tiles())) + '|' + #to_string(nutrients) + '|' + #to_string(base.get_production().minerals));
			}
			#print('BASEOPEN_OWNED|' + #to_string(count));
			const found = {}; let surviving = 0;
			for (unit of origin.get_units()) {
				const role = role_of(unit.id);
				if (unit.def != defs[role] || unit.owner != owner || unit.health != 1.0 || #is_defined(found[role])) { throw Error('Changed base-open unit identity/ownership/health'); }
				found[role] = unit.id + 0; surviving++;
			}
			if (#sizeof(f.native.inspect().unit_ids) != surviving) { throw Error('Opening changed global native unit membership'); }
			for (role of ['scout', 'former', 'colony']) {
				if (!#is_defined(found[role])) {
					if (f.game.um.has_unit(ids[role])) { throw Error('Opening moved a live unit out of its declared stack'); }
					continue;
				}
				const unit = f.game.um.get_unit(found[role]); const order = unit.get_order(); let code = (0 - 1);
				if (order == 'NO_ORDERS') { code = 0; }
				if (order == 'SENTRY') { code = 1; }
				if (order == 'HOLD') { code = 2; }
				if (code < 0 || unit.get_tile() != origin) { throw Error('Unexpected base-open unit order/position'); }
				#print('BASEOPEN_UNIT|' + role + '|' + #to_string(code) + '|' + #to_string(#round((1.0 - unit.movement) * 3.0)));
			}
			#print('BASEOPEN_STATE_DONE');
		};
		observe(0); let index = 1;
		for (action of input.actions) { f.action(action); observe(index); index++; }
		f.view.root.remove(); f = null; #print('BASEOPEN_CASE_DONE');
	} catch { : (error) => { if (f != null) { f.view.root.remove(); } #print('BASEOPEN_ERROR|' + #to_string(error)); } }
};
for (input of base_open_inputs) { run(input); }
