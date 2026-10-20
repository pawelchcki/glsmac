// A mounted owned-city consumer can defer the existing starvation removal.
// Simulations without that consumer retain immediate population processing.
const remove_pop = #include('event/remove_base_pop');
const links = #include('base_work');
const resolve = (game, id) => {
 for (base of game.get_bm().get_bases()) { if (base.id == id) { return base; } }
 return null;
};
const citizens = (base) => {
 const result = [];
 for (pop of base.get_pops()) {
  const row = {id: pop.id, type: pop.get_type()}; row.tile = pop.get('worked_tile'); result :+ row;
 }
 return result;
};
const make_pending = (game, base, pop, token) => {
 const tile = base.get_tile();
 const pending = {turn_id: game.get_turn(), request_token: token, owner: base.get_owner().id,
  pop_id: pop.id, size: base.get_size(), x: tile.x, y: tile.y};
 pending.base = base; pending.citizens = citizens(base); return pending;
};
const validate = (e) => {
 const data = e.data;
 if (#typeof(data.base_id) != 'Int' || #typeof(data.turn_id) != 'Int' || #typeof(data.request_token) != 'Int' || data.request_token <= 0 ||
  #typeof(data.choice) != 'Int' || data.choice < 0 || data.choice > 1) { return 'Invalid starvation confirmation'; }
 const base = resolve(e.game, data.base_id);
 if (base == null) { return 'Starvation base no longer exists'; }
 const pending = base.get('pending_starvation');
 if (!#is_defined(pending) || pending.base != base || pending.owner != e.caller || base.get_owner().id != e.caller) { return 'Starvation confirmation requires its pending owner'; }
 if (data.turn_id != e.game.get_turn() || pending.turn_id != data.turn_id || pending.request_token != data.request_token) { return 'Stale starvation confirmation'; }
 const tile = base.get_tile();
 if (tile.x != pending.x || tile.y != pending.y || tile.get_base() != base || base.get_size() != pending.size || citizens(base) != pending.citizens) { return 'Starvation citizen state changed'; }
 let nutrients = base.get('accumulated_nutrients'); if (!#is_defined(nutrients)) { nutrients = 0; }
 if (nutrients + e.game.get('f_base_get_pending_growth')(base) >= 0) { return 'Base is no longer starving'; }
 let found = false;
 for (pop of base.get_pops()) { if (pop.id == pending.pop_id && links.valid_pop_links(e.game, base, pop)) { found = true; } }
 if (!found) { return 'Starvation citizen is no longer live'; }
};
return {
 resolve: resolve,
 validate: validate,
 pending: (game) => {
  for (base of game.get_bm().get_bases()) { if (base.has('pending_starvation')) { return true; } }
  return false;
 },
 offer: (game, base, pop) => {
  let token = game.get('starvation_request_token'); if (!#is_defined(token)) { token = 0; } token++;
  game.set('starvation_request_token', token);
  base.set('pending_starvation', make_pending(game, base, pop, token));
  const request = {base_id: base.id, turn_id: game.get_turn(), request_token: token};
  // Native trigger copies the outer properties map and returns the last
  // listener's result. Share this nested acknowledgement by assignment so
  // read-only observers cannot undo an actual mounted consumer's acceptance.
  const acknowledgement = {accepted: false}; request.acknowledgement = acknowledgement;
  try { game.trigger('base_starvation', request); }
  catch { : (error) => { base.unset('pending_starvation'); throw error; } }
  const accepted = acknowledgement.accepted;
  if (!accepted) { base.unset('pending_starvation'); }
  return accepted;
 },
 apply: (e) => {
  const error = validate(e); if (#is_defined(error)) { throw Error(error); }
  const base = resolve(e.game, e.data.base_id); const pending = base.get('pending_starvation');
  let victim = null; for (pop of base.get_pops()) { if (pop.id == pending.pop_id) { victim = pop; } }
  const removal = {}; removal.game = e.game; removal.data = {}; removal.data.base = base; removal.data.pop = victim;
  const receipt = {}; receipt.base = base; receipt.pending = pending; receipt.removal = remove_pop.apply(removal);
  receipt.survivors = citizens(base); base.unset('pending_starvation'); return receipt;
 },
 rollback: (e) => {
  const base = resolve(e.game, e.data.base_id); const receipt = e.applied;
  if (base == null || base != receipt.base || base.has('pending_starvation') || base.get_owner().id != receipt.pending.owner || e.game.get_turn() != receipt.pending.turn_id || base.get_size() != receipt.pending.size - 1 || citizens(base) != receipt.survivors) { throw Error('Starvation rollback identity changed'); }
  const removal = {}; removal.game = e.game; removal.data = {}; removal.data.base = base; removal.applied = receipt.removal;
  remove_pop.rollback(removal);
  let restored = null;
  for (pop of base.get_pops()) {
   let original = false; for (row of receipt.survivors) { if (row.id == pop.id) { original = true; } }
   if (!original) { restored = pop; }
  }
  if (restored == null) { throw Error('Starvation rollback citizen missing'); }
  base.set('pending_starvation', make_pending(e.game, base, restored, receipt.pending.request_token));
 },
};
