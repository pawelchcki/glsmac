// Controlled 4x4 native topology, synthetic component/text declarations and
// display/transport only. Production owns resources, controls, income and growth.
const prepare = #include('./_base_open_fixture');
const resource_rules = #include('../default/resources');
const resource_panel = #include('../default/ui/parts/game/popup/base_screen/resources');
const production_panel = #include('../default/ui/parts/game/popup/base_screen/bottom_bar/production');
return (input) => {
 const setup = {profile: 'stacked', setup: ['wait', 'wait'], process_turns: true, extra_popup: 'starvation'};
 setup.initial_base = input.initial_base;
 const f = prepare(setup); #include('../default/game/events')(f.game);
 resource_rules.configure(f.game);
 f.native.with_write(() => {
  f.native.owner.add_production_choice('STARVATION_FORMERS', {type: 'unit', id: 'Formers', cost: 1000, cost_rows: 100, population_cost: 0});
  f.base.restore_production({choice_id: 'STARVATION_FORMERS', minerals: input.initial_base.minerals, last_processed_turn: 0}, '');
 });
 f.p.glsmac = {load_smac_text: (name, format) => {
  for (source of input.sources) { if (source.name == name) { return test.parse_smac_text(source.source, format); } }
  throw Error('Undeclared installed text: ' + name);
 }};
 f.game.on('base_starvation', (e) => { return f.events.emit('base_starvation', e); });
 f.game.on('base_starvation_cancelled', (e) => { f.events.emit('base_starvation_cancelled', e); });
 f.game.on('turn', (e) => { f.events.emit('turn', e); });
 f.game.on('turn_status', (e) => { f.events.emit('turn_status', e); });
 const ordinary = f.events.event; f.confirm_receipts = []; f.confirm_requests = []; f.defer_confirmation = false;
 f.deliver_confirmation = (data, caller, accepted) => {
  const handler = #include('../default/game/event/confirm_base_starvation');
  const e = {caller: caller}; e.game = f.game; e.data = data;
  const error = handler.validate(e); const success = accepted && !#is_defined(error);
  if (success) { f.native.with_write(() => { e.applied = handler.apply(e); }); f.confirm_receipts :+ e; }
  f.events.emit('event_result', {name: 'confirm_base_starvation', caller: caller, data: data, success: success});
 };
 f.events.event = (name, data) => {
  if (name != 'confirm_base_starvation' && name != 'complete_turn') { ordinary(name, data); return; }
  if (name == 'confirm_base_starvation') {
   f.confirm_requests :+ data;
   if (!f.defer_confirmation) { f.deliver_confirmation(data, f.native.owner.id, true); }
   return;
  }
  const handler = #include('../default/game/event/' + name);
  const e = {caller: f.native.owner.id}; e.game = f.game; e.data = data;
  const error = handler.validate(e); if (#is_defined(error)) { throw Error(error); }
  f.native.with_write(() => { e.applied = handler.apply(e); });
  f.events.emit('event_result', {name: name, caller: f.native.owner.id, data: data, success: true});
 };
 f.initial_year = f.game.get_year();
 f.action('join');
 f.action('open');
 // Mount the actual resource and project labels. Icon-cell drawing is omitted.
 const screen = f.popup.popup_defs.base_screen; const bodies = [];
 for (child of f.popup.popups.base_screen.el.children) { if (#is_defined(child.class) && child.class == 'game-popup-body') { bodies :+ child; } }
 if (#sizeof(bodies) != 1) { throw Error('Missing complete management body'); }
 const panel_context = {}; panel_context.body = bodies[0]; panel_context.ui = f.view.ui; panel_context.game = f.events;
 panel_context.utils = {set_cells: (w, h, columns, rows, stored, pending, cells, style, label, describe) => { label.text = describe(0); }};
 resource_panel.init(panel_context); resource_panel.total_cells = 0;
 production_panel.init(panel_context);
 screen.sections.resources = resource_panel; screen.sections.bottom_bar.parts.production = production_panel;
 const refresh = {}; refresh.base = f.base; screen.set(refresh);
 if (f.context().screen != 'base' || !f.context().title_matches_base) { throw Error('Management title does not match native city'); }
 for (type of ['nutrients', 'minerals', 'energy']) {
  const labels = resource_panel.labels[type];
  if (#typeof(labels.left.text) != 'String' || labels.left.text == '' || #typeof(labels.right.text) != 'String' || labels.right.text == '') { throw Error('Incomplete management resource labels'); }
 }
 if (production_panel.production_title.text != 'Formers' || production_panel.production_amount.text != '9 / 1000 minerals') { throw Error('Incomplete Formers project context'); }
 f.action('close');
 const count = 2;
 for (let i = 0; i < count; i++) { f.action('hold'); }
 #include('../default/ui/parts/game/bottom_bar/mini_map').init(f.p);
 f.turn_button = f.view.find('button', 'text', 'TURN COMPLETE');
  f.native.with_write(() => { for (player of f.game.get_players()) { if (player.id != f.native.owner.id && !f.game.is_turn_complete(player.id)) { f.game.complete_turn(player.id); } } });
 // The headless fixture has no frontend turn-status packet consumer. Initial
 // delivery is allowed only after native navigation exhausts both held units.
 if (f.selected_id() != null) { throw Error('Native preparation still has a ready unit'); }
 f.events.emit('turn_status', {status: 'turn_complete'});
 f.settle = () => {
  let ticks = 0;
  while (f.native.inspect().pending_events > 0 && ticks < 16) { f.native.process_events(); ticks++; }
  if (f.native.inspect().pending_events != 0) { throw Error('Native turn queue did not settle'); }
  for (timer of f.view.timers) { if (timer.interval == 0 && timer.running) { timer.tick(); } } f.flush();
 };
 f.turn = () => {
  if (f.popup.is_shown() || f.turn_button.text != 'TURN COMPLETE') { throw Error('Turn control is not ready'); }
  f.turn_button.emit('click', {}); f.settle();
 };
 f.control = (action) => {
  if (!f.popup.is_shown() || f.popup.popup.id != 'starvation') { throw Error('Notice control is not mounted'); }
  const notice = f.popup.popup_defs.starvation;
  if (action == 'suppress') { notice.suppress.emit('click', {}); }
  else {
   const modifiers = action == 'shift-escape' ? {shift: true} : {};
   f.popup.popup.el.emit('keydown', {code: action == 'down' ? 'DOWN' : 'ESCAPE', modifiers: modifiers});
  }
  f.settle();
 };
 return f;
};
