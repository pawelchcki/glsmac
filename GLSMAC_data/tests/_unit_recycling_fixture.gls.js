// Public declared native layout and actual mounted controls only. The city
// context, source block, dialog choices and mineral effects remain production.
const prepare = #include('./_unit_disband_fixture');
return (input) => {
	const f = prepare(input); const scout = f.units[0];
	if (scout.get_tile() != f.base.get_tile() || scout.owner != f.base.get_owner().id ||
		scout.movement != 1.0 || scout.health != 1.0 || scout.get_order() != 'NO_ORDERS' || f.native.selected_id() != scout.id) {
		throw Error('Incorrect declared ready native city Scout preparation');
	}
	const contains = (node, target) => {
		if (node == target) { return true; }
		for (child of node.children) { if (!child.is_removed() && child.is_visible() && contains(child, target)) { return true; } }
		return false;
	};
	f.dialog = () => {
		let frame = null;
		for (node of f.view.live('window')) {
			if (node.is_visible()) { if (frame != null) { throw Error('Ambiguous actual recycling dialog'); } frame = node; }
		}
		if (frame == null) { return null; }
		const texts = []; const buttons = []; const lists = [];
		for (node of f.view.nodes) {
			if (!node.is_removed() && node.is_visible() && contains(frame, node)) {
				if (node.kind == 'text') { texts :+ node; }
				if (node.kind == 'button') { buttons :+ node; }
				if (node.kind == 'choicelist') { lists :+ node; }
			}
		}
		// Observe the two existing production choice representations. Both
		// require actual selected native/UI state; no default index is filled in.
		const choices = []; let selected = null; let ok = null;
		if (#sizeof(lists) == 1 && #sizeof(buttons) == 1) {
			const list = lists[0]; let index = 0;
			if (!#is_defined(list.items) || !#is_defined(list.value)) { throw Error('Missing actual recycling choice state'); }
			for (item of list.items) { choices :+ item[1]; if (item[0] == list.value) { if (selected != null) { throw Error('Ambiguous actual recycling selection'); } selected = index; } index++; }
			ok = buttons[0];
		} else if (#sizeof(lists) == 0 && (#sizeof(buttons) == 3 || #sizeof(buttons) == 4)) {
			for (let index = 0; index < #sizeof(buttons) - 1; index++) {
				const row = buttons[index]; choices :+ row.text;
				let active = row.active;
				if (#is_defined(row.class)) { for (name of #split(row.class, ' ')) { if (name == 'popup-choice-active') { active = true; } } }
				if (active) { if (selected != null) { throw Error('Ambiguous actual recycling choice highlight'); } selected = index; }
			}
			const ok_index = #sizeof(buttons) - 1; ok = buttons[ok_index];
		} else { throw Error('Unsupported actual recycling controls'); }
		if (#sizeof(texts) != 2 || (#sizeof(choices) != 2 && #sizeof(choices) != 3) || selected == null) { throw Error('Incomplete actual recycling dialog'); }
		const result = {caption: texts[0].text, body: texts[1].text, choices: choices, selected: selected};
		result.frame = frame; result.ok = ok; return result;
	};
	return f;
};
