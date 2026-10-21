const resolve = (game, id) => {
 for (base of game.get_bm().get_bases()) { if (base.id == id) { return base; } }
 return null;
};
return {
 validate: (e) => {
  const d = e.data;
  if (#typeof(d.base_id) != 'Int' || #typeof(d.turn_id) != 'Int' || #typeof(d.request_token) != 'Int' || d.request_token <= 0 || #typeof(d.previous_name) != 'String' || #typeof(d.name) != 'String') { return 'Invalid base rename request'; }
  const base = resolve(e.game, d.base_id); if (base == null) { return 'Base no longer exists'; }
  return base.validate_rename(e.caller, d.turn_id, d.previous_name, d.name);
 },
 apply: (e) => {
  const d = e.data; const base = resolve(e.game, d.base_id); if (base == null) { throw Error('Base no longer exists'); }
  const result = {receipt: base.rename(e.caller, d.turn_id, d.previous_name, d.name)}; result.base = base; return result;
 },
 rollback: (e) => {
  const base = resolve(e.game, e.data.base_id);
  if (base == null || base != e.applied.base) { throw Error('Base rename identity changed'); }
  base.rollback_rename(e.applied.receipt);
 },
};
