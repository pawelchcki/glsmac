// Read actual native orders and shared selection state after production controls.
const fixture = #include('./_unit_sentry_fixture');
const run_case = (input) => {
	#print('SENTRY_CASE|' + input.id); let f = null;
	try {
		f = fixture(input.profile); const initial = f.game.get_turn();
		const origin = f.units[0].get_tile(); const owner = f.units[0].owner;
		const ids = {scout: f.units[0].id + 0, former: f.units[1].id + 0, colony: f.units[2].id + 0};
		const definitions = {scout: 'ScoutPatrol', former: 'Formers', colony: 'ColonyPod'};
		const role_of = (id) => {
			if (id == null) { return 'none'; }
			for (role of ['scout', 'former', 'colony']) { if (ids[role] == id) { return role; } }
			throw Error('Sentry selection returned an unknown native identity');
		};
		const observe = (index) => {
			if (#sizeof(origin.get_units()) != 3) { throw Error('Sentry fixture must retain exactly three stacked native units'); }
			#print('SENTRY_STATE|' + #to_string(index) + '|' + #to_string(f.game.get_turn() - initial) + '|' + role_of(f.selected_id()));
			for (role of ['scout', 'former', 'colony']) {
				const unit = f.game.um.get_unit(ids[role]); const tile = unit.get_tile();
				if (unit.def != definitions[role] || unit.owner != owner || unit.health != 1.0 || tile.x != origin.x || tile.y != origin.y) { throw Error('Sentry native fixture identity, health or position changed'); }
				const order = unit.get_order(); let code = (0 - 1);
				if (order == 'NO_ORDERS') { code = 0; }
				if (order == 'SENTRY') { code = 1; }
				if (order == 'HOLD') { code = 2; }
				if (code < 0) { throw Error('Unexpected native Sentry order'); }
				#print('SENTRY_UNIT|' + role + '|' + #to_string(code) + '|' + #to_string(#round((1.0 - unit.movement) * 3.0)));
			}
			#print('SENTRY_STATE_DONE');
		};
		observe(0); let index = 1;
		for (action of input.actions) { f.action(action); observe(index); index++; }
		f.view.root.remove(); f = null; #print('SENTRY_CASE_DONE');
	} catch { : (error) => {
		if (f != null) { f.view.root.remove(); }
		#print('SENTRY_ERROR|' + #to_string(error));
	} }
};
for (input of sentry_inputs) { run_case(input); }
