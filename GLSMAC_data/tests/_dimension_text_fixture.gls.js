// Synthetic source inputs, not original text files or expected dialog outputs.
// The native preset dimensions declare the pinned source profile's context.
const world_source = '#WORLDSIZE\n5\nChoice Zero,24,48\nChoice One,32,64\nChoice Two,40,80\nChoice Three,44,90\nChoice Four,64,128\n#END\n';
const dialogs = '#TOPMENU\n#itemlist\nStart Game\nQuick Start\nScenario\nLoad Game\nMultiplayer\nView Credits\nExit Game\n#MAPMENU\n#itemlist\nMake Random Map\nCustomize Random Map\nThe Map of Planet\nHuge Map of Planet\nLoad Map File\n#SCENARIOMENU\n#caption Scenario\n#itemlist\nPlay Scenario\nCreate Scenario\nLoad Map File\nEdit Scenario\n#END\n';
const label_cache = {};
let installed_default = null;
const label_source = (alternate) => {
	const key = alternate ? 'alternate' : 'default';
	if (!#is_defined(label_cache[key])) {
		let labels = '#LABELS\n1131\n';
		for (let index = 0; index < 1131; index++) {
			let label = 'Synthetic text ' + #to_string(index);
			if (index == 1089) { label = 'Custom Size'; }
			if (index == 1090) { label = alternate ? 'Meridian' : 'Horizontal'; }
			if (index == 1091) { label = alternate ? 'Parallel' : 'Vertical'; }
			labels = labels + label + '\n';
		}
		label_cache[key] = labels + '#END\n';
	}
	return label_cache[key];
};

const create = (profile, world) => {
		const alternate = profile == 'alternate' || profile == 'both';
		const f = {}; f.sources = {}; f.loads = []; f.glsmac = {};
		f.sources['alphax.txt'] = world;
		f.sources['menu.txt'] = '#GAME\nSynthetic game menu\nUnknown command|Ctrl+U\n#END\n';
		let expansion_caption = 'Custom Map Size';
		if (profile == 'alternate') { expansion_caption = 'Alternate Dimensions'; }
		if (profile == 'both') { expansion_caption = 'Expansion Dimensions'; }
		f.sources['xscript.txt'] = dialogs + '#CUSTOMMAP\n#xs 440\n#x -5\n#y -5\n#caption ' + expansion_caption + '\n#END\n';
		f.sources['script.txt'] = '#CUSTOMMAP\n#xs 440\n#x -5\n#y -5\n#caption ' + (profile == 'core' || profile == 'both' ? 'Core Dimensions' : 'Custom Map Size') + '\n#END\n';
		f.sources['labels.txt'] = label_source(alternate);
		f.glsmac.load_smac_text = (name, format) => {
			f.loads :+ [name, format];
			if (!#is_defined(f.sources[name])) { throw Error('Missing synthetic source: ' + name); }
			return test.parse_smac_text(f.sources[name], format);
		};
		f.reload = () => { f.bundle = #include('../default/smac_data')(f.glsmac); return f.bundle; };
		f.reload();
		return f;
	};
return {
	world_source: world_source,
	static_dialogs: dialogs,
	create: create,
	install: (i) => {
		const get_bundle = () => {
			// These action-only fixtures share immutable source inputs, like one
			// production menu controller. Source-failure tests use create() directly.
			if (installed_default == null) { installed_default = create('default', world_source); }
			return installed_default.bundle;
		};
		i.smac_data = {
			dimension_dialog: () => { const bundle = get_bundle(); return bundle.dimension_dialog(); },
			apply_dialog: (id, menu) => { const bundle = get_bundle(); return bundle.apply_dialog(id, menu); },
		};
	},
};
