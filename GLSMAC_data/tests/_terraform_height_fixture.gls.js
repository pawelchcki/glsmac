// Declared complete mechanics world and source inputs, never expected outputs.
const make = #include('./_terraform_primitives_fixture');
const work = #include('../default/game/terraforming');
const command = #include('../default/game/event/unit_terraform');
return (water,elevation,rate,credits) => {
	const f = make('raise',water); const rules = f.game.get('terraforming_rules');
	for (action of ['raise','lower']) { rules[action].turns = rate; rules[action].sea.turns = rate; }
	f.with_write(() => {
		f.game.get_tm().apply_terrain([{x:2,y:2,canonical:{elevation:elevation,is_water:water}}],[f.former.id + 0]);
		if (credits > 0) { f.owner.change_energy(credits,0,f.game.get_turn()); }
	});
	f.height_quote = (action) => {
		const e = {caller:f.owner.id + 0,data:{unit_id:f.former.id + 0,action:action}}; e.game = f.game;
		return work.quote_height(e);
	};
	f.height_command = (action) => {
		const quote = f.height_quote(action);
		if (!quote.supported) { throw Error(quote.reason); }
		const e = {caller:f.owner.id + 0,data:{unit_id:f.former.id + 0,action:action,confirmed_height:true,height_quote:quote}}; e.game = f.game;
		const reason = command.validate(e); if (#is_defined(reason)) { throw Error(reason); }
		f.with_write(() => { e.applied = command.apply(e); }); return e;
	};
	f.receive = () => {
		const id = f.former.id + 0; const source_rules = f.game.get('terraforming_rules');
		f.receive_height_world(); f.former = f.game.um.get_unit(id); f.game.set('terraforming_rules',source_rules);
		#include('../default/units/turns').configure(f.game); work.configure(f.game);
	};
	return f;
};
