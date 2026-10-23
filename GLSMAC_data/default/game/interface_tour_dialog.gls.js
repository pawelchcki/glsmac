// Mandatory interface topics only. Terrain demonstrations require a separate
// observed terrain contract; no generated tile or example is invented here.
const parser = #include('opening_dialog');
const pages = ['TOUR1', 'TOUR2', 'TOURMENU', 'TOURCOMMLINK', 'TOURUNITSINFO', 'TOURTERRAININFO', 'TOURSTACKINFO', 'TOURMESSAGEINFO', 'TOURBUTTONMESSAGE', 'TOURBUTTONINFO', 'TOURWORLDINFO', 'TOURDATEINFO', 'TOUROVER'];
return {
	load: (glsmac, game, base) => {
		let unit_name = null;
		for (unit of base.get_tile().get_units()) { if (unit.owner == game.get_player().id && unit_name == null) { unit_name = unit.get_def().name + ''; } }
		if (unit_name == null) { throw Error('Interface tour needs a live owned unit'); }
		const fields = {}; fields['$UNITNAME0'] = unit_name;
		const document = glsmac.load_smac_text('tutor.txt', 'dialogs'); const result = {};
		result.pages = [];
		for (id of pages) { const page = {id: id}; page.definition = parser.parse(document, id, fields); result.pages :+ page; }
		const labels = [];
		for (record of glsmac.load_smac_text('labels.txt', 'dialogs').dialog('LABELS').records) { if (record.kind == 'text') { labels :+ record.text; } }
		if (#sizeof(labels) < 630) { throw Error('Missing installed Tour or Commlink labels'); }
		result.close = labels[220] + ''; result.end = labels[236] + ''; result.next = labels[237] + ''; result.no_contacts = labels[629] + '';
		for (label of [result.close, result.end, result.next, result.no_contacts]) { if (#trim(label) == '') { throw Error('Empty installed Tour label'); } }
		return result;
	},
};
