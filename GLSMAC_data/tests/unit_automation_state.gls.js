// Native application plan storage; no original automation algorithm claimed.
const behavior = #include('./_behavior');
const plan = (unit, command) => {
 const tile = unit.get_tile();
 return {version:2,command:command,epoch:1,owner:unit.owner + 0,issued_turn:1,last_turn:0,
 target_x:tile.x + 0,target_y:tile.y + 0,origin_x:tile.x + 0,origin_y:tile.y + 0,cursor:0,phase:1};
};
const reject = (f, callback) => {
 const before = f.snapshot(); const updates = f.update_count(); let denied = false;
 try { f.with_write(callback); } catch { : (e) => { denied = true; } }
 test.assert(denied && f.snapshot() == before && f.update_count() == updates);
};
for (command of ['farm_solar_road','farm_mine_road','road_to','tube_to','auto_roads','auto_tubes','auto_sensors','auto_remove_fungus','auto_home_base','auto_former']) {
 behavior.scenario('native durable plan ' + command + ' survives real codec, receiving owner, and copied notification', () => {
  const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id); const value = plan(unit,command);
  f.with_write(() => { unit.set_automation(value); });
  test.assert(unit.get_automation() == value && unit.get_order() == 'AUTOMATE' && !unit.needs_orders());
  value.cursor = 7; const detached = unit.get_automation(); detached.target_x = 99;
  test.assert(unit.get_automation().cursor == 0 && unit.get_automation().target_x != 99);
  const codec = f.unit_order_codec_probe(unit.id);
  test.assert(codec.roundtrip && codec.receiving_owner && codec.source_unchanged && codec.receiver_unchanged);
  const sync = f.unit_order_sync_probe(unit.id); test.assert(sync.spawn && sync.update && sync.copied);
 });
}
behavior.scenario('primitive work and automation intent coexist and clearing work returns to plan orders', () => {
 const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id); const empty_work = unit.get_terraforming();
 const state = {action:'farm',work_units:2,required_work:8,last_turn:1,previous_work_units:0,previous_movement:1.0,previous_moved:false,tile_x:0,tile_y:0,active:true};
 f.with_write(() => { unit.set_automation(plan(unit,'farm_solar_road')); unit.set_terraforming(state); });
 test.assert(unit.get_order() == 'TERRAFORM' && unit.get_automation().command == 'farm_solar_road');
 test.assert(f.unit_order_codec_probe(unit.id).roundtrip);
 f.with_write(() => { unit.set_terraforming(empty_work); });
 test.assert(unit.get_order() == 'AUTOMATE' && !unit.needs_orders());
 reject(f, () => { unit.set_order('HOLD'); });
});
behavior.scenario('native cancellation retains durable epoch and exact empty-state codec', () => {
 const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id); const empty = unit.get_automation(); empty.epoch = 2;
 f.with_write(() => { unit.set_automation(plan(unit,'auto_roads')); unit.set_automation(empty); });
 test.assert(unit.get_automation() == empty && unit.get_order() == 'NO_ORDERS' && unit.needs_orders());
 test.assert(f.unit_order_codec_probe(unit.id).roundtrip);
});
behavior.scenario('native plan mutations are write-guarded and retained methods reject retired identities', () => {
 const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id); const value = plan(unit,'auto_former');
 let denied = false; try { unit.set_automation(value); } catch { : (e) => { denied = true; } }
 test.assert(denied && unit.get_automation().command == '');
 const read = unit.get_automation; const write = unit.set_automation;
 f.with_write(() => { f.game.um.despawn_unit(unit.id); });
 reject(f, () => { read(); }); reject(f, () => { write(value); });
});
let index = 0;
for (invalid of [{key:'version',value:1},{key:'command',value:'missing'},{key:'epoch',value:0},{key:'owner',value:99},
 {key:'issued_turn',value:0},{key:'last_turn',value:(0 - 1)},{key:'target_x',value:99},{key:'target_y',value:1},
 {key:'origin_x',value:(0 - 1)},{key:'cursor',value:1000001},{key:'cursor',value:0.0},{key:'phase',value:2},{key:'phase',value:(0 - 1)}]) {
 behavior.scenario('invalid plan payload is atomic ' + #to_string(index), () => {
  const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id); const value = plan(unit,'auto_roads');
  value[invalid.key] = invalid.value; reject(f, () => { unit.set_automation(value); });
 }); index++;
}
behavior.scenario('native automation rejects extra fields and incomplete input', () => {
 const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id);
 const value = plan(unit,'auto_roads'); value.callback = () => {};
 reject(f, () => { unit.set_automation(value); }); reject(f, () => { unit.set_automation({version:1}); });
 reject(f, () => { unit.get_automation(1); });
});
behavior.scenario('terraforming home is a durable owned-base identity independent of plan cancellation', () => {
 const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id); const base = f.base;
 test.assert(unit.get_terraform_home() == 0);
 f.with_write(() => { unit.set_terraform_home(base.id + 0); unit.set_automation(plan(unit,'auto_home_base')); });
 test.assert(unit.get_terraform_home() == base.id && f.unit_order_codec_probe(unit.id).roundtrip);
 const cleared = unit.get_automation(); cleared.command = ''; cleared.epoch = 2; cleared.owner = 0; cleared.issued_turn = 0;
 cleared.last_turn = 0; cleared.target_x = 0; cleared.target_y = 0; cleared.origin_x = 0; cleared.origin_y = 0; cleared.cursor = 0; cleared.phase = 0;
 f.with_write(() => { unit.set_automation(cleared); });
 test.assert(unit.get_terraform_home() == base.id && f.unit_order_codec_probe(unit.id).roundtrip);
 reject(f, () => { unit.set_terraform_home(9999); }); reject(f, () => { unit.set_terraform_home((0 - 1)); });
});

behavior.scenario('home rollback is native token-fenced and invalidated by a later assignment', () => {
 const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id); let first = 0;
 f.with_write(() => { first = unit.set_terraform_home(f.base.id + 0); });
 unit.validate_terraform_home_rollback(first);
 f.with_write(() => { unit.rollback_terraform_home(first); }); test.assert(unit.get_terraform_home() == 0);
 reject(f, () => { unit.rollback_terraform_home(first); });
 f.with_write(() => { first = unit.set_terraform_home(f.base.id + 0); unit.set_terraform_home(0); });
 reject(f, () => { unit.rollback_terraform_home(first); });
});

behavior.scenario('pending and completed home rendezvous phases survive native receiving-world codecs', () => {
 const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id); const value = plan(unit,'auto_home_base');
 value.phase = 0;
 f.with_write(() => { unit.set_automation(value); });
 test.assert(unit.get_automation().version == 2 && unit.get_automation().phase == 0 && f.unit_order_codec_probe(unit.id).roundtrip);
 value.phase = 1; f.with_write(() => { unit.set_automation(value); });
 test.assert(unit.get_automation().phase == 1 && f.unit_order_codec_probe(unit.id).roundtrip);
});
