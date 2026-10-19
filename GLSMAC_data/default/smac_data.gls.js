// Installed SMACX text definitions. Importing data does not implement commands.
// These three static dialogs decorate only verified existing action slots.
const static_counts = { TOPMENU: 7, MAPMENU: 5, SCENARIOMENU: 4 };

const plain_dimension_text = (text) => {
	if (#trim(text) == '') { throw Error('Empty SMAC dimension text'); }
	for (marker of ['^', '|', '$', '{', '}']) {
		if (#sizeof(#split(text, marker)) != 1) { throw Error('Unsupported formatting in SMAC dimension text'); }
	}
	return text;
};

const dimension_caption = (document) => {
	const block = document.dialog('CUSTOMMAP');
	let caption = #undefined;
	for (record of block.records) {
		switch (record.kind) {
			case 'blank': { break; }
			case 'comment': { break; }
			case 'directive': {
				switch (record.name) {
					case 'caption': {
						if (#is_defined(caption)) { throw Error('Duplicate SMAC dimension caption'); }
						caption = plain_dimension_text(record.argument);
						break;
					}
					case 'xs': { break; }
					case 'x': { break; }
					case 'y': { break; }
					default: { throw Error('Unsupported SMAC dimension directive: ' + record.name); }
				}
				break;
			}
			default: { throw Error('Unsupported body in SMAC dimension caption'); }
		}
	}
	if (!#is_defined(caption)) { throw Error('Missing SMAC dimension caption'); }
	return caption;
};

const dimension_labels = (document) => {
	const block = document.dialog('LABELS');
	const labels = [];
	for (record of block.records) {
		switch (record.kind) {
			case 'blank': { break; }
			case 'comment': { break; }
			case 'text': { labels :+ record.text; break; }
			default: { throw Error('Unsupported directive in SMAC labels'); }
		}
	}
	if (#sizeof(labels) == 0) { throw Error('Missing SMAC label count'); }
	const text = #trim(labels[0]);
	let count = 0;
	try { count = #to_int(text); }
	catch { : (e) => { throw Error('SMAC label count must be a canonical integer'); } }
	if (#to_string(count) != text || count < 1092 || count != #sizeof(labels) - 1) {
		throw Error('Invalid or insufficient SMAC label count');
	}
	// The count record precedes zero-based label ordinals 1090 and 1091.
	return [plain_dimension_text(labels[1091]), plain_dimension_text(labels[1092])];
};

const static_dialog = (document, id, count) => {
	const dialog = document.dialog(id);
	let caption = #undefined;
	let has_caption = false;
	let has_items = false;
	const labels = [];
	for (record of dialog.records) {
		switch (record.kind) {
			case 'blank': { break; }
			case 'comment': { break; }
			case 'directive': {
				switch (record.name) {
					case 'caption': {
						if (has_caption || record.argument == '') { throw Error('Invalid or duplicate caption in SMAC dialog ' + id); }
						has_caption = true; caption = record.argument;
						break;
					}
					case 'itemlist': {
						if (has_items || record.argument != '') { throw Error('Invalid or duplicate itemlist in SMAC dialog ' + id); }
						has_items = true;
						break;
					}
					case 'xs': { break; }
					case 'x': { break; }
					case 'y': { break; }
					default: { throw Error('Unsupported directive in SMAC dialog ' + id + ': ' + record.name); }
				}
				break;
			}
			case 'text': {
				if (!has_items || record.text == '') { throw Error('Unexpected text in SMAC dialog ' + id); }
				labels :+ record.text;
				break;
			}
			default: { throw Error('Unsupported record in SMAC dialog ' + id + ': ' + record.kind); }
		}
	}
	if (!has_items || #sizeof(labels) != count) { throw Error('Wrong static action count in SMAC dialog ' + id); }
	const result = {}; result.labels = labels; result.caption = caption;
	return result;
};

return (glsmac) => {
	// Mainmenu calls this after asset resolution, once per controller. Missing
	// files, blocks, malformed rows and ambiguous IDs propagate as real errors.
	const bundle = {};
	bundle.rules = glsmac.load_smac_text('alphax.txt', 'rules');
	bundle.dialogs = glsmac.load_smac_text('xscript.txt', 'dialogs');
	bundle.menus = glsmac.load_smac_text('menu.txt', 'menus');
	const dialogs = {};
	for (id in static_counts) { dialogs[id] = static_dialog(bundle.dialogs, id, static_counts[id]); }
	bundle.apply_dialog = (id, menu) => {
		if (!#is_defined(dialogs[id])) { throw Error('Unsupported static SMAC dialog: ' + id); }
		const definition = dialogs[id];
		if (#sizeof(menu.entries) != #sizeof(definition.labels)) { throw Error('SMAC dialog/action mismatch: ' + id); }
		let index = 0;
		for (label of definition.labels) { menu.entries[index][0] = label; index = index + 1; }
		menu.title = definition.caption;
	};
	let dimensions = null;
	bundle.dimension_dialog = () => {
		if (dimensions == null) {
			// Original controlled-source observations select the common script's
			// CUSTOMMAP caption, independently of a conflicting expansion block.
			const caption = dimension_caption(glsmac.load_smac_text('script.txt', 'dialogs'));
			const labels = dimension_labels(glsmac.load_smac_text('labels.txt', 'dialogs'));
			dimensions = {caption: caption, horizontal: labels[0], vertical: labels[1]};
		}
		return #clone(dimensions);
	};
	return bundle;
};
