// Actual native units/players/map with controlled animation delivery and RNG
// inputs. No native unit manager, serialization or combat policy is replaced.
const mocks = #include('./_gameplay_mocks');
const spawn = #include('../default/game/event/spawn_unit');
const despawn = #include('../default/game/event/despawn_unit');

const unit_state = (f, id) => {
	const unit = f.game.um.get_unit(id); const tile = unit.get_tile();
	return {id: unit.id + 0, def: unit.def, owner: unit.owner + 0,
		x: tile.x + 0, y: tile.y + 0, morale: unit.morale + 0,
		health: unit.health + 0.0, movement: unit.movement + 0.0,
		moved: unit.moved_this_turn == true, order: unit.get_order(),
		work: unit.get_terraforming(), home: unit.get_terraform_home(),
		plan: unit.get_automation(), recovery: unit.get_terraforming_recovery()};
};
const context = (f) => {
	const players = [];
	for (player of f.game.get_players()) {
		const row = {id: player.id + 0, completed: f.game.is_turn_complete(player.id),
			energy: player.get_energy_state(), research: f.game.get_research_state(player.id),
			science: f.game.get_research_science(player.id)};
		players :+ row;
	}
	return {players: players, terrain: f.terrain_snapshot(), turn: f.game.get_turn() + 0,
		rng: f.inspect().rng, next_unit_id: f.inspect().next_unit_id, ids: f.next_ids()};
};
const bystanders = (f, attacker_id, defender_id) => {
	const units = [];
	for (id of f.inspect().unit_ids) {
		if (id != attacker_id && id != defender_id) { units :+ unit_state(f, id); }
	}
	return units;
};
const tile_membership = (f) => {
	const result = [];
	for (y of [0, 1, 2, 3]) {
		for (let x = y % 2; x < 4; x += 2) {
			const ids = [];
			for (unit of f.tile_at(x, y).get_units()) { ids :+ unit.id + 0; }
			result :+ {x: x, y: y, ids: ids};
		}
	}
	return result;
};
const create = () => {
	const f = test.founding_fixture(); f.enable_economy();
	let attacker = null; let defender = null;
	f.with_write(() => {
		attacker = f.game.um.spawn_unit({def: 'Scout', owner: f.owner, tile: f.tile_at(0, 0), morale: 3, health: 0.5});
		defender = f.game.um.spawn_unit({def: 'Scout', owner: f.game.get_player(0), tile: f.tile_at(2, 0), morale: 6, health: 0.25});
		attacker.movement = 2.5; attacker.moved_this_turn = true;
		defender.movement = 0.75; defender.moved_this_turn = false;
	});
	f.add_scout(0); f.add_scout(1);
	const result = {attacker_id: attacker.id + 0, defender_id: defender.id + 0};
	result.f = f;
	return result;
};
const event = (fixture, draws) => {
	const f = fixture.f;
	const state = {animations: [], stopped: [], events: []};
	const game = {};
	game.um = f.game.um; game.tm = f.game.tm;
	game.get_player = (id) => { return f.game.get_player(id); };
	game.get_tm = () => { return f.game.tm; };
	game.random = mocks.random(draws);
	game.am = {
		show_animations: (animations) => { state.animations = animations; return 71; },
		stop_animations: (id) => { state.stopped :+ id; },
	};
	game.event = (name, data) => {
		const child = {caller: 0}; child.game = game; child.data = data;
		if (name == 'spawn_unit') { child.applied = spawn.apply(child); }
		else {
			test.assert(name == 'despawn_unit', 'Only the declared casualty lifecycle events are supplied');
			child.applied = despawn.apply(child);
		}
		state.events :+ name;
	};
	const e = {caller: 1, data: {}};
	e.game = game;
	e.data.attacker = f.game.um.get_unit(fixture.attacker_id);
	e.data.defender = f.game.um.get_unit(fixture.defender_id);
	const result = {}; result.event = e; result.state = state;
	return result;
};
return {create: create, event: event, context: context, bystanders: bystanders,
	unit_state: unit_state, tile_membership: tile_membership};
