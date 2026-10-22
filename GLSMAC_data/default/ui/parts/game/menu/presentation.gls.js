// Bounded menu presentation transferred from independently recorded controls.
// These ranges identify installed-source action slots and their visual groups;
// wording always comes from that source. They do not establish row effects or
// explain conditional omissions in game contexts that have not been observed.
const groups = {
	GAME: [[1, 1], [2, 7], [8, 9], [10, 12]],
	HQ: [[0, 1], [3, 3], [4, 6], [7, 10], [11, 14]],
	NETWORK: [[0, 4], [5, 5], [6, 7]],
	MAP: [[1, 1], [2, 7], [8, 12], [13, 17], [18, 20]],
	ACTION: [[0, 1], [2, 9], [10, 12], [15, 19], [20, 25], [26, 30]],
	SCENARIO: [[0, 1], [2, 5], [6, 9], [10, 14], [15, 19], [20, 23], [24, 27]],
	EDITOR: [[0, 1], [2, 8], [9, 11], [12, 15], [16, 19], [20, 23], [24, 27], [28, 28]],
	HELP: [[0, 2], [3, 5], [6, 7], [8, 13], [14, 19], [20, 21]],
};
const omitted = {ACTION: [3, 4, 5, 6, 7, 18, 22, 24]};

const append_groups = (result, items, ranges, exclusions) => {
	for (group of ranges) {
		if (#sizeof(result) != 0) { result :+ {separator: true}; }
		for (let index = group[0]; index <= group[1]; index++) {
			if (index >= #sizeof(items)) { throw Error('Missing installed in-game source slot'); }
			let include = true;
			for (excluded of exclusions) { if (excluded == index) { include = false; } }
			if (include) { result :+ items[index]; }
		}
	}
};

return (id, source, terrain) => {
	const items = [];
	for (entry of source) {
		if (#is_defined(entry.separator)) { continue; }
		// A text tone is presentation, not an implemented enabled-state rule.
		entry.dark = id == 'TERRAFORM' || id == 'EDITOR' || (id == 'SCENARIO' && entry.source_index != 0);
		// These observed land-unit projections use source identities only.
		// The Colony Pod has its own leading group; both support units omit
		// the same additional slots without changing any command bindings.
		entry.omit_for_former = id == 'ACTION' && (entry.source_index == 2 || entry.source_index == 8 || entry.source_index == 25);
		entry.omit_for_colony = entry.omit_for_former;
		entry.only_for_colony = id == 'ACTION' && (entry.source_index == 0 || entry.source_index == 1);
		entry.only_for_free_colony = id == 'ACTION' && entry.source_index == 0;
		entry.only_for_base_colony = id == 'ACTION' && entry.source_index == 1;
		items :+ entry;
	}
	const result = [];
	if (id == 'TERRAFORM') {
		append_groups(result, terrain, [[0, 4], [5, 11], [12, 14], [15, 18]], []);
		append_groups(result, items, [[0, 1], [2, 3], [4, 9]], []);
	} else {
		if (!#is_defined(groups[id])) { throw Error('Unsupported in-game source presentation: ' + id); }
		const exclusions = #is_defined(omitted[id]) ? omitted[id] : [];
		append_groups(result, items, groups[id], exclusions);
	}
	return result;
};
