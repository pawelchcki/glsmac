const behavior = #include('./_behavior');
const fixture = #include('./_research_fixture');
const rejects = (callback) => {
	let rejected = false; try { callback(); } catch { : (e) => { rejected = true; } }
	test.assert(rejected);
};

behavior.scenario('native directed selection changes only the actual player goal and rolls back exactly', () => {
	const f = fixture(false); const before = f.research_snapshot('current'); const world = f.snapshot();
	const initial = f.game.get_research_state(f.owner.id);
	test.assert(initial.target_id == (0 - 1) && initial.priorities == [true, false, false, false]);
	const e = f.command('set_research_target', {target_id: 1});
	const selected = f.game.get_research_state(f.owner.id); const other = f.game.get_research_state(0);
	test.assert(selected.target_id == 1 && other.target_id == (0 - 1));
	test.assert(!f.game.technologies.has_tech(1, f.owner.id + 1) && f.snapshot() == world, 'Choosing a goal grants no technology or resources');
	selected.priorities[0] = false;
	const retained = f.game.get_research_state(f.owner.id); test.assert(retained.priorities[0]);
	f.with_write(() => { #include('../default/game/event/set_research_target').rollback(e); });
	test.assert(f.research_snapshot('current') == before && f.snapshot() == world);
	rejects(() => { f.with_write(() => { f.game.rollback_research(e.applied); }); });
});

behavior.scenario('source ownership and prerequisites govern native research selection', () => {
	const f = fixture(false); const before = f.research_snapshot('current');
	for (target of [0, 3, 6, 89, (0 - 1), (0 - 2)]) {
		const e = {caller: f.owner.id, data: {target_id: target}}; e.game = f.game;
		test.assert(#is_defined(#include('../default/game/event/set_research_target').validate(e)));
		rejects(() => { f.with_write(() => { f.game.select_research_target(f.owner.id, target); }); });
		test.assert(f.research_snapshot('current') == before);
	}
	f.with_write(() => {
		const row = f.game.technologies.get(1); row[1] = 6;
		f.game.technologies.set(1, row[0], row[1], row[2]);
	});
	f.command('set_research_target', {target_id: 3});
	test.assert(f.game.get_research_state(f.owner.id).target_id == 3);
});

behavior.scenario('invalid callers and scalar types reject before state changes', () => {
	const f = fixture(false); const before = f.research_snapshot('current');
	for (caller of [true, (0 - 1), 7, 6]) {
		const e = {caller: caller, data: {target_id: 1}}; e.game = f.game;
		test.assert(#is_defined(#include('../default/game/event/set_research_target').validate(e)));
	}
	for (target of [true, 1.0, '1', null, undefined]) {
		const e = {caller: f.owner.id, data: {target_id: target}}; e.game = f.game;
		test.assert(#is_defined(#include('../default/game/event/set_research_target').validate(e)));
		rejects(() => { f.with_write(() => { f.game.select_research_target(f.owner.id, target); }); });
	}
	test.assert(f.research_snapshot('current') == before);
});

behavior.scenario('research respects write authorization mode and turn ownership', () => {
	const f = fixture(true); const before = f.research_snapshot('current');
	rejects(() => { f.game.set_research_priority(f.owner.id, 1, true); });
	rejects(() => { f.with_write(() => { f.game.select_research_target(f.owner.id, 1); }); });
	f.with_write(() => { f.game.complete_turn(f.owner.id); });
	rejects(() => { f.command('set_research_priority', {priority: 1, enabled: true}); });
	test.assert(f.research_snapshot('current') == before);
});

behavior.scenario('all four native priorities toggle independently and can all remain off', () => {
	const f = fixture(true);
	for (priority of [0, 1, 2, 3]) { f.command('set_research_priority', {priority: priority, enabled: true}); }
	const all = f.game.get_research_state(f.owner.id); test.assert(all.priorities == [true, true, true, true] && all.target_id == (0 - 1));
	for (priority of [0, 1, 2, 3]) { f.command('set_research_priority', {priority: priority, enabled: false}); }
	const none = f.game.get_research_state(f.owner.id); test.assert(none.priorities == [false, false, false, false]);
	const e = f.command('set_research_priority', {priority: 2, enabled: true});
	f.with_write(() => { #include('../default/game/event/set_research_priority').rollback(e); });
	test.assert(f.game.get_research_state(f.owner.id) == none);
});

behavior.scenario('a newer native request invalidates earlier research receipts', () => {
	const f = fixture(false); const first = f.command('set_research_target', {target_id: 1});
	const second = f.command('set_research_target', {target_id: 2}); const before = f.research_snapshot('current');
	rejects(() => { f.with_write(() => { f.game.rollback_research(first.applied); }); });
	test.assert(f.research_snapshot('current') == before);
	f.with_write(() => { f.game.rollback_research(second.applied); });
	test.assert(f.game.get_research_state(f.owner.id).target_id == 1);
});

behavior.scenario('native research snapshots transfer independently and reject a malformed late player', () => {
	const source = fixture(false); const target = fixture(false);
	source.command('set_research_target', {target_id: 1});
	target.restore_research(source.research_snapshot('current'));
	test.assert(target.research_snapshot('current') == source.research_snapshot('current'));
	source.command('set_research_target', {target_id: 2});
	test.assert(target.game.get_research_state(target.owner.id).target_id == 1);
	const before = target.research_snapshot('current');
	for (kind of ['truncated', 'trailing', 'version', 'count', 'target', 'priorities']) {
		rejects(() => { target.restore_research(source.research_snapshot(kind)); });
		test.assert(target.research_snapshot('current') == before);
	}
});

behavior.scenario('Blind Research rules transfer and legacy records restore the standard default', () => {
	const source = fixture(false); const target = fixture(true);
	const alias = target.game.get_settings().global.rules; const read = alias.get_blind_research;
	test.assert(read()); target.restore_rules_settings(source.rules_settings_snapshot('current')); test.assert(!read());
	source.game.get_settings().global.rules.set_blind_research(true); test.assert(!read());
	target.restore_rules_settings(source.rules_settings_snapshot('legacy')); test.assert(read());
	rejects(() => { alias.set_blind_research(1); });
});
