// Actual mounted controls, shared native editor and authoritative city changes.
// Synthetic installed declarations and display/transport are explicit boundaries.
const behavior = #include('./_behavior');
const make = #include('./_base_rename_fixture');
const handler = #include('../default/game/event/rename_base');
const inputs = () => {
 let labels = '#LABELS\n1131\n';
 for (let i = 0; i < 1131; i++) { labels += (i == 101 ? 'OK' : (i == 102 ? 'Cancel' : 'Fixture label ' + #to_string(i))) + '\n'; }
 return {profile: 'stacked', initial_base: {name: 'Gaia\'s Landing', workers: 0, doctors: 1, worked_tiles: 0, nutrients: 0, minerals: 9}, sources: [
  {name: 'script.txt', source: '#RENAME\n#xs 440\n#caption Fixture Archivist\nChoose title for $BASENAME0?\n\nTag:\n\n'},
  {name: 'xscript.txt', source: '#RENAME\n#caption Other Archivist\nOther title for $BASENAME0?\n\nOther:\n'},
  {name: 'labels.txt', source: labels},
 ]};
};
const fixture = () => { return make(inputs()); };
const reject = (callback) => { let caught = false; try { callback(); } catch { : (error) => { caught = true; } } test.assert(caught, 'Expected native Rename rejection'); };
const open = (f) => {
 if (f.context().screen != 'base') { f.action('open'); }
 f.management.sections.buttons.buttons[0].emit('click', {button: 'left'});
 test.assert(f.management.rename_dialog != null); return f.management.rename_dialog;
};
const edit = (dialog, keys) => {
 while (dialog.input.input_state.get_value() != '') { dialog.input.raw_key('BACKSPACE', '', 0, ''); }
 for (character of keys) { dialog.input.raw_key('NONE', character, 0, ''); }
};
const command = (f, name) => {
 const e = {caller: f.native.owner.id}; e.game = f.game;
 e.data = {base_id: f.base.id, turn_id: f.game.get_turn(), request_token: 41, previous_name: f.base.name, name: name};
 test.assert(!#is_defined(handler.validate(e))); f.native.with_write(() => { e.applied = handler.apply(e); }); return e;
};
behavior.scenario('mounted Rename consumes common source actual native draft and normal update notification', () => {
 const f = fixture(); const before = f.native.snapshot(); const dialog = open(f);
 test.assert(dialog.caption.text == 'Fixture Archivist' && dialog.prompt.text == 'Choose title for Gaia\'s Landing?' && dialog.label.text == 'Tag:');
 test.assert(dialog.ok.text == 'OK' && dialog.cancel.text == 'Cancel' && dialog.input.input_state.get_value() == f.base.name);
 edit(dialog, ['N', 'e', 'w']); dialog.input.raw_key('ENTER', '', 0, ''); f.flush();
 test.assert(f.base.name == 'New' && f.actual_title() == 'New' && f.management.rename_dialog == null);
 test.assert(f.rename_requests[0].name == 'New' && f.rename_receipts[0].applied.receipt > 0);
 f.native.with_write(() => { handler.rollback(f.rename_receipts[0]); });
 test.assert(f.base.name == 'Gaia\'s Landing' && f.actual_title() == f.base.name && f.native.snapshot() == before);
 f.action('close'); f.require_map_label(); f.view.root.remove();
});
behavior.scenario('native name registry and detached frontend packets change on apply and undo', () => {
 const f = fixture(); f.native.frontend_packets(); const e = command(f, '  Green  ');
 const packets = f.native.frontend_packets(); test.assert(packets.base_names == [{id: f.base.id, name: '  Green  '}]);
 test.assert(f.native.inspect().names == ['  Green  '] && f.base.name == '  Green  ');
 f.native.with_write(() => { handler.rollback(e); }); const undo = f.native.frontend_packets();
 test.assert(undo.base_names == [{id: f.base.id, name: 'Gaia\'s Landing'}]);
 test.assert(packets.base_names[0].name == '  Green  ' && f.native.inspect().names == ['Gaia\'s Landing']); f.view.root.remove();
});
behavior.scenario('native Rename requires owner current turn current name and write authorization', () => {
 const f = fixture(); const before = f.native.snapshot();
 test.assert(#is_defined(f.base.validate_rename(0, 1, f.base.name, 'New')));
 test.assert(#is_defined(f.base.validate_rename(f.native.owner.id, 2, f.base.name, 'New')));
 test.assert(#is_defined(f.base.validate_rename(f.native.owner.id, 1, 'Old', 'New')));
 test.assert(#is_defined(f.base.validate_rename(f.native.owner.id, 1, f.base.name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')));
 test.assert(#is_defined(f.base.validate_rename(f.native.owner.id, 1, f.base.name, 'Bad\nName')));
 reject(() => { f.base.rename(f.native.owner.id, 1, f.base.name, 'New'); });
 test.assert(f.native.snapshot() == before); f.view.root.remove();
});
behavior.scenario('native unchanged confirmation has no update receipt or name registry changes', () => {
 const f = fixture(); f.native.frontend_packets(); const before = f.native.snapshot(); const updates = f.native.update_count();
 const e = command(f, f.base.name);
 test.assert(e.applied.receipt == 0 && f.native.snapshot() == before && f.native.update_count() == updates);
 test.assert(f.native.frontend_packets().base_names == []); f.view.root.remove();
});
behavior.scenario('native receipts reject duplicate out of order changed state and stale turn rollback', () => {
 const f = fixture(); const before = f.native.snapshot(); const first = command(f, 'First'); const second = command(f, 'Second');
 reject(() => { f.native.with_write(() => { handler.rollback(first); }); }); test.assert(f.base.name == 'Second');
 f.native.with_write(() => { handler.rollback(second); handler.rollback(first); }); test.assert(f.native.snapshot() == before);
 reject(() => { f.native.with_write(() => { handler.rollback(first); }); });
 const third = command(f, 'Third'); f.native.with_write(() => { f.base.set('accumulated_nutrients', 1); });
 reject(() => { f.native.with_write(() => { handler.rollback(third); }); });
 f.native.with_write(() => { f.base.set('accumulated_nutrients', 0); }); f.native.set_turn(2);
 reject(() => { f.native.with_write(() => { handler.rollback(third); }); }); test.assert(f.base.name == 'Third'); f.view.root.remove();
});
behavior.scenario('closed replaced and removed overlays cannot submit stale callbacks', () => {
 const f = fixture(); const first = open(f); const old_click = first.ok.get_handlers();
 first.cancel.emit('click', {button: 'left'}); const second = open(f);
 for (entry of old_click) { if (entry.name == 'click') { entry.callback({button: 'left'}); } }
 test.assert(f.management.rename_dialog == second && f.rename_requests == []);
 f.action('close'); second.input.emit('input', {value: 'stale'}); second.ok.emit('click', {button: 'left'});
 test.assert(f.management.rename_dialog == null && f.rename_requests == [] && f.base.name == 'Gaia\'s Landing'); f.view.root.remove();
});
behavior.scenario('deferred Rename acknowledgement matches its complete scalar request and rejects duplicates', () => {
 const f = fixture(); f.defer_rename = true; const dialog = open(f); edit(dialog, ['N']); dialog.ok.emit('click', {button: 'left'}); f.flush();
 test.assert(f.rename_requests[0].name == 'N' && f.management.rename_dialog == null && f.management.rename_controller.waiting != null);
 const request = f.rename_requests[0];
 for (field of ['base_id', 'turn_id', 'request_token', 'previous_name', 'name']) {
  const event = {name: 'rename_base', caller: f.native.owner.id, success: false}; event.data = {} + request;
  if (field == 'previous_name' || field == 'name') { event.data[field] = 'wrong'; } else { event.data[field] = event.data[field] + 1; }
  f.events.emit('event_result', event); test.assert(f.management.rename_controller.waiting != null && f.management.rename_dialog == null);
 }
 f.deliver_rename(0, f.native.owner.id, false); test.assert(f.management.rename_dialog.input.input_state.get_value() == 'N');
 f.management.rename_dialog.ok.emit('click', {button: 'left'}); f.deliver_rename(1, f.native.owner.id, true);
 test.assert(f.base.name == 'N' && f.management.rename_controller.waiting == null);
 f.deliver_rename(1, f.native.owner.id, true); test.assert(f.management.rename_dialog == null && f.base.name == 'N'); f.view.root.remove();
});
behavior.scenario('renamed raw city name roundtrips native snapshots and retired methods reject writes', () => {
 const f = fixture(); command(f, '  Codec  '); const snapshot = f.native.base_snapshot(); const previous = f.base;
 f.native.restore(snapshot); test.assert(f.native.base.name == '  Codec  ' && f.native.base_snapshot() == snapshot);
 const citizens = f.native.base.get_pops(); test.assert(#sizeof(citizens) == 1 && citizens[0].get_type() == 'DOCTOR');
 reject(() => { f.native.with_write(() => { previous.rename(f.native.owner.id, 1, '  Codec  ', 'Wrong'); }); }); f.view.root.remove();
});
behavior.scenario('saved native Rename methods reject after despawn without dereferencing the removed city', () => {
 const f = fixture(); const apply = f.base.rename; const validate = f.base.validate_rename; const undo = f.base.rollback_rename;
 const owner = f.native.owner.id; const name = f.base.name; const id = f.base.id;
 f.native.with_write(() => { f.game.bm.despawn_base(id); });
 test.assert(#is_defined(validate(owner, 1, name, 'Wrong')));
 reject(() => { f.native.with_write(() => { apply(owner, 1, name, 'Wrong'); }); });
 reject(() => { f.native.with_write(() => { undo(1); }); }); f.view.root.remove();
});
behavior.scenario('saved native Rename methods reject after destruction of the whole native game', () => {
 const f = fixture(); test.assert(f.native.base_rename_lifetime_probe()); f.view.root.remove();
});
behavior.scenario('failed native rename restores name wrappers registry and queued updates atomically', () => {
 const f = fixture();
 f.native.with_write(() => {
  const worker = f.base.create_pop({type: 'WORKER'});
  // Deliberately invalid worker -> tile link makes the transaction snapshot fail.
  worker.set('worked_tile', f.native.tile_at(0, 2));
  const before = f.native.inspect(); const original = f.base.name;
  test.assert(f.native.catches_native_failure(() => { f.base.rename(f.native.owner.id, 1, original, 'Rejected'); }));
  const after = f.native.inspect();
  test.assert(f.base.name == original && after.names == before.names && after.base_updates == before.base_updates && after.updates == before.updates);
  // Repair before the fixture publishes its normal post-write notification.
  worker.set('worked_tile', undefined); f.base.destroy_pop(worker);
 });
 f.view.root.remove();
});
behavior.scenario('locked native city and malformed request token reject without modifying its name', () => {
 const f = fixture(); f.native.configure_unit(f.units[0].id, 'locked');
 test.assert(#is_defined(f.base.validate_rename(f.native.owner.id, 1, f.base.name, 'Locked')));
 const e = {caller: f.native.owner.id}; e.game = f.game; e.data = {base_id: f.base.id, turn_id: 1, request_token: 0, previous_name: f.base.name, name: 'Bad'};
 test.assert(#is_defined(handler.validate(e)) && f.base.name == 'Gaia\'s Landing'); f.view.root.remove();
});
behavior.scenario('invalid installed Rename source fails before mounting controls or submitting native state', () => {
 const data = inputs(); data.sources[0].source = '#RENAME\n#caption One\n#caption Two\nTitle for $BASENAME0?\n\nTag:\n';
 const f = make(data); f.action('open');
 reject(() => { f.management.sections.buttons.buttons[0].emit('click', {button: 'left'}); });
 test.assert(f.management.rename_dialog == null && f.rename_requests == [] && f.base.name == 'Gaia\'s Landing'); f.view.root.remove();
});
