const contains_pop = (base, pop) => {
	for (candidate of base.get_pops()) {
		if (candidate == pop) { return true; }
	}
	return false;
};

const workable_tile = (game, base, tile) => {
	// Resolve membership before reading a caller-supplied native handle.
	let found = false;
	for (candidate of base.get_workable_tiles()) {
		if (candidate == tile) { found = true; break; }
	}
	if (!found) { return false; }
	const tm = game.get_tm();
	const x = tile.x; const y = tile.y;
	if (#typeof(x) != 'Int' || #typeof(y) != 'Int' || x < 0 || y < 0 || x >= tm.get_map_width() || y >= tm.get_map_height() || x % 2 != y % 2) { return false; }
	return tm.get_tile(x, y) == tile && tile != base.get_tile() && tile.get_base() == null;
};

const valid_pop_links = (game, base, pop) => {
	if (!contains_pop(base, pop)) { return false; }
	if (pop.get_base() != base) { return false; }
	const tile = pop.get('worked_tile');
	if (!#is_defined(tile)) {
		for (worked of base.get_worked_tiles()) {
			if (worked.get('working_pop') == pop) { return false; }
		}
		return true;
	}
	return workable_tile(game, base, tile) && base.is_tile_worked(tile) && tile.get('working_pop') == pop;
};

return {
	validate_base: (e) => {
		let found = false;
		for (base of e.game.get_bm().get_bases()) {
			if (base == e.data.base) { found = true; break; }
		}
		if (!found) { return 'Base is not part of this game'; }
		if (e.caller != e.data.base.get_owner().id) { return 'Only base owner can control base pops'; }
	},
	contains_pop: contains_pop,
	workable_tile: workable_tile,
	valid_pop_links: valid_pop_links,
};
