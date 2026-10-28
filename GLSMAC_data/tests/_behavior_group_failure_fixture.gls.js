// Expected-negative lifecycle probe only, kept outside the passing catalog.
const mocks = #include('./_ui_mocks');
return (behavior,mode) => {
 const scene = {f:null,view:null,poll:null,poll_calls:0,second:false,before:''};
 test.stage_cleanup('group-failure-owned-resource-cleanup',() => {
  if (scene.poll != null) { scene.poll.stop(); }
  if (scene.view != null) { scene.view.root.remove(); }
  test.assert(scene.f != null && scene.f.snapshot() == scene.before && scene.poll_calls == 0);
  test.assert(scene.view.root.removed && scene.second == (mode != 'body'));
  #print('GROUP_NEGATIVE_CLEANUP|' + mode);
  if (mode == 'cleanup') { throw Error('intentional grouped cleanup failure'); }
 });
 test.after_stages('group-negative-forbidden-completion',() => { #print('GROUP_NEGATIVE_UNEXPECTED_COMPLETION'); });
 const cases = []; const first = {name:'group negative first live native body'};
 first.run = () => {
  scene.f = test.founding_fixture(); scene.before = scene.f.snapshot(); scene.view = mocks.display();
  scene.view.root.button({text:'owned group fixture'});
  scene.poll = #async(0,() => { scene.poll_calls = scene.poll_calls + 1; return true; });
  test.assert(scene.f.snapshot() == scene.before && scene.poll_calls == 0);
  #print('GROUP_NEGATIVE_BODY_READY|' + mode);
  if (mode == 'body') { throw Error('intentional grouped body failure'); }
 };
 cases :+ first; const second = {name:'group negative second live native body'};
 second.run = () => { scene.second = true; test.assert(scene.f.snapshot() == scene.before && scene.poll_calls == 0); };
 cases :+ second; behavior.group_staged(cases);
};
