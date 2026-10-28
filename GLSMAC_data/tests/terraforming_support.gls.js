// Local-consequence application checks, separate from original-game parity.
const behavior = #include('./_behavior');
const fixture = #include('./_terraform_primitives_fixture'); const support = #include('../default/game/terraforming_support');
const transfer = #include('../default/game/event/transfer_terraforming_ownership');
const rules = {version:1,bunker_defense_percent:25,sensor_defense_percent:25,repair_bonus:0.1};
behavior.scenario('terrain support reads independent installed defense percentages', () => {
	let source = '#RULES\n'; for (let row = 0; row < 41; row++) { source += #to_string(row == 21 ? 31 : (row == 40 ? 17 : 0)) + '\n'; }
	const actual = support.parse(test.parse_smac_text(source + '#END\n','rules'));
	test.assert(actual.bunker_defense_percent == 31 && actual.sensor_defense_percent == 17 && actual.repair_bonus == 0.1);
});
behavior.scenario('constructed sensor coverage is pure friendly-only and follows explicit authoritative transfer and undo', () => {
	const f = fixture('sensor',false); f.game.set('terraforming_support_rules',rules); f.command('sensor');
	const before = f.snapshot(); const terrain = f.terrain_snapshot(); const queues = f.inspect();
	test.assert(support.defense(f.game,f.former).sensor_percent == 25 && #sizeof(support.coverage(f.game,f.owner.id,f.former.get_tile())) == 1);
	test.assert(f.snapshot() == before && f.terrain_snapshot() == terrain && f.inspect() == queues);
	const e = {caller:0,data:{x:2,y:2,improvement:'sensor',from_owner:f.owner.id + 0,to_owner:0}}; e.game = f.game;
	test.assert(!#is_defined(transfer.validate(e)));
	f.with_write(() => { e.applied = transfer.apply(e); });
	test.assert(support.defense(f.game,f.former).sensor_percent == 0);
	f.with_write(() => { transfer.rollback(e); }); test.assert(f.terrain_snapshot() == terrain && support.defense(f.game,f.former).sensor_percent == 25);
});
behavior.scenario('real stationary land turn receives bunker repair bonus while local defense is active', () => {
	const f = fixture('bunker',false); f.game.set('terraforming_support_rules',rules); f.command('bunker');
	test.assert(support.defense(f.game,f.former).bunker_percent == 25);
	f.with_write(() => { f.former.health = 0.5; f.former.moved_this_turn = false; });
	f.former = f.game.get_um().get_unit(f.former.id); f.advance();
	test.assert(f.former.health > 0.699 && f.former.health < 0.701);
});
behavior.scenario('owned airbase exposes an honest refueling-site hook and improves actual stationary air repair', () => {
	const f = fixture('airbase',false); f.game.set('terraforming_support_rules',rules); f.command('airbase'); let aircraft = null;
	f.with_write(() => {
		f.game.um.define_unit('SUPPORT_AIR',{name:'Support aircraft',morale:'STANDARD',type:'static',movement_type:'air',movement_per_turn:4,
			combat:{kind:'conventional',offense:1,defense:1,reactor:1},render:{type:'sprite',file:'synthetic.pcx',x:0,y:0,w:1,h:1,cx:0,cy:0}});
		const data = {def:'SUPPORT_AIR',health:0.5,morale:2}; data.owner = f.owner; data.tile = f.former.get_tile(); aircraft = f.game.um.spawn_unit(data);
	});
	const site = support.aerial_site(f.game,f.owner.id,f.former.get_tile());
	test.assert(site.present && site.can_refuel && !site.fuel_system_supported && site.owner == f.owner.id);
	f.advance(); test.assert(aircraft.health > 0.699 && aircraft.health < 0.701);
});
