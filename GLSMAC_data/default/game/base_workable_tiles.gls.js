// The shipped base production radius, shared by normal base mechanics and
// native automation acceptance fixtures. No second radius formula is supplied.
return (base) => {
	let result = [];
	const t_center = base.get_tile();
	let added_tiles = {};
	const f_add = (tile) => {
		const key = #to_string(tile.x) + '_' + #to_string(tile.y);
		if (tile != t_center && !#is_defined(added_tiles[key])) {
			added_tiles[key] = true;
			result :+tile;
		}
		return tile;
	};
	const t_n = f_add(t_center.get_N());
	const t_ne = f_add(t_center.get_NE());
	const t_e = f_add(t_center.get_E());
	const t_se = f_add(t_center.get_SE());
	const t_s = f_add(t_center.get_S());
	const t_sw = f_add(t_center.get_SW());
	const t_w = f_add(t_center.get_W());
	const t_nw = f_add(t_center.get_NW());
	const t_n_nw = f_add(t_n.get_NW());
	const t_n_ne = f_add(t_n.get_NE());
	const t_ne_ne = f_add(t_ne.get_NE());
	const t_e_ne = f_add(t_e.get_NE());
	const t_e_se = f_add(t_e.get_SE());
	const t_se_se = f_add(t_se.get_SE());
	const t_s_se = f_add(t_s.get_SE());
	const t_s_sw = f_add(t_s.get_SW());
	const t_sw_sw = f_add(t_sw.get_SW());
	const t_w_sw = f_add(t_w.get_SW());
	const t_w_nw = f_add(t_w.get_NW());
	const t_nw_nw = f_add(t_nw.get_NW());
	return result;
};
