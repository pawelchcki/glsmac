// Mounted application authority tests, separate from recorded original agreement.
const behavior = #include('./_behavior');
const prepare = #include('./_unit_recycling_fixture'); const input = #include('./_unit_recycling_regression_input');
const fixture = () => {
 const f = prepare(input); f.requests = []; f.defer = false; const send = f.preview.disband.p.game.event;
 f.preview.disband.p.game.event = (name,data) => { const request = {name:name}; request.data = data; f.requests :+ request; if (!f.defer) { send(name,data); } };
 f.deliver = (request) => { send(request.name,request.data); f.flush(); };
 f.open = () => { f.open_action(); f.flush(); f.action({row_source:9}); const dialog = f.dialog(); if (dialog == null) { throw Error('Missing actual recycling dialog'); } return dialog; };
 return f;
};
const unchanged = (f,before) => { test.assert(f.native.snapshot() == before && #sizeof(f.requests) == 0); };
behavior.scenario('owned city uses common two-choice source and materialized native text properties', () => {
 const f = fixture(); const before = f.native.snapshot(); const dialog = f.open();
 const definition = #include('../default/game/unit_disband_dialog')(f.glsmac,f.units[0].get_def().name + '',true);
 test.assert(#typeof(definition.body) == 'String' && #sizeof(definition.choices) == 2);
 for (choice of definition.choices) { test.assert(#typeof(choice) == 'String'); }
 test.assert(dialog.caption == definition.caption && dialog.body == definition.body && dialog.choices == definition.choices && dialog.selected == 0);
 test.assert(f.preview.disband.session.base_id == f.base.id && f.preview.disband.session.base == f.base);
 unchanged(f,before); f.view.root.remove();
});
behavior.scenario('city dialog clamps both ends cancels default and reopens without native credit', () => {
 const f = fixture(); const before = f.native.snapshot(); f.open(); f.action('up'); test.assert(f.dialog().selected == 0);
 f.action('confirm'); test.assert(f.dialog() == null); unchanged(f,before);
 f.open(); f.action('down'); f.action('down'); test.assert(f.dialog().selected == 1);
 f.action('cancel'); test.assert(f.dialog() == null); unchanged(f,before);
 test.assert(f.open().selected == 0); unchanged(f,before); f.view.root.remove();
});
behavior.scenario('mounted ordinary confirmation removes the actual Scout and credits its native city once', () => {
 const f = fixture(); const base = f.base; const scout = f.units[0].id + 0; const previous = base.get_production().minerals; let cost = null;
 for (choice of f.native.owner.get_production_choices()) { if (choice.unit_id == 'ScoutPatrol') { cost = choice.cost + 0; } }
 const before = f.native.snapshot(); const dialog = f.open(); f.action('down'); const ok = dialog.ok; ok.emit('click',{button:'left'}); ok.emit('click',{button:'left'}); f.flush();
 test.assert(#sizeof(f.requests) == 1 && f.requests[0].data.base_id == base.id, 'Expected one city-bound request: ' + #to_string(f.requests));
 test.assert(!f.game.um.has_unit(scout) && base.get_production().minerals == previous + cost / 2, 'Native credit: previous=' + #to_string(previous) + ',price=' + #to_string(cost) + ',actual=' + #to_string(base.get_production().minerals));
 test.assert(f.native.selected_id() == f.units[1].id && f.preview.order_pending == null && f.dialog() == null);
 test.assert(f.game.um.has_unit(f.units[1].id) && f.game.um.has_unit(f.units[2].id)); f.view.root.remove();
});
behavior.scenario('wrong base receipt cannot release a genuine pending recycling request', () => {
 const f = fixture(); const scout_id = f.units[0].id + 0; f.defer = true; const previous = f.base.get_production().minerals; f.open(); f.action('down'); f.action('confirm');
 test.assert(#sizeof(f.requests) == 1 && f.preview.order_pending != null);
 const request = f.requests[0]; const wrong = #clone(request.data); wrong.base_id = wrong.base_id + 1;
 const receipt = {name:'unit_disband',caller:f.native.owner.id,success:true}; receipt.data = wrong; f.events.emit('event_result',receipt);
 test.assert(f.preview.order_pending != null && f.preview.disband.waiting != null && f.base.get_production().minerals == previous);
 f.deliver(request); test.assert(f.preview.order_pending == null && !f.game.um.has_unit(scout_id)); f.view.root.remove();
});
behavior.scenario('stale city modal cannot remove a unit after real movement away from its city', () => {
 const f = fixture(); const dialog = f.open(); f.action('down'); const unit = f.units[0];
 f.native.enable_movement(); f.native.with_write(() => { unit.move_to_tile(f.units[1].get_tile(), () => {}); }); f.native.finish_unit_move(unit.id);
 const before = f.native.snapshot(); dialog.ok.emit('click',{button:'left'}); f.flush();
 test.assert(f.dialog() == null && f.preview.order_pending == null); unchanged(f,before); f.view.root.remove();
});
behavior.scenario('queued city context rejects after actual movement without charging or removing anything', () => {
 const f = fixture(); f.defer = true; f.open(); f.action('down'); f.action('confirm'); const request = f.requests[0]; const unit = f.units[0];
 f.native.enable_movement(); f.native.with_write(() => { unit.move_to_tile(f.units[1].get_tile(), () => {}); }); f.native.finish_unit_move(unit.id); const before = f.native.snapshot();
 const e = {caller:f.native.owner.id}; e.game = f.game; e.data = request.data; const handler = #include('../default/game/event/unit_disband');
 test.assert(#is_defined(handler.validate(e))); let rejected = false; try { f.native.with_write(() => { handler.apply(e); }); } catch { : (error) => { rejected = true; } }
 test.assert(rejected && f.native.snapshot() == before); f.view.root.remove();
});
