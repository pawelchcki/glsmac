// Staged harness lifetime and no-progress contract, not game/original parity.
const behavior = #include('./_behavior');
const mocks = #include('./_ui_mocks');
test.assert(#typeof(test.stage) == 'Callable' && test.stage_version == 1,'This native runtime lacks script staging v1');
const group_order = [];
const scene = {f:null,unit:null,view:null,node:null,finite:null,poll:null,events:0,clicks:0,timer_calls:0,poll_calls:0,cleanup_calls:0,before:'',rng:'',pending:0,unit_id:0,mp_bits:0};
test.stage_cleanup('scene-owned-resources',() => {
 scene.cleanup_calls = scene.cleanup_calls + 1;
 if (scene.poll != null) { scene.poll.stop(); }
 if (scene.view != null) { scene.view.root.remove(); }
});
// Registered before the case-END: a failed final check cannot print case PASS.
test.after_stages('verify-clean-finish',() => {
 test.assert(scene.cleanup_calls == 1 && scene.node.removed && scene.timer_calls == 1 && scene.poll_calls == 0);
 test.assert(scene.f.snapshot() == scene.before && scene.f.inspect().rng == scene.rng && scene.f.inspect().pending_events == 0);
 test.assert(scene.unit == scene.f.game.get_um().get_unit(scene.unit_id) && #float_bits(scene.unit.movement) == scene.mp_bits);
});
const setup = () => {
 scene.f = test.founding_fixture(); const f = scene.f; scene.unit_id = f.unit_id + 0;
 scene.unit = f.game.get_um().get_unit(scene.unit_id); scene.mp_bits = #float_bits(scene.unit.movement);
 scene.view = mocks.display(); scene.node = scene.view.root.button({text:'same scene'});
 scene.node.on('click',(e) => { scene.clicks = scene.clicks + 1; test.assert(scene.unit.id == scene.unit_id); return true; });
 f.game.register_event('stage_pending_probe',{validate:(e) => {},apply:(e) => { scene.events = scene.events + 1; },rollback:(e) => {}});
 f.game.event('stage_pending_probe',{});
 scene.before = f.snapshot(); scene.rng = f.inspect().rng + ''; scene.pending = f.inspect().pending_events;
 scene.finite = #async(0,() => { scene.timer_calls = scene.timer_calls + 1; return false; });
 scene.poll = #async(0,() => { scene.poll_calls = scene.poll_calls + 1; return true; });
 test.assert(scene.pending == 1 && scene.events == 0 && scene.timer_calls == 0 && scene.poll_calls == 0);
};
const observe = () => {
 test.assert(scene.f.snapshot() == scene.before && scene.f.inspect().rng == scene.rng && scene.f.inspect().pending_events == scene.pending);
 test.assert(scene.events == 0 && scene.timer_calls == 0 && scene.poll_calls == 0,'Collection boundaries never process native events or due timers');
 test.assert(scene.unit == scene.f.game.get_um().get_unit(scene.unit_id) && !scene.node.removed);
 scene.node.emit('click',{}); test.assert(scene.clicks == 1);
};
const explicit_native_action = () => {
 scene.f.process_events(); test.assert(scene.events == 1 && scene.f.inspect().pending_events == 0);
 test.assert(scene.timer_calls == 0 && scene.poll_calls == 0 && scene.f.snapshot() == scene.before);
};
const final_observation = () => {
 test.assert(scene.unit == scene.f.game.get_um().get_unit(scene.unit_id) && #float_bits(scene.unit.movement) == scene.mp_bits);
 test.assert(scene.f.snapshot() == scene.before && scene.f.inspect().rng == scene.rng && !scene.node.removed);
 test.assert(scene.timer_calls == 0 && scene.poll_calls == 0);
};
test.after_stages('verify-group-cleanup-order-and-lifetime',() => {
 test.assert(group_order == ['first','second'] && scene.cleanup_calls == 1 && scene.node.removed);
 test.assert(scene.timer_calls == 1 && scene.poll_calls == 0 && scene.clicks == 2);
 test.assert(scene.f.snapshot() == scene.before && scene.f.inspect().rng == scene.rng);
});
behavior.scenario_staged('rooted native world UI and callbacks survive collection without implicit progress',[
 {label:'setup',run:setup},{label:'observe-identity',run:observe},{label:'explicit-native-action',run:explicit_native_action},{label:'final-observation',run:final_observation},
]);

const group_cases = [];
const first_case = {name:'grouped first case preserves the same live native identity and callback'};
first_case.run = () => {
 group_order :+ 'first';
 test.assert(scene.unit == scene.f.game.get_um().get_unit(scene.unit_id) && !scene.node.removed);
 scene.node.emit('click',{}); test.assert(scene.clicks == 2 && scene.timer_calls == 0 && scene.poll_calls == 0);
};
group_cases :+ first_case;
const second_case = {name:'grouped second case follows the first without implicit timer or native progress'};
second_case.run = () => {
 test.assert(group_order == ['first'] && scene.clicks == 2); group_order :+ 'second';
 test.assert(scene.f.snapshot() == scene.before && scene.f.inspect().rng == scene.rng && scene.f.inspect().pending_events == 0 &&
  #float_bits(scene.unit.movement) == scene.mp_bits && scene.timer_calls == 0 && scene.poll_calls == 0);
};
group_cases :+ second_case;
behavior.group_staged(group_cases);
