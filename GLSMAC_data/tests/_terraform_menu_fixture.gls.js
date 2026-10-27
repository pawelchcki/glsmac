// Native state, production UI and actual menu clicks. Only declared setup,
// display nodes, frontend notifications and event-loop delivery are supplied.
const mounted_menu = #include('./_unit_menu_orders_fixture');
const terrain_rules = #include('../default/game/terraforming_rules');
const work = #include('../default/game/terraforming');
return (input) => {
	if (input.profile != 'spread') { throw Error('Terraform menu requires the declared spread layout'); }
	const f = mounted_menu('synthetic', input);
	// These immutable original-context cases exercise the actual product's
	// explicit respect-technology mode, rather than normal play's new waiver.
	f.game.get_settings().global.rules.set_terraforming_ignore_technologies(false);
	if (f.game.get_settings().global.rules.get_terraforming_policy().ignore_technologies) { throw Error('Respect-technology context was not applied'); }
	f.former = f.units[1];
	// The spread fixture has a real city at (2,2), Scout at (2,2), Former at
	// (3,3) and Colony Pod at (1,3). Configure only the declared work terrain.
	f.native.configure_unit(f.former.id, 'arid');
	const former_tile = f.former.get_tile();
	if (!former_tile.is_land || former_tile.moisture != 1 || former_tile.rockiness != 1 || former_tile.features.xenofungus ||
		former_tile.get_base() != null || f.former.health != 1.0 || f.former.movement != 1.0 || f.former.get_order() != 'NO_ORDERS') {
		throw Error('Native Former does not satisfy the declared healthy arid non-base setup');
	}
	let document = null;
	for (source of input.sources) {
		if (source.name == 'alphax.txt') {
			if (document != null) { throw Error('Duplicate declared TERRAIN source'); }
			document = test.parse_smac_text(source.source, 'rules');
		}
	}
	if (document == null || #sizeof(document.rows('TERRAIN')) != 20) { throw Error('Terraform menu requires twenty TERRAIN input rows'); }
	f.game.set('terraforming_rules', terrain_rules.parse(document));
	work.configure(f.game);
	// The declared spread preparation reaches Former through one real Tab
	// from ready Scout. Keep that navigation history in the native controller.
	f.tab();
	if (f.native.selected_id() != f.former.id) { throw Error('Declared initial Tab did not select the native Former'); }
	const initial_year = f.game.get_year(); const base = f.base; const base_id = base.id + 0;
	const base_tile = base.get_tile(); const owner = base.get_owner().id + 0;
	const initial_pops = base.get_pops(); const doctor = initial_pops[0]; const doctor_id = doctor.id + 0;
	const initial_production = base.get_production(); const initial_nutrients = base.get('accumulated_nutrients');
	const units = [];
	for (unit of f.units) {
		const record = {id: unit.id + 0, def: unit.def + '', owner: unit.owner + 0,
			health: unit.health + 0.0, movement: unit.movement + 0.0, order: unit.get_order()};
		record.unit = unit; record.tile = unit.get_tile(); units :+ record;
	}
	f.observe = () => {
		if (f.popup.is_shown()) { throw Error('Unexpected modal in bounded Terraform menu trace'); }
		if (#sizeof(f.game.bm.get_bases()) != 1 || base.id != base_id || base.get_owner().id != owner || base.name != input.initial_base.name ||
			base.get_tile() != base_tile || base_tile.get_base() != base || base.get_size() != 1 || #sizeof(base.get_worked_tiles()) != 0 ||
			base.get('accumulated_nutrients') != initial_nutrients || base.get_production() != initial_production) {
			throw Error('Terraform menu changed guarded native city state');
		}
		const current_pops = base.get_pops();
		if (#sizeof(current_pops) != 1 || current_pops[0] != doctor || doctor.id != doctor_id || doctor.get_type() != 'DOCTOR' || doctor.has('worked_tile')) {
			throw Error('Terraform menu changed native citizen identity/job');
		}
		if (#sizeof(f.native.inspect().unit_ids) != 3) { throw Error('Terraform menu changed native unit membership'); }
		for (record of units) {
			if (!f.game.um.has_unit(record.id)) { throw Error('Terraform menu removed a guarded unit'); }
			const unit = f.game.um.get_unit(record.id);
			if (unit != record.unit || unit.def != record.def || unit.owner != record.owner || unit.health != record.health || unit.get_tile() != record.tile) {
				throw Error('Terraform menu changed guarded native unit identity/position');
			}
			if (unit != f.former && (unit.movement != record.movement || unit.get_order() != record.order)) {
				throw Error('Terraform menu changed another unit order/movement');
			}
		}
		const selected = f.native.selected_id(); let selected_role = null;
		if (selected != null) {
			for (let index = 0; index < #sizeof(units); index++) {
				if (units[index].id == selected) { selected_role = ['scout', 'former', 'colony'][index]; }
			}
			if (selected_role == null || f.preview.selected_unit_id != selected || f.menu.selected_unit_id != selected ||
				f.objects.selected_type != 'Unit' || f.objects.selected_id != selected || f.preview.rendered_unit_id != selected) {
				throw Error('Mounted UI selection disagrees with actual native focus');
			}
		} else if (f.preview.selected_unit_id != null || f.menu.selected_unit_id != null || f.objects.selected_type == 'Unit') {
			throw Error('Mounted UI retains a selection without native focus');
		}
		const root = f.menu.menus.left_menu; let child_header = null;
		for (id in f.menu.menus) {
			const current = f.menu.menus[id];
			if (current.el.is_removed() || current.is_open != current.el.is_visible()) { throw Error('Actual menu visibility disagrees'); }
			if (id != 'left_menu' && current.is_open) {
				if (!root.is_open || child_header != null) { throw Error('Ambiguous actual menu child'); }
				let index = 0;
				for (header of f.menu.headers) { if (header.id == id) { child_header = index; } index++; }
				if (child_header == null) { throw Error('Unknown actual menu child'); }
			}
		}
		const native_work = f.former.get_terraforming(); const native_order = f.former.get_order(); let order = null;
		if (native_order == 'NO_ORDERS') { order = 'none'; }
		else if (native_order == 'HOLD') { order = 'hold'; }
		else if (native_order == 'TERRAFORM') { order = native_work.action + ''; }
		if (order == null) { throw Error('Unrecognized actual Former order'); }
		const tile = f.former.get_tile(); const flags = f.game.tm.get_terraforming(tile.x, tile.y);
		return {year_delta: f.game.get_year() - initial_year, selected: selected_role, order: order,
			movement_spent: #round((1.0 - f.former.movement) * 3.0), work_units: native_work.work_units + 0,
			terrain: {road: flags.road, farm: flags.farm, mine: flags.mine, forest: flags.forest},
			root_open: root.is_open, child_header: child_header};
	};
	f.click_menu = () => {
		const button = f.view.find('button', 'text', 'MENU');
		if (button.is_removed() || !button.is_visible()) { throw Error('MENU control is not mounted'); }
		button.emit('click', {button: 'left'}); f.flush();
	};
	f.click_header = (index) => {
		const root = f.menu.menus.left_menu;
		if (!root.is_open || root.el.is_removed() || !root.el.is_visible()) { throw Error('Parent menu is not open'); }
		const control = root.items[index];
		if (control.el.is_removed() || !control.el.is_visible()) { throw Error('Header control is not mounted'); }
		control.el.emit('click', {button: 'left'}); f.flush();
	};
	f.terrain_control = (index) => {
		const child = f.menu.menus.left_menu_terraform;
		if (!#is_defined(child) || !child.is_open || child.el.is_removed() || !child.el.is_visible()) { throw Error('Terraform child is not open'); }
		let found = null;
		for (control of child.items) {
			if (#is_defined(control.entry.terrain_index) && control.entry.terrain_index == index) {
				if (found != null) { throw Error('Duplicate actual terrain row identity'); }
				if (control.el.is_removed() || !control.el.is_visible()) { throw Error('Terrain row is not mounted'); }
				found = control;
			}
		}
		if (found == null) { throw Error('Requested terrain row is missing'); }
		return found;
	};
	f.click_terrain = (index) => { f.terrain_control(index).el.emit('click', {button: 'left'}); f.flush(); };
	f.escape = () => {
		let child = null;
		for (id in f.menu.menus) {
			const current = f.menu.menus[id];
			if (id != 'left_menu' && current.is_open) {
				if (child != null) { throw Error('Multiple actual menu children'); }
				child = current;
			}
		}
		if (child == null) { throw Error('Escape requires an actual open child'); }
		child.el.emit('keydown', {code: 'ESCAPE', modifiers: {}}); f.flush();
	};
	return f;
};
