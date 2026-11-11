// Detached application observations for every participant and unit in the
// controlled native fixture. These are not original-game observations.
return (f) => {
	const units = []; const players = [];
	for (id of f.inspect().unit_ids) {
		const unit = f.game.um.get_unit(id); const tile = unit.get_tile();
		const row = {id:unit.id + 0,owner:unit.owner + 0,definition:unit.def,
			x:tile.x + 0,y:tile.y + 0,movement:unit.movement + 0.0,moved:unit.moved_this_turn == true,
			health:unit.health + 0.0,morale:unit.morale + 0,order:unit.get_order()};
		row.work = unit.get_terraforming(); row.plan = unit.get_automation();
		row.home = unit.get_terraform_home(); row.recovery = unit.get_terraforming_recovery();
		units :+ row;
	}
	for (player of f.game.get_players()) {
		const row = {id:player.id + 0,completed:f.game.is_turn_complete(player.id)};
		row.energy = player.get_energy_state(); row.research = f.game.get_research_state(player.id);
		row.science = f.game.get_research_science(player.id); players :+ row;
	}
	return {native:f.snapshot(),terrain:f.terrain_snapshot(),turn:f.game.get_turn() + 0,units:units,players:players};
};
