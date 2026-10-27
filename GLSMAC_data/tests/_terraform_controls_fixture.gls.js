// Mounted production controls around an actual native input world. Mock DOM
// emit/transport are declared boundaries; native work supplies every outcome.
const mocks = #include('./_ui_mocks');
const menu_source = () => {
 let source = '';
 for (header of [['GAME',13],['HQ',17],['NETWORK',9],['MAP',21],['ACTION',31],['TERRAFORM',10],['SCENARIO',28],['EDITOR',29],['HELP',22]]) {
  source += '#' + header[0] + '\n&Declared ' + header[0] + '\n';
  for (let index = 0; index < header[1]; index++) { source += '&Declared ' + header[0] + ' ' + #to_string(index) + '|DeclaredKey\n'; }
 }
 return source;
};
const replacement_source = '#MIMIMI\n#caption Declared Ecologist\nReplace ($MINE0) after completion.\nReview replacement.\nCancel.\nContinue.\n#END\n';
const height_source = '#TERRACOSTUP\n#caption Declared Height Up\nPay $NUM0 to {raise} terrain.\nReserves $NUM1.\n#TERRACOSTDOWN\n#caption Declared Height Down\nPay $NUM0 to {lower} terrain.\nReserves $NUM1.\n#TERRAPAY\n#itemlist\nCancel.\nPay $NUM0.\n#END\n';
return (f) => {
 f.view = mocks.display({width:1024,height:768}); f.events = mocks.events(); f.map = mocks.events();
 f.requests = []; f.delivered = 0;
 const game = f.game;
 // The compact native fixture has host slot0 and declares its controlled
 // player as f.owner (slot1). Natural full-world fixtures use the actual
 // native controlled player. This is the declared mock frontend boundary.
 const owner = #is_defined(f.owner) ? f.owner : game.get_player();
 for (field of ['get_um','get_bm','get_tm','get_settings','get_players','get_player','get_turn','get_year','is_started','is_turn_complete','get']) { f.events[field] = game[field]; }
 f.events.get_player = () => { return owner; };
 f.events.event = (name,data) => { const request = {name:name}; request.data = data; f.requests :+ request; };
 f.events.select_unit = (unit) => { const event = {}; event.unit = unit; f.events.emit('unit_select',event); f.map.emit('unit_preview',event); };
 f.events.select_tile = (tile) => { const event = {}; event.tile = tile; f.events.emit('tile_select',event); f.map.emit('tile_preview',event); };
 const p = {modules:{bottom_bar:{height:256}},get_stats_str:(unit) => { return ''; }};
 p.el = f.view.root; p.root = f.view.root; p.ui = f.view.ui; p.game = f.events; p.map = f.map;
 p.ui.get_height = () => { return 768; }; p.ui.get_width = () => { return 1024; };
 p.glsmac = {load_smac_text:(name,format) => {
  if (name == 'menu.txt') { return test.parse_smac_text(menu_source(),format); }
  if (name == 'alphax.txt') { return test.parse_smac_text(#include('./_terraform_action_source'),format); }
  if (name == 'xscript.txt') { return test.parse_smac_text(replacement_source + height_source,format); }
  throw Error('Undeclared Terraform control input');
 }};
 f.menu = #include('../default/ui/parts/game/menu/menu'); p.modules.menu = f.menu;
 f.popup = #include('../default/ui/parts/game/popup/popup'); p.modules.popup = f.popup;
 // Only confirmation views participate in this mounted control boundary.
 f.popup.available_popups = ['terraforming_replacement','terraforming_height']; f.popup.no_sliding = true;
 f.menu.init(p); f.popup.init(p);
 f.preview = #include('../default/ui/parts/game/bottom_bar/object_preview'); f.preview.init(p);
 p.modules.bottom_bar.pp = {sections:{}}; p.modules.bottom_bar.pp.sections.object_preview = f.preview;
 f.events.select_unit(f.former);
 f.open_terraform = () => {
  if (!f.menu.menus.left_menu.is_open) { f.menu.open('left_menu'); }
  f.menu.menus.left_menu.items[5].el.emit('click',{button:'left'});
 };
 f.control = (action) => {
  const child = f.menu.menus.left_menu_terraform; let found = null;
  for (row of child.items) {
   if (#is_defined(row.entry.terraform_action) && row.entry.terraform_action == action) {
    if (found != null) { throw Error('Duplicate action source identity'); } found = row;
   }
  }
  if (found == null || !found.el.is_visible()) { throw Error('Source action is absent from the mounted menu'); }
  return found;
 };
 f.click = (action) => { return f.control(action).el.emit('click',{button:'left'}); };
 f.deliver = () => {
  if (f.delivered >= #sizeof(f.requests)) { throw Error('No actual control request to deliver'); }
  const request = f.requests[f.delivered]; f.delivered = f.delivered + 1;
  const handler = #include('../default/game/event/' + request.name);
  const event = {caller:owner.id + 0}; event.game = game; event.data = request.data;
  const reason = handler.validate(event); if (#is_defined(reason)) { throw Error(reason); }
  f.with_write(() => { event.applied = handler.apply(event); });
  const receipt = {name:request.name,caller:owner.id + 0,success:true}; receipt.data = request.data;
  f.events.emit('event_result',receipt); return event;
 };
 return f;
};
