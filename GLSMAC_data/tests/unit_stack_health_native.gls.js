// Backend-only sanity for the exact browser fixture control. No frontend,
// installed art, combat, all-seven browser-world or original-game credit.
// One top-level behavior instance; nested helpers never import it or finish it.
const behavior = #include('./_behavior');
const make_fixture = () => {
 const f = #include('./_unit_selection_fixture')('stack', undefined, 'Health Native', 16);
 const owner = f.game.get_player(); let actor = null;
 f.with_write(() => {
  const data = {def:'ScoutPatrol',health:1.0,morale:2}; data.owner = owner; data.tile = f.game.get_tm().get_tile(8,8);
  actor = f.game.get_um().spawn_unit(data).id + 0;
 });
 f.actor = actor; f.owner_id = owner.id + 0;
 f.control = #include('./_unit_stack_health_control')(f.game); f.control.bind_actor(actor);
 f.receipts = [];
 f.game.on('event_result',(e) => {
  if (e.name == f.control.command) {
   const row = {name:e.name + '',event_id:e.event_id + '',caller:e.caller + 0,success:e.success,
    name_type:#typeof(e.name),event_id_type:#typeof(e.event_id),caller_type:#typeof(e.caller),success_type:#typeof(e.success),health_type:#typeof(e.data.health)};
   row.data = #clone(e.data);
   if (#typeof(e.data.health) == 'Float') { row.health_bits = #float_bits(e.data.health); }
   f.receipts :+ row; #print('HEALTH_NATIVE_RECEIPT|' + #json_text_exact(row));
  }
 });
 f.valid = () => {
  const turn = f.game.get_turn() + 0; const owner_id = f.owner_id; const id = f.actor; const nonce = f.control.nonce;
  return {unit_id:id,owner_id:owner_id,turn:turn,previous_health_bits:1065353216,health:0.5,nonce:nonce};
 };
 f.rows = () => {
  const rows = [];
  for (id of f.inspect().unit_ids) {
   const unit = f.game.get_um().get_unit(id);
   const tile = unit.get_tile();
   rows :+ {id:unit.id + 0,owner:unit.owner + 0,definition:unit.def + '',morale:unit.morale + 0,health_type:#typeof(unit.health),health_bits:#float_bits(unit.health),
    movement_bits:#float_bits(unit.movement),order:unit.get_order(),x:tile.x + 0,y:tile.y + 0};
  }
  return rows;
 };
 f.submit = (data) => { f.game.event(f.control.command,data); f.process_events(); };
 return f;
};

behavior.scenario('registered native health control accepts exact scalar identity and updates only actor Float health once',() => {
 const f = make_fixture(); const expected = f.rows();
 test.assert(#typeof(f.actor) == 'Int' && #typeof(f.owner_id) == 'Int' && f.game.get_um().get_unit(f.actor).owner == f.owner_id);
 test.assert(#float_bits(f.game.get_um().get_unit(f.actor).health) == 1065353216);
 f.submit(f.valid());
 test.assert(#sizeof(f.receipts) == 1);
 const receipt = f.receipts[0];
 test.assert(receipt.name == f.control.command && receipt.name_type == 'String' && receipt.event_id_type == 'String' && receipt.caller_type == 'Int' && receipt.success_type == 'Bool');
 test.assert(receipt.event_id != '' && receipt.success);
 test.assert(receipt.caller == f.owner_id && receipt.data.owner_id == f.owner_id && receipt.data.unit_id == f.actor && receipt.data.turn == f.game.get_turn() && receipt.data.nonce == f.control.nonce);
 test.assert(receipt.health_type == 'Float' && receipt.health_bits == 1056964608 && receipt.data.previous_health_bits == 1065353216);
 test.assert(#typeof(f.game.get_um().get_unit(f.actor).health) == 'Float' && #float_bits(f.game.get_um().get_unit(f.actor).health) == 1056964608);
 test.assert(f.control.counts() == {applied:1,rolled_back:0});
 for (row of expected) { if (row.id == f.actor) { row.health_bits = 1056964608; } }
 test.assert(f.rows() == expected,'Every other native unit field remains unchanged');
 const snapshot = f.snapshot(); const inspect = #json_text_exact(f.inspect());
 f.submit(f.valid());
 test.assert(#sizeof(f.receipts) == 2 && !f.receipts[1].success && f.receipts[1].event_id != receipt.event_id);
 test.assert(f.snapshot() == snapshot && #json_text_exact(f.inspect()) == inspect && f.rows() == expected && f.control.counts() == {applied:1,rolled_back:0},'One-shot rejection changes no native world or control application count');
});

behavior.scenario('unknown field and invalid scalar or owner requests reject purely before a subsequent valid native event',() => {
 const f = make_fixture(); const snapshot = f.snapshot(); const inspect = #json_text_exact(f.inspect()); const rows = f.rows(); let rejected = 0;
 for (kind of ['unknown-field','owner','actor-type','health-type','nonce']) {
  const data = f.valid();
  if (kind == 'unknown-field') { data.unexpected = true; }
  if (kind == 'owner') { data.owner_id = f.owner_id + 1; }
  if (kind == 'actor-type') { data.unit_id = #to_string(f.actor); }
  if (kind == 'health-type') { data.health = 1; }
  if (kind == 'nonce') { data.nonce = 'foreign'; }
  f.submit(data); const receipt = f.receipts[rejected];
  test.assert(#sizeof(f.receipts) == rejected + 1 && !receipt.success && receipt.caller == f.owner_id && receipt.event_id_type == 'String');
  test.assert(f.snapshot() == snapshot && #json_text_exact(f.inspect()) == inspect && f.rows() == rows,'Rejected event changes no native state, pending update inventory or exact health bits');
  test.assert(f.control.counts() == {applied:0,rolled_back:0});
  rejected++;
 }
 test.assert(rejected == 5,'All invalid inputs must execute; none may terminate the loop');
 f.submit(f.valid()); const accepted = f.receipts[rejected];
 test.assert(#sizeof(f.receipts) == 6 && accepted.success && accepted.caller == f.owner_id && accepted.data.unit_id == f.actor);
 test.assert(accepted.health_type == 'Float' && accepted.health_bits == 1056964608 && #float_bits(f.game.get_um().get_unit(f.actor).health) == 1056964608);
 test.assert(f.control.counts() == {applied:1,rolled_back:0});
});
// gse-worker appends the sole behavior.finish(); no duplicate summary here.
