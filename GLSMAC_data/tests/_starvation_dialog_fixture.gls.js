// Shared native/display fixture. World/resource declarations and synchronous
// frontend delivery are controlled; production owns every gameplay decision.
const prepare = #include('./_base_open_fixture');
const register_events = #include('../default/game/events');
const advance = #include('../default/game/event/advance_turn');
return (input) => {
 let f = null;
  const setup = {profile: input.profile, setup: ['wait', 'wait'], process_turns: true};
  setup.initial_base = input.initial_base;
  if (input.has_popup == 1) { setup.extra_popup = 'starvation'; }
  f = prepare(setup); register_events(f.game);
  // An incomplete native Formers project is part of the declared context.
  // Its synthetic price only prevents completion: this contract observes no
  // production counter, income, ordering or original project price.
  f.native.with_write(() => {
   f.native.owner.add_production_choice('STARVATION_FORMERS', {type: 'unit', id: 'Formers', cost: 1000, cost_rows: 100, population_cost: 0});
   f.base.restore_production({choice_id: 'STARVATION_FORMERS', minerals: input.initial_base.minerals, last_processed_turn: 0}, '');
  });
  f.p.glsmac = {load_smac_text: (name, format) => {
   for (source of input.sources) { if (source.name == name) { return test.parse_smac_text(source.source, format); } }
   throw Error('Undeclared installed source: ' + name);
  }};
  // Mirror native Game events into the controlled frontend event bus. The
  // notification itself is created exclusively by the mounted shipped popup.
  f.game.on('base_starvation', (e) => { return f.events.emit('base_starvation', e); });
  f.game.on('base_starvation_cancelled', (e) => { f.events.emit('base_starvation_cancelled', e); });
  const ordinary = f.events.event;
  f.events.event = (name, data) => {
   if (name != 'confirm_base_starvation') { ordinary(name, data); return; }
   f.confirm_requests :+ data;
   if (f.defer_confirmation) { return; }
   f.deliver_confirmation(data, f.native.owner.id, true);
  };
  f.confirm_requests = []; f.confirm_receipts = []; f.defer_confirmation = false;
  f.deliver_confirmation = (data, caller, accepted) => {
   const handler = #include('../default/game/event/confirm_base_starvation');
   const e = {caller: caller}; e.game = f.game; e.data = data;
   const error = handler.validate(e); let success = accepted && !#is_defined(error);
   if (success) { f.native.with_write(() => { e.applied = handler.apply(e); f.confirm_receipts :+ e; }); }
   f.events.emit('event_result', {name: 'confirm_base_starvation', caller: caller, data: data, success: success});
  };
  const start = f.game.get_year();
  f.action('join'); f.action('open'); f.action('close'); f.action('hold'); f.action('hold');
  f.game.on('turn', (e) => { f.events.emit('turn', e); });
  f.native.with_write(() => {
   for (player of f.game.get_players()) { if (!f.game.is_turn_complete(player.id)) { f.game.complete_turn(player.id); } }
   const e = {caller: 0, data: {turn_id: f.game.get_turn() + 1}}; e.game = f.game;
   const error = advance.validate(e); if (#is_defined(error)) { throw Error(error); } advance.apply(e);
  });
  let ticks = 0;
  while (f.native.inspect().pending_events > 0 && ticks < 16) { f.native.process_events(); ticks++; }
  if (f.native.inspect().pending_events != 0) { throw Error('Production starvation queue did not settle'); }

 f.initial_year = start; return f;
};
