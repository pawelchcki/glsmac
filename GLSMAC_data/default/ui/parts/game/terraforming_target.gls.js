// Owned map-target intent. The native pointer consumer calls tile_target
// before ordinary map/city/unit selection, so occupied targets are real tiles.
return (p, preview) => {
 const state = {alive: true, epoch: 0, request: null, listener: null};
 const visual = {alive: true, visible: false};
 const hint = p.ui.root.text({text: '', align: 'top center', top: 8, font: 'arialnb.ttf:17', color: 'rgb(176,212,235)'}); hint.hide();
 if (#typeof(hint.presentation_role) == 'Callable') { hint.presentation_role('status', 'game.terraforming.target'); }
 hint.on('remove', () => { visual.alive = false; visual.visible = false; cancel(); });
 const cancel = () => {
  state.epoch = state.epoch + 1; state.request = null;
  if (state.listener != null) { preview.frame.unlisten(state.listener); state.listener = null; }
  if (visual.alive) { hint.hide(); visual.visible = false; }
 };
 const current = () => {
  const request = state.request;
  if (!state.alive || request == null || request.epoch != state.epoch || !preview.is_turn_active ||
   preview.order_pending != null || preview.founding_pending_id != null || p.modules.popup.is_shown() ||
   p.game.get_turn() != request.turn || p.game.get_player().id != request.owner ||
   !p.game.get_um().has_unit(request.unit_id) || preview.selected_unit_id != request.unit_id) { return false; }
  const unit = p.game.get_um().get_unit(request.unit_id);
  if (unit != request.unit || unit.owner != request.owner || unit.get_automation().epoch != request.plan_epoch) { return false; }
  const tile = unit.get_tile();
  return tile.x == request.x && tile.y == request.y && unit.movement == request.movement && unit.health == request.health;
 };
 preview.frame.on('remove', () => {
  // Native Object::Destroy has already detached frame-owned listeners.
  state.listener = null; cancel(); state.alive = false;
  // Root Clear iterates a snapshot of its children. Do not synchronously
  // destroy a sibling from this callback; its owned timer is cancelled if
  // the root removes the hint itself before the next event-loop iteration.
  if (visual.alive) { hint.timer(0, () => { if (visual.alive) { hint.remove(); } return false; }); }
 });
 const on_pointer = (e) => {
  if (state.request == null) { return false; }
  if (!current() || !#is_defined(e.tile) || #classof(e.tile) != 'Tile') { cancel(); return false; }
  const tile = p.game.get_tm().get_tile(e.tile.x, e.tile.y);
  if (tile != e.tile) { cancel(); return false; }
  const destination = tile.get_base();
  if (destination == null || destination.get_owner().id != state.request.owner) {
   hint.text = 'Choose an owned destination base (Escape cancels)';
   return true;
  }
  const request = state.request; cancel();
  // No native values are changed here. The event revalidates owner/turn,
  // epoch, geometry, passability and the complete plan before applying it.
  preview.queue_plan(request.unit, request.command, tile, request.plan_epoch);
  return true;
 };
 for (event of ['unit_select', 'tile_select', 'base_select', 'turn', 'event_result']) {
  preview.frame.listen(p.game, event, (e) => { if (state.request != null) { cancel(); } });
 }
 preview.frame.listen(p.game, 'turn_status', (e) => {
  if (e.status != 'active' && e.status != 'turn_complete') { cancel(); }
 });
 const controller = {
  cancel: cancel,
  is_active: () => { return state.alive && state.request != null; },
  begin: (unit, command, plan_epoch, label) => {
   cancel(); if (!state.alive || (command != 'road_to' && command != 'tube_to')) { return false; }
   const tile = unit.get_tile(); const request = {epoch: state.epoch, unit_id: unit.id + 0, owner: unit.owner + 0,
    turn: p.game.get_turn(), x: tile.x + 0, y: tile.y + 0, movement: unit.movement, health: unit.health,
    plan_epoch: plan_epoch, command: command}; request.unit = unit; state.request = request;
   if (!current()) { cancel(); return false; }
   p.modules.menu.close_all(); hint.text = label + ': select owned destination base (Escape cancels)'; hint.show(); visual.visible = true;
   state.listener = preview.frame.listen(p.game, 'tile_target', on_pointer); return true;
  },
  snapshot: () => {
   const request = state.request;
   return request == null ? null : {command: request.command, unit_id: request.unit_id, owner: request.owner,
    turn: request.turn, epoch: request.epoch, plan_epoch: request.plan_epoch, origin_x: request.x, origin_y: request.y,
    hint: hint.text + '', hint_visibility_intent: visual.visible};
  },
 };
 return controller;
};
