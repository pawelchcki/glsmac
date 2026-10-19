// Local command completion contract at the actual native ProcessEvents boundary.
const behavior = #include('./_behavior');
const register = (f, validate, apply) => {
	f.game.register_event('probe', { validate: validate, apply: apply, rollback: (e) => {} });
};
const rejected = (callback) => {
	let caught = false;
	try { callback(); } catch { : (e) => { caught = true; } }
	return caught;
};

behavior.scenario('local validation rejection emits scalar original request identity', () => {
	const f = test.production_fixture();
	const results = [];
	f.game.on('event_result', (e) => { results :+ e; });
	register(f, (e) => { return 'rejected'; }, (e) => { throw Unexpected('must not apply'); });
	f.game.event('probe', { unit_id: 7, label: 'command', optional: null, nested: { unit_id: 8 }, values: [1], base: f.base });
	f.process_events();
	test.assert(#sizeof(results) == 1);
	const result = results[0];
	test.assert(result.name == 'probe' && !result.success && result.caller == 0);
	test.assert(#typeof(result.event_id) == 'String' && result.event_id != '');
	test.assert(result.data == { unit_id: 7, label: 'command', optional: null });
});

behavior.scenario('local apply success reports after mutation and retains original scalar data', () => {
	const f = test.production_fixture();
	const results = [];
	f.game.on('event_result', (e) => { test.assert(f.base.get_production().choice_id == 'RECYCLING_TANKS'); results :+ e; });
	register(f, (e) => {}, (e) => { f.base.select_production('RECYCLING_TANKS'); e.data.unit_id = 99; });
	f.game.event('probe', { unit_id: 7 });
	f.process_events();
	test.assert(#sizeof(results) == 1 && results[0].success && results[0].data.unit_id == 7);
});

behavior.scenario('local apply exception emits failure and restores write authorization', () => {
	const f = test.production_fixture();
	const results = [];
	f.game.on('event_result', (e) => { results :+ e; });
	register(f, (e) => {}, (e) => { throw ApplyError('atomic command rejected'); });
	f.game.event('probe', { unit_id: 11 });
	// The processing boundary may propagate or log the script exception. The
	// notification and restored write authorization are required either way.
	rejected(() => { f.process_events(); });
	test.assert(#sizeof(results) == 1 && !results[0].success && results[0].data.unit_id == 11);
	test.assert(rejected(() => { f.base.select_production('RECYCLING_TANKS'); }));
});

behavior.scenario('remote request never emits a local command result', () => {
	const f = test.production_fixture();
	const results = [];
	f.game.on('event_result', (e) => { results :+ e; });
	register(f, (e) => {}, (e) => {});
	f.remote_event('probe', { unit_id: 17 });
	f.process_events();
	test.assert(#sizeof(results) == 0);
});

behavior.scenario('throwing local result listener cannot reject committed operation', () => {
	const f = test.production_fixture();
	f.game.on('event_result', (e) => { throw ListenerError('failed view callback'); });
	register(f, (e) => {}, (e) => { f.base.select_production('RECYCLING_TANKS'); });
	f.game.event('probe', { unit_id: 21 });
	rejected(() => { f.process_events(); });
	test.assert(f.base.get_production().choice_id == 'RECYCLING_TANKS');
});
for (accepted of [true, false]) {
	for (optimistic of [true, false]) {
		behavior.scenario('native response accepted=' + #to_string(accepted) + ' optimistic=' + #to_string(optimistic) + ' applies or undoes once and notifies', () => {
			const f = test.production_fixture();
			const results = [];
			const counts = { applies: 0, rollbacks: 0 };
			f.game.on('event_result', (e) => { results :+ e; });
			f.game.register_event('probe', {
				validate: (e) => {},
				apply: (e) => { counts.applies = counts.applies + 1; return { previous: 17 }; },
				rollback: (e) => { test.assert(e.applied.previous == 17); counts.rollbacks = counts.rollbacks + 1; },
			});
			f.response_event('probe', { unit_id: 42 }, accepted, optimistic);
			test.assert(counts.applies == (optimistic || accepted ? 1 : 0));
			test.assert(counts.rollbacks == (!accepted && optimistic ? 1 : 0));
			test.assert(#sizeof(results) == 1 && results[0].success == accepted && results[0].data.unit_id == 42);
		});
	}
}
behavior.scenario('accepted response whose native apply rejects still releases local command', () => {
	const f = test.production_fixture();
	const results = [];
	f.game.on('event_result', (e) => { results :+ e; });
	register(f, (e) => {}, (e) => { throw ApplyError('stale accepted command'); });
	f.response_event('probe', { unit_id: 43 }, true, false);
	test.assert(#sizeof(results) == 1 && !results[0].success && results[0].data.unit_id == 43);
});

behavior.scenario('deleted native wrappers remain excluded from original scalar projection', () => {
	const f = test.production_fixture();
	const results = [];
	f.game.on('event_result', (e) => { results :+ e; });
	register(f, (e) => {}, (e) => { f.game.bm.despawn_base(f.base.id); });
	const request = { unit_id: 77 };
	request.base = f.base;
	f.game.event('probe', request);
	f.process_events();
	test.assert(#sizeof(results) == 1 && results[0].success);
	test.assert(results[0].data == { unit_id: 77 }, 'deleted wrappers must not turn into scalar undefined fields');
});

behavior.scenario('actual outgoing queue publishes after apply with pre-apply wrapper bytes', () => {
	const f = test.production_fixture();
	f.enable_transport();
	const base_id = f.base.id;
	register(f, (e) => {
		test.assert(f.transport().count == 0);
	}, (e) => {
		test.assert(f.transport().count == 0, 'success must not be published before apply');
		f.game.bm.despawn_base(base_id);
	});
	const request = {};
	request.target = f.base;
	f.game.event('probe', request);
	f.process_events();
	const wire = f.transport();
	test.assert(wire.count == 1 && wire.wrapper_class == 'Base' && wire.wrapper_id == base_id, 'existing reference codec captured while native object was live');
});

behavior.scenario('actual outgoing queue publishes nothing when native apply throws', () => {
	const f = test.production_fixture();
	f.enable_transport();
	register(f, (e) => {}, (e) => { throw ApplyError('must not publish'); });
	f.game.event('probe', { unit_id: 79 });
	f.process_events();
	test.assert(f.transport().count == 0);
});
