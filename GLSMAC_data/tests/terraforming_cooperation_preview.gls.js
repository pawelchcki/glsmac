// Mounted production panel + actual native seven-owner work. Display factories
// and explicit timer dispatch are test boundaries; this is not browser proof.
const behavior = #include('./_behavior');
const mocks = #include('./_ui_mocks');
const preview = #include('../default/ui/parts/game/bottom_bar/object_preview');
const revision = #include('../default/game/terraforming_view_revision');
const scene = {f:null,view:null,events:null,map:null,reads:0,pair:null,third:null,last:'',closed:false};
const command = (name,unit,data) => {
 const e = {caller:unit.owner + 0}; e.game = scene.f.game; e.data = data;
 const handler = #include('../default/game/event/' + name); const reason = handler.validate(e);
 if (#is_defined(reason)) { throw Error(reason); }
 scene.f.with_write(() => { e.applied = handler.apply(e); }); return e;
};
const poll = () => { for (timer of scene.view.timers) { if (timer.interval == 100) { timer.tick(); } } };
const select = (unit) => { const e = {}; e.unit = unit; scene.events.emit('unit_select',e); scene.map.emit('unit_preview',e); };
const pure_poll = () => {
 const before = scene.f.audit_snapshot(); const inventory = #json_text_exact(scene.f.audit_inspect());
 poll(); test.assert(scene.f.audit_snapshot() == before && #json_text_exact(scene.f.audit_inspect()) == inventory,
  'Mounted cooperative progress refresh preserves every native player entity terrain RNG and queue');
};
test.stage_cleanup('remove-mounted-cooperation-preview',() => { if (scene.view != null) { scene.view.root.remove(); } scene.closed = true; });
test.after_stages('cooperation-preview-clean-finish',() => {
 test.assert(scene.closed && scene.f.audit_snapshot() == scene.last);
 for (timer of scene.view.timers) { test.assert(!timer.running,'Panel teardown stops every owned poll'); }
});
const setup = () => {
 scene.f = #include('./_terraform_cooperation_owners_fixture')();
 for (pair of scene.f.cooperation_pairs) { if (pair.owner == 1) { scene.pair = pair; } }
 scene.third = scene.f.cooperation_third; scene.view = mocks.display(); scene.events = mocks.events(); scene.map = mocks.events();
 const game = scene.f.game; const tm = game.get_tm(); const front = scene.events;
 // Counting facade returns actual native values and records expensive terrain
 // reads only; no job/progress/capability answer is supplied by the fixture.
 const tm_reads = {
  get_terrain_state:(x,y) => { scene.reads = scene.reads + 1; return tm.get_terrain_state(x,y); },
  get_terrain_geometry:(x,y) => { scene.reads = scene.reads + 1; return tm.get_terrain_geometry(x,y); },
 };
 front.get_tm = () => { return tm_reads; }; front.get_um = () => { return game.get_um(); }; front.get_bm = () => { return game.get_bm(); };
 front.get_player = () => { return game.get_player(); }; front.get_players = () => { return game.get_players(); };
 front.get_turn = () => { return game.get_turn(); }; front.get_settings = () => { return game.get_settings(); };
 front.is_started = () => { return game.is_started(); }; front.is_turn_complete = (owner) => { return game.is_turn_complete(owner); };
 front.get = (key) => { return game.get(key); };
 front.event = (name,data) => { throw Error('A read-only mounted preview must not issue a command'); };
 const p = {modules:{popup:{is_shown:() => { return false; }},menu:{headers:[]}}};
 p.el = scene.view.root; p.ui = scene.view.ui; p.game = front; p.map = scene.map;
 p.get_stats_str = (unit) => { return ''; }; p.glsmac = {};
 const before = scene.f.audit_snapshot(); preview.init(p); select(scene.pair.first);
 test.assert(scene.f.audit_snapshot() == before && preview.work_progress_label.text == 'Work: 4/10; own 2');
 test.assert(preview.rendered_cohort.own_work_units == scene.pair.first.get_terraforming().work_units && #sizeof(preview.rendered_cohort.participants) == 2);
};
const unchanged = () => {
 const reads = scene.reads; for (let i = 0; i < 10; i++) { pure_poll(); }
 test.assert(scene.reads == reads,'Unchanged progress polling must not call the terrain/cohort search');
 const before = scene.f.audit_snapshot(); const prior = revision.read(scene.f.game);
 revision.changed(scene.f.game);
 test.assert(revision.read(scene.f.game) == prior + 1 && scene.f.audit_snapshot() == before,
  'View-local native custom-global revision is excluded from all gameplay serialization RNG and queues');
 pure_poll(); test.assert(scene.reads > reads); const refreshed = scene.reads; pure_poll(); test.assert(scene.reads == refreshed);
};
const peer_work = () => {
 command('unit_terraform',scene.third,{unit_id:scene.third.id + 0,action:'farm',replace_existing:true});
 pure_poll(); test.assert(preview.work_progress_label.text == 'Work: 6/10; own 2' && preview.rendered_cohort.cohort_work_units == 6);
};
const pause = () => {
 const unit = scene.pair.second;
 scene.pause = command('unit_activate',unit,{unit_id:unit.id + 0});
 pure_poll(); let found = false;
 for (participant of preview.rendered_cohort.participants) { if (participant.unit_id == unit.id) { found = !participant.active && participant.work_units == 2; } }
 test.assert(found && preview.work_progress_label.text == 'Work: 6/10; own 2','Genuine retained paused credit contributes to shared progress');
 const undo = #include('../default/game/event/unit_activate'); scene.f.with_write(() => { undo.rollback(scene.pause); });
 pure_poll(); for (participant of preview.rendered_cohort.participants) { test.assert(participant.active); }
};
const selection = () => {
 for (pair of scene.f.cooperation_pairs) { if (pair.owner == 2) { select(pair.first); } }
 test.assert(preview.work_progress_label.text == 'Work: 4/10; own 2');
 select(scene.pair.first); test.assert(preview.work_progress_label.text == 'Work: 6/10; own 2');
};
const owner_change = () => {
 const game = scene.f.game; const tm = game.get_tm(); const state = tm.get_terrain_state(0,0); const owners = state.terraforming_owners;
 owners.sensor = 1; const improvements = state.terraforming; improvements.sensor = true;
 scene.f.with_write(() => { scene.sensor = tm.apply_terrain([{x:0,y:0,terraforming:improvements,terraforming_owners:owners}],[]); });
 const e = {caller:0,data:{x:0,y:0,improvement:'sensor',from_owner:1,to_owner:2}}; e.game = game;
 const handler = #include('../default/game/event/transfer_terraforming_ownership'); const before = revision.read(game);
 scene.f.with_write(() => { e.applied = handler.apply(e); });
 test.assert(revision.read(game) == before + 1); const reads = scene.reads; pure_poll(); test.assert(scene.reads > reads);
 scene.f.with_write(() => { handler.rollback(e); }); test.assert(revision.read(game) == before + 2);
 pure_poll(); scene.f.with_write(() => { tm.rollback_terrain(scene.sensor); });
};
const complete_and_undo = () => {
 const f = scene.f; const game = f.game; const tile = scene.pair.first.get_tile(); let owner = null;
 for (player of game.get_players()) { if (player.id == 1) { owner = player; } }
 const extra = [];
 f.with_write(() => { for (let i = 0; i < 2; i++) { const input = {def:'Formers',health:1.0,morale:2}; input.owner = owner; input.tile = tile; const spawned = game.get_um().spawn_unit(input); extra :+ (spawned.id + 0); } });
 let receipt = null;
 for (unit_id of extra) { const unit = game.get_um().get_unit(unit_id); receipt = command('unit_terraform',unit,{unit_id:unit_id,action:'farm',replace_existing:true}); }
 pure_poll(); test.assert(preview.work_progress_label == null && preview.rendered_work.action == '' && preview.rendered_cohort == null,
  'A peer completing the shared job clears the selected worker progress without reselection');
 f.with_write(() => { #include('../default/game/event/unit_terraform').rollback(receipt); });
 pure_poll(); test.assert(preview.work_progress_label.text == 'Work: 8/10; own 2');
 // Re-enter the same selection and prove no prior per-read eligibility cache
 // can mask a real terrain change, even when own native work is unchanged.
 const native_before = scene.pair.first.get_terraforming(); const actual = game.get_tm().get_terrain_state(tile.x,tile.y);
 f.with_write(() => { game.get_tm().apply_terrain([{x:tile.x + 0,y:tile.y + 0,moisture:actual.moisture == 1 ? 2 : 1}],[]); });
 select(scene.pair.first);
 test.assert(preview.rendered_cohort == null && scene.pair.first.get_terraforming() == native_before && preview.work_progress_label.text == 'Work: 2/10');
 scene.last = f.audit_snapshot();
};
behavior.scenario_staged('mounted work preview follows actual peer contributions pause completion undo and fresh selection',[
 {label:'native-world-and-panel',run:setup},{label:'unchanged-poll-and-view-only-revision',run:unchanged},
 {label:'actual-peer-credit',run:peer_work},{label:'pause-and-native-undo',run:pause},{label:'selection-cache-isolation',run:selection},
 {label:'actual-improvement-owner-transfer-and-undo',run:owner_change},{label:'peer-completion-undo-and-fresh-terrain',run:complete_and_undo},
]);
