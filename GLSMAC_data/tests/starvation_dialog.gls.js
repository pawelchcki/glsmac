// Lifecycle/authority regressions for the transferred first owned-city notice.
// Controlled fixture boundaries are declared in _starvation_dialog_fixture.
const behavior = #include('./_behavior');
const fixture = #include('./_starvation_dialog_fixture');
const confirmation = #include('../default/game/event/confirm_base_starvation');
const advance = #include('../default/game/event/advance_turn');
const complete = #include('../default/game/event/complete_turn');
const parser = #include('../default/game/starvation_dialog');
const growth = #include('../default/game/event/process_base_growth');
const source = '#STARVE\n#xs 320\n#wave 24\n#caption Fixture Chaplain\nWarning at $BASENAME0!\nFactories await.\n';
let labels = '#LABELS\n444\n';
for (let i = 0; i < 444; i++) {
 if (i == 44) { labels += 'Inspect city\n'; }
 else if (i == 45) { labels += 'Continue city\n'; }
 else if (i == 443) { labels += 'Mute notice\n'; }
 else { labels += 'Unused fixture label\n'; }
}
const make = () => {
 const input = {profile: 'stacked', has_popup: 1, initial_base: {workers: 0, doctors: 1, worked_tiles: 0, nutrients: 0, minerals: 9},
  sources: [{name: 'script.txt', source: source}, {name: 'xscript.txt', source: '#STARVE\n#caption Wrong expansion\nWrong source\n'}, {name: 'labels.txt', source: labels}]};
 return fixture(input);
};
const event = (f, choice) => {
 const pending = f.base.get('pending_starvation');
 const e = {caller: f.native.owner.id, data: {base_id: f.base.id, turn_id: f.game.get_turn(), request_token: pending.request_token, choice: choice}}; e.game = f.game; return e;
};
const key = (f, code) => { f.popup.popups.starvation.el.emit('keydown', {code: code, modifiers: {}}); };
const flush = (f) => { for (timer of f.view.timers) { if (timer.interval == 0 && timer.running) { timer.tick(); } } f.flush(); };
const reject = (f, e) => {
 const before = f.native.snapshot(); const pending = f.base.get('pending_starvation');
 test.assert(#is_defined(confirmation.validate(e)));
 let failed = false; try { f.native.with_write(() => { confirmation.apply(e); }); } catch { : (error) => { failed = true; } }
 test.assert(failed && f.native.snapshot() == before && f.base.get('pending_starvation') == pending, 'Rejected apply must leave native state and pending decision unchanged');
};

behavior.scenario('late read-only native observers cannot cancel a mounted starvation decision', () => {
 const f = make(); f.popup.clear(); f.base.unset('pending_starvation'); let observed = 0;
 f.game.on('base_starvation', (e) => { observed = observed + 1; });
 const e = {caller: 0, data: {turn_id: f.game.get_turn()}}; e.game = f.game; e.data.base = f.base;
 f.native.with_write(() => { e.applied = growth.apply(e); });
 while (f.native.inspect().pending_events > 0) { f.native.process_events(); }
 #print('STARVATION_LATE_OBSERVER|' + #to_string(f.base.get_size()) + '|' + #to_string(f.base.has('pending_starvation')) + '|' + #to_string(f.popup.is_shown()));
 test.assert(observed == 1 && f.popup.is_shown() && f.base.has('pending_starvation') && f.base.get_size() == 2, 'Read-only observers must preserve the mounted UI population gate');
 f.view.root.remove();
});

behavior.scenario('a non-UI observer returning true cannot invent a mounted starvation consumer', () => {
 const f = make(); f.popup.clear(); f.view.root.remove(); f.base.unset('pending_starvation');
 test.assert(f.events.count('base_starvation') == 0);
 f.game.on('base_starvation', (e) => { return true; });
 const e = {caller: 0, data: {turn_id: f.game.get_turn()}}; e.game = f.game; e.data.base = f.base;
 f.native.with_write(() => { e.applied = growth.apply(e); });
 let ticks = 0;
 while (f.native.inspect().pending_events > 0 && ticks < 8) { f.native.process_events(); ticks++; }
 test.assert(f.native.inspect().pending_events == 0 && !f.base.has('pending_starvation') && f.base.get_size() == 1, 'Simulation-only starvation needs an actual UI acknowledgement to defer removal');
});

behavior.scenario('actual queued starvation waits for mounted owned-city confirmation and blocks the next turn', () => {
 const f = make(); const pending = f.base.get('pending_starvation');
 test.assert(f.popup.is_shown() && f.popup.popup.id == 'starvation' && f.base.get_size() == 2);
 test.assert(pending.owner == f.native.owner.id && pending.turn_id == f.game.get_turn());
 for (pop of f.base.get_pops()) { test.assert(pop.get_type() == 'DOCTOR'); }
 test.assert(f.base.get_worked_tiles() == [] && f.game.get_year() - f.initial_year == 1);
 const e = {caller: 0, data: {turn_id: f.game.get_turn() + 1}}; e.game = f.game;
 test.assert(#is_defined(advance.validate(e)));
 const before = f.native.snapshot(); let failed = false;
 try { f.native.with_write(() => { advance.apply(e); }); } catch { : (error) => { failed = true; } }
 test.assert(failed && f.native.snapshot() == before);
 e.caller = f.native.owner.id; test.assert(#is_defined(complete.validate(e)));
 key(f, 'ESCAPE'); test.assert(f.popup.is_shown() && f.base.get_size() == 2, 'Unobserved Escape cannot bypass the pending authoritative choice');
 f.view.root.remove();
});

behavior.scenario('growth-stage undo cancels only its matching pending notice without removing a native citizen', () => {
 const f = make(); f.popup.clear(); f.base.unset('pending_starvation');
 const before = f.native.snapshot(); const ids = f.native.next_ids();
 const e = {caller: 0, data: {turn_id: f.game.get_turn()}}; e.game = f.game; e.data.base = f.base;
 test.assert(!#is_defined(growth.validate(e)));
 f.native.with_write(() => { e.applied = growth.apply(e); });
 test.assert(f.base.has('pending_starvation') && f.popup.is_shown() && f.base.get_size() == 2);
 f.events.emit('base_starvation_cancelled', {base_id: f.base.id, request_token: e.applied.new_pending.request_token + 1});
 test.assert(f.popup.is_shown());
 f.native.with_write(() => { growth.rollback(e); });
 test.assert(!f.base.has('pending_starvation') && !f.popup.is_shown() && f.base.get_size() == 2);
 test.assert(f.native.snapshot() == before && f.native.next_ids() == ids); f.view.root.remove();
});

behavior.scenario('source wording actual navigation and Proceed remove exactly one native citizen', () => {
 const f = make(); const notice = f.popup.popup_defs.starvation;
 test.assert(notice.header.text == 'Fixture Chaplain' && notice.texts[0].text == 'Warning at ' + f.base.name + '!');
 test.assert(notice.rows[0].text == 'Inspect city' && notice.rows[1].text == 'Continue city' && notice.suppress.text == 'Mute notice');
 const e = event(f, 1); const ids = f.native.next_ids(); const pops = f.base.get_pops();
 for (code of ['DOWN', 'UP', 'DOWN']) { key(f, code); test.assert(f.base.get_size() == 2); }
 test.assert(notice.selected == 1 && notice.rows[1].border == 'rgb(120,164,212),2');
 const old_ok = notice.ok; key(f, 'ENTER'); flush(f);
 test.assert(!f.popup.is_shown() && f.base.get_size() == 1 && !f.base.has('pending_starvation'));
 test.assert(#sizeof(f.confirm_receipts) == 1 && f.native.next_ids() == ids);
 const remaining = f.base.get_pops(); test.assert(remaining[0] == pops[1] && remaining[0].get_type() == 'DOCTOR');
 old_ok.emit('click', {}); test.assert(#sizeof(f.confirm_requests) == 1 && f.base.get_size() == 1);
 reject(f, e); f.view.root.remove();
});

behavior.scenario('Zoom waits for the matching accepted receipt then opens its actual native base', () => {
 const f = make(); f.defer_confirmation = true; key(f, 'ENTER');
 test.assert(f.base.get_size() == 2 && !f.popup.is_shown() && #sizeof(f.confirm_requests) == 1);
 f.events.emit('event_result', {name: 'confirm_base_starvation', caller: 0, data: f.confirm_requests[0], success: true});
 flush(f); test.assert(!f.popup.is_shown() && f.base.get_size() == 2);
 f.deliver_confirmation(f.confirm_requests[0], f.native.owner.id, true); flush(f);
 const context = f.context(); test.assert(context.screen == 'base' && context.title_matches_base && f.base.get_size() == 1);
 f.action('close'); test.assert(f.context().screen == 'map'); f.view.root.remove();
});

behavior.scenario('malformed foreign stale and duplicate confirmations cannot mutate native citizens', () => {
 const f = make();
 for (field of ['base_id', 'turn_id', 'request_token', 'choice']) {
  for (value of [null, '1', (0 - 1), 99999]) { const e = event(f, 0); e.data[field] = value; reject(f, e); }
 }
 const foreign = event(f, 0); foreign.caller = 0; reject(f, foreign);
 const stale = event(f, 0); f.native.set_turn(f.game.get_turn() + 1); reject(f, stale);
 f.view.root.remove();
});

behavior.scenario('changed native population and resolved food invalidate an old pending choice', () => {
 const f = make(); const e = event(f, 1);
 f.native.with_write(() => { f.base.create_pop({type: 'DOCTOR'}); }); reject(f, e); f.view.root.remove();
 const other = make(); const pending = event(other, 1);
 other.native.with_write(() => { other.base.set('accumulated_nutrients', 100); }); reject(other, pending); other.view.root.remove();
});

behavior.scenario('confirmation rollback restores the pending choice and a valid monotonic native citizen', () => {
 const f = make(); const e = event(f, 1); const before = f.base.get_pops();
 f.native.with_write(() => { e.applied = confirmation.apply(e); });
 const survivors = f.base.get_pops(); test.assert(f.base.get_size() == 1 && survivors[0] == before[1]);
 f.native.with_write(() => { confirmation.rollback(e); });
 test.assert(f.base.get_size() == 2 && f.base.has('pending_starvation'));
 const restored = f.base.get_pops(); test.assert(restored[0] == before[1] && restored[1].id > before[1].id);
 const retry = event(f, 1); test.assert(!#is_defined(confirmation.validate(retry)));
 f.native.with_write(() => { confirmation.apply(retry); }); test.assert(f.base.get_size() == 1); f.view.root.remove();
});

behavior.scenario('rejected or stale acknowledgements never Zoom and display removal unregisters owned handlers', () => {
 const f = make(); f.defer_confirmation = true; key(f, 'ENTER');
 f.deliver_confirmation(f.confirm_requests[0], f.native.owner.id, false); flush(f);
 test.assert(f.popup.is_shown() && f.popup.popup.id == 'starvation' && f.base.get_size() == 2 && f.base.has('pending_starvation'));
 test.assert(f.popup.popup_defs.starvation.selected == 0, 'Rejected unchanged decision remains available for retry');
 f.view.root.remove(); test.assert(f.events.count('base_starvation') == 0 && f.events.count('event_result') == 0);
 const other = make(); other.defer_confirmation = true; key(other, 'ENTER'); other.native.set_turn(other.game.get_turn() + 1);
 other.events.emit('event_result', {name: 'confirm_base_starvation', caller: other.native.owner.id, data: other.confirm_requests[0], success: true});
 flush(other); test.assert(!other.popup.is_shown() && other.base.get_size() == 2); other.view.root.remove();
});

behavior.scenario('malformed installed STARVE and label declarations fail instead of inventing wording', () => {
 for (bad of ['#STARVE\nBody\n', '#STARVE\n#caption One\n#caption Two\nBody\n', '#STARVE\n#caption One\n$UNKNOWN0\n', '#STARVE\n#caption One\n#unknown 4\nBody\n']) {
  let failed = false;
  try { parser.load({load_smac_text: (name, format) => { return test.parse_smac_text(name == 'script.txt' ? bad : labels, format); }}, 'Fixture Base'); }
  catch { : (error) => { failed = true; } } test.assert(failed);
 }
 let failed = false;
 try { parser.load({load_smac_text: (name, format) => { return test.parse_smac_text(name == 'script.txt' ? source : '#LABELS\n1\nOnly one\n', format); }}, 'Fixture Base'); }
 catch { : (error) => { failed = true; } } test.assert(failed);
});
