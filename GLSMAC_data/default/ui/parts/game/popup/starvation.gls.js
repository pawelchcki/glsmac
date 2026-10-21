const dialog = #include('../../../../game/starvation_dialog');
const starvation = #include('../../../../game/base_starvation');
return {
 init: (p) => {
  this.active = false; this.generation = 0; this.selected = 0; this.waiting = null; this.request = null;
  const data = p.create(' ', 520, 166, (body, cb) => { this.body = body; this.finish = cb; });
  this.window = data.el; this.header = data.header_text;
  data.on_keydown = (e) => {
   // Shift+Escape leaves this pending notice mounted. Consume it before the
   // generic popup Escape callback can dismiss the authoritative decision.
   if (this.active && e.code == 'ESCAPE' && e.modifiers == {shift: true}) { return true; }
   if (!this.active || e.modifiers != {}) { return false; }
   if (e.code == 'UP') { this.select(0); return true; }
   if (e.code == 'DOWN') { this.select(1); return true; }
   if (e.code == 'ENTER') { this.finish(this.selected); return true; }
   if (e.code == 'ESCAPE') { this.finish(this.selected); return true; }
   return false;
  };
  return data;
 },
 attach: (p, manager) => {
  const show = (request, selected) => {
   const base = starvation.resolve(p.game, request.base_id);
   if (base == null || base.get_owner().id != p.game.get_player().id || this.waiting != null || manager.is_shown()) { return false; }
   const probe = {caller: p.game.get_player().id, data: {base_id: request.base_id, turn_id: request.turn_id, request_token: request.request_token, choice: 0}}; probe.game = p.game;
   if (#is_defined(starvation.validate(probe))) { return false; }
   const definition = dialog.load(p.glsmac, base.name);
   const pending = {base_id: request.base_id, turn_id: request.turn_id, request_token: request.request_token, owner: p.game.get_player().id}; pending.base = base;
   this.request = pending;
   this.set({definition: definition}); this.select(selected);
   manager.show('starvation', (choice) => {
    if (#typeof(choice) != 'Int' || choice < 0 || choice > 1 || this.waiting != null) { return; }
    pending.choice = choice; this.waiting = pending;
    p.game.event('confirm_base_starvation', {base_id: pending.base_id, turn_id: pending.turn_id, request_token: pending.request_token, choice: choice});
   });
   return true;
  };
  this.window.listen(p.game, 'base_starvation', (request) => {
   if (#typeof(request.acknowledgement) != 'Object') { return false; }
   const accepted = show(request, 0);
   if (accepted) { request.acknowledgement.accepted = true; }
   return accepted;
  });
  this.window.listen(p.game, 'base_starvation_cancelled', (e) => {
   const request = this.request;
   if (request == null || request.base_id != e.base_id || request.request_token != e.request_token) { return; }
   this.waiting = null; this.request = null;
   if (manager.is_shown() && manager.popup.id == 'starvation') { manager.clear(); }
  });
  this.window.listen(p.game, 'event_result', (e) => {
   const pending = this.waiting;
   if (pending == null || e.name != 'confirm_base_starvation' || e.caller != pending.owner || e.data.base_id != pending.base_id || e.data.turn_id != pending.turn_id || e.data.request_token != pending.request_token || e.data.choice != pending.choice) { return; }
   this.waiting = null;
   const base = starvation.resolve(p.game, pending.base_id);
   if (!e.success) {
    // A rejected transport result retains the authoritative decision and lets
    // its unchanged owner retry the same actual controls.
    show(pending, pending.choice); return;
   }
   if (!e.success || pending.choice != 0 || pending.turn_id != p.game.get_turn() || pending.owner != p.game.get_player().id || base == null || base != pending.base || base.get_owner().id != pending.owner || manager.is_shown()) { return; }
   p.game.select_base(base);
  });
  this.window.on('remove', () => { this.waiting = null; this.request = null; this.active = false; this.generation = this.generation + 1; });
 },
 select: (index) => {
  this.selected = index; let i = 0;
  for (row of this.rows) { row.border = i == index ? 'rgb(120,164,212),2' : 'transparent,2'; i++; }
 },
 set: (data) => {
  this.generation = this.generation + 1; const generation = this.generation;
  this.body.clear(); this.rows = []; this.texts = [];
  this.header.text = data.definition.caption;
  let top = 10;
  for (line of data.definition.lines) {
   this.texts :+ this.body.text({class: 'game-popup-text', text: line, left: 10, top: top, font: 'arialnb.ttf:16'}); top += 20;
  }
  let index = 0;
  for (text of data.definition.choices) {
   const choice = index;
   const row = this.body.button({class: 'popup-choice', text: text, left: 10, right: 10, top: top + index * 24, height: 22, textalign: 'left'});
   row.on('click', () => { if (this.active && this.generation == generation) { this.select(choice); } return true; });
   this.rows :+ row; index++;
  }
  // Only the immediate observed activation is transferred: acknowledge the
  // native loss and continue to the map. Future preference scope is unobserved.
  this.suppress = this.body.button({class: 'game-popup-button', text: data.definition.buttons[0], left: 10, right: 150, top: 135});
  this.suppress.on('click', () => { if (this.active && this.generation == generation) { this.finish(1); } return true; });
  this.ok = this.body.button({class: 'game-popup-button', text: data.definition.buttons[1], left: 380, right: 10, top: 135, is_ok: true});
  this.ok.on('click', () => { if (this.active && this.generation == generation) { this.finish(this.selected); } return true; });
  this.select(0);
 },
 on_show: () => { this.active = true; },
 on_hide: () => { this.active = false; this.generation = this.generation + 1; },
};
