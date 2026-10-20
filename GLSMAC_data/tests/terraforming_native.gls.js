// Native tile mutation prerequisites. No original work policy is simulated.
const behavior = #include('./_behavior');
const empty = () => { return {road: false, farm: false, mine: false, forest: false}; };
const fixture = () => { const f = test.founding_fixture(); f.enable_economy(); return f; };
const reject = (f, action) => {
	const terrain = f.terrain_snapshot(); const before = f.snapshot(); const inspected = f.inspect();
	let rejected = false;
	try { action(); } catch { : (e) => { rejected = true; } }
	test.assert(rejected && f.terrain_snapshot() == terrain && f.snapshot() == before && f.inspect() == inspected);
};

behavior.scenario('native improvement reads are current detached values and exact tile snapshots undo an edit', () => {
	const f = fixture(); const tm = f.game.get_tm(); const before = f.terrain_snapshot(); const data = empty(); data.farm = true;
	const initial = tm.get_terraforming(2, 2);
	f.with_write(() => { tm.set_terraforming(2, 2, data); });
	test.assert(tm.get_terraforming(2, 2).farm && !initial.farm && f.terrain_snapshot() != before);
	data.farm = false; const exported = tm.get_terraforming(2, 2); exported.farm = false;
	test.assert(tm.get_terraforming(2, 2).farm && !tm.get_terraforming(0, 2).farm);
	f.with_write(() => { tm.set_terraforming(2, 2, empty()); });
	test.assert(f.terrain_snapshot() == before);
});

behavior.scenario('native bounded improvement edits preserve imported improvement flags outside the action scope', () => {
	const f = fixture(); f.configure('sensor'); const tm = f.game.get_tm(); const before = f.terrain_snapshot();
	test.assert(tm.get_terraforming(2, 2).sensor);
	const flags = empty(); flags.road = true; flags.mine = true;
	f.with_write(() => { tm.set_terraforming(2, 2, flags); });
	test.assert(tm.get_terraforming(2, 2).road && tm.get_terraforming(2, 2).mine && tm.get_terraforming(2, 2).sensor);
	f.with_write(() => { tm.set_terraforming(2, 2, empty()); });
	test.assert(tm.get_terraforming(2, 2).sensor && f.terrain_snapshot() == before);
});

behavior.scenario('native tile edits require the authoritative write guard', () => {
	const f = fixture(); reject(f, () => { f.game.get_tm().set_terraforming(2, 2, empty()); });
});

behavior.scenario('terrain frontend request copies own visual layers sprite deltas and metadata after the sender is destroyed', () => {
	const f = fixture(); const before = f.terrain_snapshot(); const units = f.snapshot();
	test.assert(f.terrain_patch_copy_probe());
	test.assert(f.terrain_snapshot() == before && f.snapshot() == units);
});

behavior.scenario('native tile edits reject locked tiles without publishing changes', () => {
	const f = fixture(); f.configure('locked');
	reject(f, () => { f.with_write(() => { f.game.get_tm().set_terraforming(2, 2, empty()); }); });
});

behavior.scenario('retained native tile improvement callables reject retired worlds', () => {
	const f = fixture(); const read = f.game.get_tm().get_terraforming; const write = f.game.get_tm().set_terraforming;
	f.reset(); f.enable_economy();
	reject(f, () => { read(2, 2); });
	reject(f, () => { f.with_write(() => { write(2, 2, empty()); }); });
});

let index = 0;
behavior.scenario('removed native terrain sprites leave no stale cache entry or undelivered add remove pair', () => {
	const f = fixture(); const before = f.inspect();
	test.assert(f.terrain_sprite_cache_probe() && f.inspect() == before);
});

for (fail of [false, true]) {
	behavior.scenario('artwork random scope preserves the actual native generator with failure ' + #to_string(fail), () => {
		const f = fixture(); const before = f.inspect();
		test.assert(f.terrain_random_probe(fail) && f.inspect() == before);
	});
}

for (coords of [[(0 - 1), 0], [4, 0], [0, (0 - 1)], [0, 4], [1, 0], ['2', 2]]) {
	behavior.scenario('invalid improvement coordinates cannot mutate another tile ' + #to_string(index), () => {
		const f = fixture();
		reject(f, () => { f.with_write(() => { f.game.get_tm().set_terraforming(coords[0], coords[1], empty()); }); });
	}); index++;
}

let payload_index = 0;
for (data of [{}, {road: false, farm: false, mine: false}, {road: false, farm: false, mine: false, forest: 1},
	{road: false, farm: false, mine: false, forest: false, sensor: true}]) {
	behavior.scenario('malformed improvement data preserves native terrain and queues ' + #to_string(payload_index), () => {
		const f = fixture();
		reject(f, () => { f.with_write(() => { f.game.get_tm().set_terraforming(2, 2, data); }); });
	}); payload_index++;
}
