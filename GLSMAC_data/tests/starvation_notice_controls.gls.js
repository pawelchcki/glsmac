// Bounded first-notice control outcomes plus native confirmation/lifetime guards.
// Synthetic source wording, display and transport boundaries live in the fixture.
const behavior = #include('./_behavior');
const fixture = #include('./_starvation_notice_controls_fixture');
const confirmation = #include('../default/game/event/confirm_base_starvation');
const source = '#STARVE\n#caption Fixture Notice\nCitizens await at $BASENAME0!\nFactories await.\n';
let labels = '#LABELS\n444\n';
for (let i = 0; i < 444; i++) {
 if (i == 44) { labels += 'Inspect city\n'; }
 else if (i == 45) { labels += 'Continue city\n'; }
 else if (i == 443) { labels += 'Mute notice\n'; }
 else { labels += 'Unused fixture label\n'; }
}
const make = () => {
 const f = fixture({initial_base: {workers: 0, doctors: 1, worked_tiles: 0, nutrients: 0, minerals: 9},
  sources: [{name: 'script.txt', source: source}, {name: 'labels.txt', source: labels}]});
 f.turn();
 test.assert(f.popup.is_shown() && f.popup.popup.id == 'starvation' && f.base.has('pending_starvation') && f.base.get_size() == 2);
 return f;
};
const act = (f, action) => { if (action == 'proceed') { f.control('down'); f.control('escape'); } else { f.control(action); } };
const context = (f, screen) => {
 test.assert(f.game.get_year() - f.initial_year == 1 && f.base.get_size() == 1 && !f.base.has('pending_starvation'));
 test.assert(f.context().screen == screen);
 if (screen == 'base') {
  test.assert(f.context().title_matches_base && f.popup.popup.id == 'base_screen');
  const sections = f.popup.popup_defs.base_screen.sections;
  for (type of ['nutrients', 'minerals', 'energy']) { const row = sections.resources.labels[type]; test.assert(row.left.text != '' && row.right.text != ''); }
  test.assert(sections.bottom_bar.parts.production.production_title.text == 'Formers');
 } else { test.assert(!f.popup.is_shown() && f.turn_button.text == 'TURN COMPLETE'); }
 const citizens = f.base.get_pops();
 test.assert(citizens[0].get_type() == 'DOCTOR' && f.base.get_worked_tiles() == []);
 for (let i = 0; i < 2; i++) {
  const unit = f.units[i];
  test.assert(f.game.um.has_unit(unit.id) && unit.get_tile() == f.base.get_tile() && unit.get_order() == 'HOLD' && unit.movement == 1.0);
 }
 test.assert(#sizeof(f.confirm_requests) == 1 && #sizeof(f.confirm_receipts) == 1);
};
for (spec of [{action: 'escape', choice: 0, screen: 'base'}, {action: 'proceed', choice: 1, screen: 'map'}, {action: 'suppress', choice: 1, screen: 'map'}]) {
 behavior.scenario('observed ' + spec.action + ' confirms native loss and reaches complete ' + spec.screen + ' context', () => {
  const f = make(); const pops = f.base.get_pops(); const origin = f.base.get_tile(); const id = f.base.id + 0;
  act(f, spec.action); context(f, spec.screen);
  const remaining = f.base.get_pops();
  test.assert(f.confirm_requests[0].choice == spec.choice && remaining[0] == pops[1]);
  test.assert(f.base.id == id && f.base.get_tile() == origin && origin.get_base() == f.base && #sizeof(origin.get_units()) == 2);
  f.view.root.remove();
 });
 behavior.scenario(spec.action + ' waits for its matching native confirmation and rejects duplicate controls', () => {
  const f = make(); f.defer_confirmation = true; const before = f.native.snapshot();
  const notice = f.popup.popup_defs.starvation; const suppress = notice.suppress; const window = f.popup.popups.starvation.el;
  act(f, spec.action);
  test.assert(f.native.snapshot() == before && f.base.has('pending_starvation') && f.base.get_size() == 2);
  test.assert(#sizeof(f.confirm_requests) == 1 && #sizeof(f.confirm_receipts) == 0 && !f.popup.is_shown());
  window.emit('keydown', {code: 'ESCAPE', modifiers: {}}); suppress.emit('click', {});
  test.assert(#sizeof(f.confirm_requests) == 1 && f.base.get_size() == 2);
  const request = f.confirm_requests[0];
  f.events.emit('event_result', {name: 'confirm_base_starvation', caller: 0, data: request, success: true}); f.settle();
  test.assert(f.base.get_size() == 2 && !f.popup.is_shown());
  f.deliver_confirmation(request, f.native.owner.id, true); f.settle(); context(f, spec.screen);
  f.view.root.remove();
 });
}
behavior.scenario('Down only changes mounted highlight before Escape confirms Proceed', () => {
 const f = make(); const before = f.native.snapshot(); f.control('down'); const notice = f.popup.popup_defs.starvation;
 test.assert(f.native.snapshot() == before && f.base.get_size() == 2 && #sizeof(f.confirm_requests) == 0);
 test.assert(notice.selected == 1 && notice.rows[1].border == 'rgb(120,164,212),2');
 f.control('escape'); context(f, 'map'); f.view.root.remove();
});
behavior.scenario('Shift+Escape preserves pending citizens highlight and complete mounted wording', () => {
 const f = make(); const before = f.native.snapshot(); const pending = f.base.get('pending_starvation'); const notice = f.popup.popup_defs.starvation;
 f.control('shift-escape');
 test.assert(f.native.snapshot() == before && f.base.get('pending_starvation') == pending && #sizeof(f.confirm_requests) == 0);
 test.assert(f.popup.is_shown() && f.popup.popup.id == 'starvation' && notice.active && notice.selected == 0);
 test.assert(notice.header.text == 'Fixture Notice' && notice.rows[0].border == 'rgb(120,164,212),2' && notice.suppress.text == 'Mute notice');
 f.control('escape'); context(f, 'base'); f.view.root.remove();
});
behavior.scenario('rejected suppression restores the authoritative Proceed choice and permits guarded retry', () => {
 const f = make(); f.defer_confirmation = true; const notice = f.popup.popup_defs.starvation; const stale = notice.suppress;
 f.control('suppress'); f.deliver_confirmation(f.confirm_requests[0], f.native.owner.id, false); f.settle();
 test.assert(f.popup.is_shown() && f.popup.popup.id == 'starvation' && notice.selected == 1 && f.base.get_size() == 2 && f.base.has('pending_starvation'));
 stale.emit('click', {}); test.assert(#sizeof(f.confirm_requests) == 1 && f.base.get_size() == 2);
 f.control('escape'); test.assert(#sizeof(f.confirm_requests) == 2);
 f.deliver_confirmation(f.confirm_requests[1], f.native.owner.id, true); f.settle();
 test.assert(f.context().screen == 'map' && !f.popup.is_shown() && f.base.get_size() == 1 && #sizeof(f.confirm_receipts) == 1);
 f.view.root.remove();
});
behavior.scenario('suppression callback cannot submit after display removal', () => {
 const f = make(); const stale = f.popup.popup_defs.starvation.suppress; const before = f.native.snapshot();
 f.view.root.remove(); stale.emit('click', {});
 test.assert(f.native.snapshot() == before && f.base.has('pending_starvation') && #sizeof(f.confirm_requests) == 0);
 test.assert(f.events.count('base_starvation') == 0 && f.events.count('event_result') == 0);
});
behavior.scenario('suppression uses the rollback-capable native confirmation receipt', () => {
 const f = make(); f.control('suppress'); const e = f.confirm_receipts[0]; const citizens = f.base.get_pops(); const survivor = citizens[0];
 test.assert(f.base.get_size() == 1 && !f.base.has('pending_starvation'));
 f.native.with_write(() => { confirmation.rollback(e); });
 const restored = f.base.get_pops();
 test.assert(f.base.get_size() == 2 && f.base.has('pending_starvation') && restored[0] == survivor);
 const pending = f.base.get('pending_starvation');
 test.assert(pending.request_token == e.data.request_token && !#is_defined(confirmation.validate(e)));
 f.native.with_write(() => { confirmation.apply(e); });
 test.assert(f.base.get_size() == 1 && !f.base.has('pending_starvation')); f.view.root.remove();
});
