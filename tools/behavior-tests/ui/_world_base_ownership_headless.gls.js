// Production participant initialization and world startup. No player roster or
// expected owner counts are supplied by this probe. Terrain/artwork are inputs.
const factions = #include('../default/factions');
const sources = #include('./_startup_faction_sources_fixture')({});
const rules = #include('./_startup_unit_rules_fixture').parse();
const unit_rules = #include('../default/game/unit_rules');
const f = test.world_startup_fixture(world_input.world_width, world_input.world_height);
const game = f.game;
test.assert(#sizeof(game.get_players()) == 0, 'Startup fixture has no seeded players');
test.assert(#sizeof(game.bm.get_bases()) == 0, 'Startup fixture has no seeded bases');
const fm = {
	add: (id, data) => { f.fm.add(id, data); },
	import_colors: (name) => { return f.colors; },
	import_base_names: (name) => { return {land: ['Synthetic City'], water: ['Synthetic Port']}; },
};
factions.configure(fm, sources.glsmac);
const human = f.initialize_single_player('GAIANS');
test.assert(human.get_faction().id == 'GAIANS', 'Production initializer retains selected faction');
test.assert(game.tm.get_map_width() == world_input.world_width && game.tm.get_map_height() == world_input.world_height,
	'Fixture uses actual grid extents, without setup-field conversion');
const receipts = {failed: false, count: 0};
game.on('event_result', (e) => {
	receipts.count = receipts.count + 1;
	if (!e.success) { receipts.failed = true; }
});
#include('../default/game/events')(game);
#include('../default/game/pops').define(game);
#include('../default/game/facilities').define(game);
#include('../default/units/defs').define(game, rules);
game.set('starting_unit_rules', unit_rules.materialize(game.um, rules));
f.process_events();
test.assert(!receipts.failed, 'Native startup definitions were accepted');
#include('../default/game/world/default')(game);
f.process_events();
test.assert(!receipts.failed, 'Native world startup events were accepted');

// The first human city's declared Doctor/stores and stacked companions are
// input controls, independent of how many other owners startup creates.
let human_base = null;
for (base of game.bm.get_bases()) {
	if (base.get_owner().id == human.id) {
		test.assert(human_base == null, 'Controlled first-city input requires one human city');
		human_base = base;
	}
}
test.assert(human_base != null, 'Production startup created the human city');
for (type of ['Formers', 'ColonyPod']) {
	game.event('spawn_unit', {owner: human, tile: human_base.get_tile(), type: type, health: 1.0, morale: 2});
}
f.process_events();
test.assert(!receipts.failed && receipts.count > 0, 'All native startup/fixture commands completed');
f.with_write(() => {
	human_base.create_pop({type: 'DOCTOR'});
	human_base.set('accumulated_nutrients', world_input.initial_human_base.nutrients);
	const production = human_base.get_production();
	human_base.restore_production({choice_id: production.choice_id, minerals: world_input.initial_human_base.minerals,
		last_processed_turn: 0}, '');
});
test.assert(human_base.get_size() == world_input.initial_human_base.doctors,
	'Declared human city population reached actual native storage');
test.assert(#sizeof(human_base.get_worked_tiles()) == world_input.initial_human_base.worked_tiles,
	'Declared human city has no worked squares');

#print('WORLD_CASE|' + world_case_id);
for (player of game.get_players()) {
	#print('WORLD_PLAYER|' + #to_string(player.id) + '|' + player.type);
}
for (base of game.bm.get_bases()) {
	#print('WORLD_BASE|' + #to_string(base.id) + '|' + #to_string(base.get_owner().id));
}
#print('WORLD_END');
