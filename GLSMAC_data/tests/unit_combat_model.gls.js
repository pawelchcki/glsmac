// Native model and codec checks; synthetic definitions, not original combat odds.
const behavior = #include('./_behavior');
const declare = (f, id, combat) => {
	const data = {name: id, morale: 'SYNTHETIC', type: 'static', movement_type: 'land', movement_per_turn: 1,
		render: {type: 'sprite', file: 'synthetic.pcx', x: 0, y: 0, w: 1, h: 1, cx: 0, cy: 0}};
	data.combat = combat;
	f.with_write(() => { f.game.um.define_unit(id, data); });
};
const spawn = (f, id) => {
	let unit = null;
	f.with_write(() => { unit = f.game.um.spawn_unit({def: id, owner: f.owner, tile: f.base.get_tile(), morale: 1, health: 1.0}); });
	return unit;
};

behavior.scenario('conventional unit definitions retain offense defense reactor and morale identity', () => {
	const f = test.founding_fixture();
	declare(f, 'CONVENTIONAL', {kind: 'conventional', offense: 3, defense: 2, reactor: 1});
	const unit = spawn(f, 'CONVENTIONAL'); const def = unit.get_def();
	test.assert(#is_defined(def.combat), 'Conventional units need native combat attributes');
	test.assert(def.combat == {kind: 'conventional', offense: 3, defense: 2, reactor: 1});
	test.assert(def.morale == 'SYNTHETIC');
	const exported = def.combat; exported.offense = 99;
	const again = unit.get_def();
	test.assert(again.combat.offense == 3, 'Exported attributes cannot mutate a native unit definition');
	const codec = f.unit_order_codec_probe(unit.id);
	test.assert(codec.roundtrip && codec.combat_received && codec.receiving_owner && codec.source_unchanged);
	const definition_codec = f.unit_definition_codec_probe('CONVENTIONAL');
	test.assert(definition_codec.roundtrip && definition_codec.legacy_default && definition_codec.invalid_rejected && definition_codec.source_unchanged);
});

behavior.scenario('civilian and legacy psi definitions have distinct native models', () => {
	const f = test.founding_fixture();
	declare(f, 'CIVILIAN', {kind: 'civilian', offense: 0, defense: 1, reactor: 1});
	const unit = spawn(f, 'CIVILIAN'); const legacy = f.game.um.get_unit(f.unit_id);
	test.assert(unit.get_def().combat.kind == 'civilian' && unit.get_def().combat.offense == 0);
	test.assert(legacy.get_def().combat == {kind: 'psi', offense: 0, defense: 0, reactor: 1});
});

let number = 0;
for (invalid of [
	{kind: 'unknown', offense: 1, defense: 1, reactor: 1},
	{kind: 'conventional', offense: 0, defense: 1, reactor: 1},
	{kind: 'conventional', offense: 1, defense: 0, reactor: 1},
	{kind: 'civilian', offense: 1, defense: 1, reactor: 1},
	{kind: 'psi', offense: 1, defense: 0, reactor: 1},
	{kind: 'conventional', offense: 1, defense: 1, reactor: 0},
	{kind: 'conventional', offense: 1, defense: 1, reactor: 5},
	{kind: 'conventional', offense: 1.0, defense: 1, reactor: 1},
	{kind: 'conventional', offense: 1, defense: 1},
]) {
	behavior.scenario('invalid combat metadata rejects registration atomically ' + #to_string(number), () => {
		const f = test.founding_fixture(); const before = f.snapshot(); let rejected = false;
		try { declare(f, 'BAD', invalid); } catch { : (e) => { rejected = true; } }
		test.assert(rejected, 'Malformed combat definition must be rejected');
		test.assert(f.snapshot() == before, 'Rejected combat definition must leave native registries unchanged');
	}); number++;
}
