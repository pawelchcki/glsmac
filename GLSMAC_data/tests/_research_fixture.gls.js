// Native world/players and synthetic source data. Research policy stays shipped.
const source = #include('./_technology_rules_fixture');
return (blind) => {
	const f = test.founding_fixture(); f.enable_economy();
	f.apply_faction_starting_technologies(['Ecology']);
	f.game.get_settings().global.rules.set_blind_research(blind);
	const definitions = source.parse();
	f.with_write(() => { f.game.technologies.replace(#include('../default/game/technology_rules').plan(definitions, f.game.get_players())); });
	f.game.set('technology_rules', definitions);
	f.command = (name, data, caller) => {
		const handler = #include('../default/game/event/' + name);
		const e = {caller: #is_defined(caller) ? caller : f.owner.id}; e.game = f.game; e.data = data;
		const error = handler.validate(e); if (#is_defined(error)) { throw Error(error); }
		f.with_write(() => { e.applied = handler.apply(e); }); return e;
	};
	return f;
};
