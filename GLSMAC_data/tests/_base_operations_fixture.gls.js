// Declared equivalent source inputs; actual native seven-owner world and menus.
const mocks = #include('./_ui_mocks');
const menu_source = #include('./_ingame_menu_text_fixture');
return (edited) => {
 const f = {}; f.native = test.natural_startup_fixture(16, 16, 'flat-arid'); f.game = f.native.game;
 f.source = #include('./_startup_faction_sources_fixture')({});
 const labels = #split(f.source.sources['labels.txt'], '\n');
 const declarations = [[691, 'Base Operations'], [744, 'Production'], [745, 'Citizens'], [63, 'Garrison'], [539, 'Datalinks'], [665, 'Close']];
 for (entry of declarations) { labels[entry[0] + 2] = (#is_defined(edited) && edited ? 'Edited ' : '') + entry[1]; }
 let label_text = ''; for (line of labels) { label_text += line + '\n'; }
 f.source.sources['labels.txt'] = label_text; f.source.reload();
 // Equivalent declared first-name source, supplied before native factories.
 // Native city state and all post-action answers are never assigned here.
 const setup = {}; setup.game = f.game; setup.colors = f.native.colors;
 setup.fm = {add: (id, definition) => {
  if (id == 'GAIANS') { definition.bases.names = {land: ['Gaia\'s Landing'], water: ['Gaia\'s Landing']}; }
  f.native.fm.add(id, definition);
 }};
 #include('./_natural_startup_mechanics')(setup, f.source);
 f.native.initialize_single_player('GAIANS', 'Citizen'); f.native.start_world();
 const observe = #include('./_state_trace_observer').make(f.game, 'economy-research-v1', 'explicit-world').read;
 f.snapshot = () => {
  const state = observe(); state.identities = []; state.city_details = [];
  for (player of f.game.get_players()) { state.identities :+ {id: player.id + 0, type: player.type + '', name: player.name + '', identity: #clone(player.get_faction().identity)}; }
  for (base of f.game.bm.get_bases()) {
   const nutrients = base.get('accumulated_nutrients');
   const row = {id: base.id + 0, name: base.name + '', citizens: [], facilities: [], production: #clone(base.get_production()),
    intake: #clone(base.get_intake()), consumption: #clone(base.get_consumption()), nutrients_present: #is_defined(nutrients), nutrients: nutrients};
   for (pop of base.get_pops()) {
    const citizen = {id: pop.id + 0, type: pop.get_type() + '', x: null, y: null};
    if (pop.has('worked_tile')) { const tile = pop.get('worked_tile'); citizen.x = tile.x + 0; citizen.y = tile.y + 0; }
    row.citizens :+ citizen;
   }
   const facilities = base.get_facilities();
   for (entry in facilities) { row.facilities :+ facilities[entry].name + ''; }
   state.city_details :+ row;
  }
  return state;
 };
 f.view = mocks.display(); f.events = mocks.events(); f.map = mocks.events();
 f.view.ui.get_height = () => { return 768; }; f.view.ui.get_width = () => { return 1024; };
 f.events.get_um = () => { return f.game.um; }; f.events.get_bm = () => { return f.game.bm; };
 f.events.get_tm = () => { return f.game.tm; }; f.events.get_player = () => { return f.game.get_player(); };
 f.events.get_turn = () => { return f.game.get_turn(); }; f.events.get_year = () => { return f.game.get_year(); };
 f.events.get = (name) => { return f.game.get(name); };
 f.events.is_started = f.game.is_started; f.events.is_turn_complete = f.game.is_turn_complete;
 const p = {modules: {bottom_bar: {height: 256}, popup: {is_shown: () => { return false; }}}};
 p.root = f.view.root; p.el = f.view.root; p.ui = f.view.ui; p.game = f.events; p.map = f.map;
 p.get_stats_str = (unit) => { return ''; };
 p.maybe_quit = () => {}; p.glsmac = {load_smac_text: (name, format) => {
  if (name == 'menu.txt' || name == 'alphax.txt') { return menu_source(name, format); }
  return f.source.glsmac.load_smac_text(name, format);
 }};
 f.p = p; f.menu = #include('../default/ui/parts/game/menu/menu'); p.modules.menu = f.menu; f.menu.init(p);
 f.entry = () => {
  for (entry of f.menu.headers[1].entries) { if (#is_defined(entry.source_index) && entry.source_index == 7) { return entry; } }
  throw Error('Missing source HQ slot7');
 };
 f.open_menu = (observe) => {
  f.menu.open('left_menu'); if (#is_defined(observe)) { observe('base-flow-menu'); }
  f.menu.menus.left_menu.items[1].el.emit('click', {}); if (#is_defined(observe)) { observe('base-flow-hq'); }
  for (row of f.menu.menus.left_menu_hq.items) {
   if (#is_defined(row.entry.source_index) && row.entry.source_index == 7) { row.el.emit('click', {}); return; }
  }
  throw Error('Missing mounted HQ source7');
 };
 f.base = null;
 for (base of f.game.bm.get_bases()) { if (base.get_owner().id == f.game.get_player().id) { f.base = base; } }
 p.sections = {}; p.sections.object_preview = {order_focus_id: null, selected_unit_id: null, show: (object) => {}};
 p.modules.bottom_bar.pp = p;
 f.events.select_tile = (tile) => { const e = {}; e.tile = tile; f.events.emit('tile_select', e); f.map.emit('tile_preview', e); };
 f.events.select_unit = (unit) => { const e = {}; e.unit = unit; f.events.emit('unit_select', e); f.map.emit('unit_preview', e); };
 // Declared frontend notification transport: FR_BASE_SELECT calls
 // BaseManager::SelectBase, which runs UpdateTilePreview, then emits
 // base_preview/base_select.
 // These notifications carry native wrappers; they perform no native writes.
 f.events.select_base = (base) => {
  const tile = {}; tile.tile = base.get_tile(); f.map.emit('tile_preview', tile);
  const e = {}; e.base = base; f.map.emit('base_preview', e); f.events.emit('base_select', e);
 };
 f.requests = []; f.delivered = 0; f.defer = false;
 f.events.event = (name, data) => { const request = {name: name}; request.data = data; f.requests :+ request; };
 f.deliver = (index, accepted) => {
  const request = f.requests[index];
  const handler = #include('../default/game/event/' + request.name);
  const e = {caller: f.game.get_player().id}; e.game = f.game; e.data = request.data;
  let success = accepted;
  if (success) {
   const error = handler.validate(e);
   if (#is_defined(error)) { success = false; } else { f.native.with_write(() => { e.applied = handler.apply(e); }); }
  }
  const result = {name: request.name, caller: e.caller, success: success}; result.data = request.data;
  f.events.emit('event_result', result);
 };
 f.flush = () => {
  for (timer of f.view.timers) { if (timer.running && timer.interval == 0) { timer.tick(); } }
  if (!f.defer) { while (f.delivered < #sizeof(f.requests)) { const index = f.delivered; f.delivered = f.delivered + 1; f.deliver(index, true); } }
 };
 const management = #include('../default/ui/parts/game/popup/base_screen');
 const bar = #include('../default/ui/parts/game/popup/base_screen/bottom_bar');
 management.available_sections = ['energy', 'bottom_bar', 'buttons']; bar.available_parts = ['middle_area', 'production'];
 f.popup = #include('../default/ui/parts/game/popup/popup'); p.modules.popup = f.popup;
 f.popup.available_popups = ['base_screen', 'base_operations', 'turn_confirmation']; f.popup.no_sliding = true; f.popup.init(p);
 for (name of ['nutrients', 'economy', 'game_state', 'facilities', 'resources', 'middle_area']) {
  management.sections[name] = {set: (data) => {}, set_commerce: (data) => {}, set_energy_grid: (data) => {}};
 }
 bar.parts.queue = {set: (data) => {}};
 f.management = management;
 f.list = #include('../default/ui/parts/game/bottom_bar/objects_list'); f.list.init(p); p.sections.objects_list = f.list;
 f.controller = #include('../default/ui/parts/game/base_operations'); p.modules.base_operations = f.controller; f.controller.init(p);
 f.report = #include('../default/ui/parts/game/popup/base_operations');
 f.row = () => { return f.report.rows[0]; };
 f.double_click = () => { f.row().el.emit('click', {}); f.row().el.emit('click', {}); f.flush(); };
 f.escape = () => { f.popup.popup.el.emit('keydown', {code: 'ESCAPE', modifiers: {}}); f.flush(); };
 return f;
};
