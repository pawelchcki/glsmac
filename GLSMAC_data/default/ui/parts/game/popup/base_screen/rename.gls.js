const source = #include('../../../../../game/base_rename_dialog');
return {
 init: (p) => {
  this.p = p; this.session = null; this.waiting = null; this.next_token = 0; this.dialog = null;
  p.owner.listen(p.game, 'event_result', (e) => {
   const pending = this.waiting;
   if (pending == null || e.name != 'rename_base' || e.caller != pending.owner || e.data.base_id != pending.base_id || e.data.turn_id != pending.turn_id || e.data.request_token != pending.token || e.data.previous_name != pending.previous_name || e.data.name != pending.draft) { return; }
   this.waiting = null;
   if (!e.success && this.resolve(pending) != null) { this.open(pending.draft); }
  });
 },
 close_draft: () => {
  const dialog = this.dialog; this.dialog = null; this.session = null; this.p.set_dialog(null);
  if (dialog != null) { dialog.frame.remove(); }
 },
 cancel: () => { this.waiting = null; this.close_draft(); },
 resolve: (session) => {
  if (!this.p.is_open() || this.p.get_base() != session.base || this.p.game.get_turn() != session.turn_id) { return null; }
  for (base of this.p.game.get_bm().get_bases()) {
   if (base.id == session.base_id && base == session.base && base.get_owner().id == session.owner && base.name == session.previous_name) { return base; }
  }
  return null;
 },
 refresh: () => {
  if (this.session != null && this.resolve(this.session) == null) { this.cancel(); }
 },
 commit: (session) => {
  if (this.session == null || this.session.token != session.token || this.waiting != null) { return; }
  const base = this.resolve(session); if (base == null) { this.cancel(); return; }
  const value = this.dialog.input.value;
  if (#typeof(value) != 'String') { this.cancel(); return; }
  session.draft = value; this.waiting = session;
  this.close_draft();
  this.p.game.event('rename_base', {base_id: session.base_id, turn_id: session.turn_id, request_token: session.token, previous_name: session.previous_name, name: value});
 },
 open: (draft) => {
  if (this.waiting != null || !this.p.is_open()) { return; }
  this.close_draft(); const base = this.p.get_base();
  if (base == null || base.get_owner().id != this.p.game.get_player().id) { return; }
  const turn = this.p.game.get_turn();
  if (#is_defined(base.validate_rename(this.p.game.get_player().id, turn, base.name, base.name))) { return; }
  const definition = source.load(this.p.glsmac, base.name);
  this.next_token = this.next_token + 1;
  const token = this.next_token;
  const session = {token: token, owner: base.get_owner().id, base_id: base.id, turn_id: turn, previous_name: base.name}; session.base = base;
  this.session = session;
  const frame = this.p.ui.root.window({class: 'default-panel', width: 440, height: 160, align: 'center', zindex: 0.95, blocker: 'rgba(0,0,0,120)', header_height: 0});
  const dialog = {}; dialog.frame = frame;
  dialog.caption = frame.text({class: 'base-screen-frame-title', text: definition.caption, left: 12, top: 10, align: 'top left'});
  dialog.prompt = frame.text({class: 'base-screen-frame-text', text: definition.prompt, left: 12, top: 40, align: 'top left'});
  dialog.label = frame.text({class: 'base-screen-frame-text', text: definition.label, left: 12, top: 78, align: 'top left'});
  dialog.input = frame.input({class: 'popup-input', left: 80, top: 72, width: 348, height: 26, max_length: 24, value: #typeof(draft) == 'String' ? draft : base.name});
  dialog.ok = frame.button({class: 'game-popup-button', text: definition.buttons[0], left: 12, top: 116, width: 198, height: 24});
  dialog.cancel = frame.button({class: 'game-popup-button', text: definition.buttons[1], left: 230, top: 116, width: 198, height: 24});
  this.dialog = dialog; this.p.set_dialog(dialog);
  dialog.input.on('input', (e) => { this.commit(session); return true; });
  dialog.ok.on('click', (e) => { this.commit(session); return true; });
  dialog.cancel.on('click', (e) => { if (this.session != null && this.session.token == session.token) { this.cancel(); } return true; });
  frame.on('keydown', (e) => {
   if (this.session == null || this.session.token != session.token) { return true; }
   if (e.modifiers == {}) {
    if (e.code == 'ESCAPE') { this.cancel(); }
    else if (e.code == 'ENTER') { this.commit(session); }
   }
   return true;
  });
  frame.on('remove', (e) => { if (this.dialog == dialog) { this.dialog = null; this.session = null; this.p.set_dialog(null); } });
 },
};
