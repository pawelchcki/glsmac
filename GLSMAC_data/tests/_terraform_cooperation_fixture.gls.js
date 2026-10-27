// Authored small native worlds, actual production work/events/codec only.
const make = #include('./_terraform_primitives_fixture');
const handler = #include('../default/game/event/unit_terraform');
return (action,water,rate) => {
 const f = make(action,water); const rules = f.game.get('terraforming_rules');
 rules[action].turns = rate; rules[action].sea.turns = rate;
 f.with_write(() => {
  const data = {def:f.former.def + '',health:1.0,morale:2}; data.owner = f.owner; data.tile = f.former.get_tile();
  f.peer = f.game.get_um().spawn_unit(data);
 });
 f.request = (unit,action) => { const e = {caller:unit.owner + 0,data:{unit_id:unit.id + 0,action:action,replace_existing:true}}; e.game = f.game; return e; };
 f.order = (unit,action) => {
  const e = f.request(unit,action); const reason = handler.validate(e); if (#is_defined(reason)) { throw Error(reason); }
  f.with_write(() => { e.applied = handler.apply(e); });
  f.former = f.game.get_um().get_unit(f.former.id); f.peer = f.game.get_um().get_unit(f.peer.id); return e;
 };
 f.pause = (unit) => {
  const e = {caller:unit.owner + 0,data:{unit_id:unit.id + 0}}; e.game = f.game;
  const activate = #include('../default/game/event/unit_activate'); const error = activate.validate(e); if (#is_defined(error)) { throw Error(error); }
  f.with_write(() => { e.applied = activate.apply(e); });
  f.former = f.game.get_um().get_unit(f.former.id); f.peer = f.game.get_um().get_unit(f.peer.id); return e;
 };
 return f;
};
