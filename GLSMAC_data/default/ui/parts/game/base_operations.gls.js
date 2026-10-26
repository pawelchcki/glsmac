const load_definition = #include('../../../game/base_operations_dialog');
return {
 init: (p) => {
  this.p = p; this.alive = true; this.epoch = 0; this.session = null;
  const frame = p.modules.popup.popups.base_operations.el;
  frame.on('remove', () => { this.alive = false; this.epoch = this.epoch + 1; this.session = null; });
  frame.listen(p.game, 'update_base', (e) => { this.refresh(); });
  frame.listen(p.game, 'turn', (e) => {
   this.epoch = this.epoch + 1; this.session = null;
   if (p.modules.popup.is_shown() && p.modules.popup.popup.id == 'base_operations') { p.modules.popup.hide('base_operations'); }
  });
 },
 resolve: (id) => {
  for (base of this.p.game.get_bm().get_bases()) {
   if (base.id == id && base.get_owner().id == this.p.game.get_player().id) { return base; }
  }
  return null;
 },
 current: (epoch) => {
  return this.alive && this.session != null && this.epoch == epoch &&
   this.p.game.get_player().id == this.session.owner && this.p.game.get_turn() == this.session.turn;
 },
 rows: () => {
  const result = []; let after = (0 - 1);
  // Persistent IDs provide stable application ordering. Only a one-city list
  // was observed in the original; multi-city sorting is not a parity claim.
  while (true) {
   let found = null;
   for (base of this.p.game.get_bm().get_bases()) {
    if (base.get_owner().id == this.p.game.get_player().id && base.id > after && (found == null || base.id < found.id)) { found = base; }
   }
   if (found == null) { break; }
   after = found.id; const state = found.get_production(); let project = null;
   for (choice of found.get_owner().get_production_choices()) { if (choice.id == state.choice_id) { project = choice; } }
   const row = {id: found.id + 0, name: found.name + '', project: project == null ? '' : project.name + '',
    minerals: state.minerals + 0, cost: project == null ? 0 : project.cost + 0}; row.base = found;
   result :+ row;
  }
  return result;
 },
 display: () => {
  const epoch = this.epoch;
  if (!this.current(epoch) || this.p.modules.popup.is_shown()) { return false; }
  const selected = this.session.selected; const data = {selected: selected}; data.controller = this;
  data.definition = this.session.definition; data.rows = this.rows();
  const identity = this.p.game.get_player().get_faction().identity;
  data.title = #uppercase(identity[3] + ' ' + this.session.definition.title);
  this.p.modules.popup.set('base_operations', data);
  this.p.modules.popup.show('base_operations', (result) => {
   if (!this.current(epoch)) { return; }
   if (#typeof(result) != 'Int') { this.epoch = this.epoch + 1; this.session = null; return; }
   const base = this.resolve(result); if (base == null) { this.display(); return; }
   const section = this.p.modules.bottom_bar.pp.sections.objects_list;
   const controller = this;
   const continuation = {
    can_open: (candidate) => { return controller.current(epoch) && candidate == base && controller.resolve(result) == base && !controller.p.modules.popup.is_shown(); },
    closed: () => { if (controller.current(epoch)) { controller.display(); } },
    rejected: () => { if (controller.current(epoch)) { controller.display(); } },
   };
   section.schedule_base_selection(result, continuation);
  });
  return true;
 },
 open: () => {
  if (!this.alive || this.p.modules.popup.is_shown()) { return false; }
  const definition = load_definition(this.p.glsmac);
  this.epoch = this.epoch + 1;
  const owner = this.p.game.get_player().id + 0; const turn = this.p.game.get_turn() + 0;
  this.session = {owner: owner, turn: turn, selected: null};
  this.session.definition = definition;
  return this.display();
 },
 select: (id) => {
  if (!this.current(this.epoch) || this.resolve(id) == null) { return false; }
  this.session.selected = id + 0; return true;
 },
 refresh: () => {
  const popup = this.p.modules.popup;
  if (!this.current(this.epoch) || !popup.is_shown() || popup.popup.id != 'base_operations') { return; }
  if (this.session.selected != null && this.resolve(this.session.selected) == null) { this.session.selected = null; }
  const selected = this.session.selected; const data = {selected: selected}; data.controller = this;
  data.rows = this.rows(); data.definition = this.session.definition;
  const identity = this.p.game.get_player().get_faction().identity;
  data.title = #uppercase(identity[3] + ' ' + this.session.definition.title);
  popup.set('base_operations', data);
 },
};
