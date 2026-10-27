const behavior = #include('./_behavior');
const fixture = #include('./_base_operations_fixture');
const unchanged = (f, before) => {
 const after = f.snapshot();
 test.assert(#sizeof(after.players) == 7 && #sizeof(after.identities) == 7 && #sizeof(after.bases) == #sizeof(before.bases));
 test.assert(after == before, 'Report controls preserve all seven owners, identities, units, bases, stores, jobs and research');
};
behavior.scenario('single clicks outside cadence remain selection only and report cleanup stops owned timers', () => {
 const f = fixture(); f.open_menu(); const before = f.snapshot();
 f.row().el.emit('click', {});
 for (timer of f.view.timers) { if (timer.interval == 400 && timer.running) { timer.tick(); } }
 f.row().el.emit('click', {});
 test.assert(f.popup.popup.id == 'base_operations' && #sizeof(f.requests) == 0);
 f.report.close.emit('click', {}); test.assert(!f.popup.is_shown());
 for (timer of f.view.timers) { if (timer.interval == 400) { test.assert(!timer.running); } }
 unchanged(f, before); f.view.root.remove();
});
behavior.scenario('owned city membership is live and retired row callbacks cannot open removed or foreign cities', () => {
 const f = fixture(); let foreign = null;
 for (base of f.game.bm.get_bases()) { if (base.get_owner().id != f.game.get_player().id) { foreign = base; } }
 f.open_menu(); test.assert(!f.controller.select(foreign.id) && #sizeof(f.report.rows) == 1);
 const saved = f.row().el.get_handlers(); const id = f.base.id + 0;
 f.native.with_write(() => { f.game.bm.despawn_base(id); });
 f.controller.refresh(); test.assert(#sizeof(f.report.rows) == 0);
 const before = f.snapshot();
 for (entry of saved) { if (entry.name == 'click') { entry.callback({}); entry.callback({}); } }
 test.assert(#sizeof(f.requests) == 0 && f.controller.session.selected == null);
 f.escape(); unchanged(f, before); f.view.root.remove();
});
