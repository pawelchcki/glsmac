// Import only the declared UI header records and verified editor definitions.
// Faction mechanics and formatted prose are outside this consumer.
const catalog = #include('../factions').source_catalog();
const plain = (value) => {
	if (#typeof(value) != 'String' || #trim(value) == '') { throw Error('Empty SMAC faction setup text'); }
	for (marker of ['^', '|', '$', '{', '}']) {
		if (#sizeof(#split(value, marker)) != 1) { throw Error('Unsupported SMAC faction setup formatting'); }
	}
	return value + '';
};
const editor = (document, id, fields, button_required) => {
	const block = document.dialog(id); let caption = null; let button = null; let itemlist = false; const labels = [];
	for (record of block.records) {
		switch (record.kind) {
			case 'blank': { break; }
			case 'comment': { break; }
			case 'text': { if (!itemlist) { throw Error('Unexpected SMAC editor text'); } labels :+ plain(record.text); break; }
			case 'directive': {
				switch (record.name) {
					case 'caption': { if (caption != null) { throw Error('Duplicate SMAC editor caption'); } caption = plain(record.argument); break; }
					case 'button': { if (button != null) { throw Error('Duplicate SMAC editor button'); } button = plain(record.argument); break; }
					case 'itemlist': { if (itemlist || record.argument != '') { throw Error('Invalid SMAC editor itemlist'); } itemlist = true; break; }
					case 'xs': { break; }
					case 'x': { break; }
					case 'y': { break; }
					default: { throw Error('Unsupported SMAC editor directive: ' + record.name); }
				}
				break;
			}
			default: { throw Error('Unsupported SMAC editor record'); }
		}
	}
	if (caption == null || #sizeof(labels) != fields || (button_required && button == null)) { throw Error('Incomplete SMAC editor definition'); }
	const result = {caption: caption, button: button};
	if (fields == 1) { result.label = labels[0] + ''; }
	return result;
};
return (glsmac, rules, common) => {
	const rows = [];
	for (record of glsmac.load_smac_text('labels.txt', 'dialogs').dialog('LABELS').records) {
		if (record.kind == 'text') { rows :+ record.text; }
		else if (record.kind != 'blank' && record.kind != 'comment') { throw Error('Unsupported directive in SMAC faction labels'); }
	}
	if (#sizeof(rows) < 1124) { throw Error('Incomplete SMAC faction labels'); }
	const count_text = #trim(rows[0]); let count = -1;
	try { count = #to_int(count_text); } catch { : (e) => { throw Error('Invalid SMAC faction label count'); } }
	if (#to_string(count) != count_text || count != #sizeof(rows) - 1) { throw Error('Invalid SMAC faction label count'); }
	const label = (ordinal) => {
		const index = ordinal + 1;
		return plain(rows[index]);
	};
	const genders = [label(738), label(739)];
	const setup = {factions: [], base: [], expansion: [], labels: [], name: []};
	setup.caption = label(1114); setup.presets = [label(1115), label(1116)];
	setup.modes = [label(1120), label(1121)]; setup.random = label(1122);
	setup.buttons = [label(687), label(1118), label(101), label(102)];
	for (ordinal of [174, 175, 176, 177, 483, 484, 485]) { setup.labels :+ label(ordinal); }
	setup.genders = genders;
	setup.name = [editor(common, 'NAME', 1, true), editor(common, 'NAME2', 1, true)];
	setup.customize = editor(common, 'CUSTOMNAMES', 0, true);
	const imported = {};
	for (group of [['FACTIONS', 'base'], ['NEWFACTIONS', 'expansion']]) {
		const roster = rules.rows(group[0]);
		if (#sizeof(roster) != 7) { throw Error('SMAC faction roster must have seven entries'); }
		for (record of roster) {
			if (#sizeof(record) != 2) { throw Error('Invalid SMAC faction roster record'); }
			const filename = #lowercase(plain(record[0])); const block = #uppercase(plain(record[1]));
			let id = null;
			for (entry of catalog) { if (entry.file == filename && entry.block == block) { id = entry.id; } }
			if (id == null || #is_defined(imported[id])) { throw Error('Unknown or duplicate SMAC faction roster record'); }
			const header = glsmac.load_smac_text(filename + '.txt', 'dialogs').rows(block);
			if (#sizeof(header) < 7 || #sizeof(header[0]) < 7 || #sizeof(header[4]) < 1 || #sizeof(header[6]) < 2) { throw Error('Incomplete SMAC faction header'); }
			const leader_gender = #uppercase(header[0][6]);
			if (leader_gender != 'M' && leader_gender != 'F') { throw Error('Unsupported SMAC faction leader gender'); }
			const values = [plain(header[0][5]), plain(header[0][0]), plain(header[0][2]), plain(header[4][0]), plain(header[6][0]), plain(header[6][1]), genders[leader_gender == 'M' ? 0 : 1] + ''];
			setup.factions :+ {id: id, role: plain(header[0][1]), leader_gender: leader_gender, values: values};
			const target = group[1]; setup[target] :+ id; imported[id] = true;
		}
	}
	if (#sizeof(rules.rows('CUSTOMFACTIONS')) != 0) { throw Error('Custom faction roster imports are not implemented'); }
	return setup;
};
