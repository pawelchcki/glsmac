// Asset-free tests of retained candidate packets and explicit synthetic protocol
// boundaries. They add no live Workshop, original, layout or pixel passing case.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {WorkshopPresentation} from './unit-workshop-presentation.mjs';

const fixture=JSON.parse(readFileSync(new URL('fixtures/unit-workshop-native-base-queue.json',import.meta.url)));
const source='game.popup.base_screen:1:1';
const prepare=()=>{
  const adapter=new WorkshopPresentation();adapter.ingest({enabled:true,dropped:0,events:structuredClone(fixture.events)});
  let seq=fixture.events.at(-1).seq;
  // This annotation is deliberately synthetic. The next actual fixture must
  // emit it from the owned native base-bar frame before authorizing real input.
  const append=(kind,target,data={})=>adapter.ingest({enabled:true,dropped:0,events:[{seq:++seq,kind,target,data}]});
  const annotate=(target=fixture.base_bar,context=source)=>{
    append('semantic.role',target,{role:'workshop-base-bar',source:context});
    append('semantic.part',target,{owner:fixture.base_window,relation:'workshop-base-bar'});
  };
  const target=()=>adapter.buttonInScope('workshop-base-bar',source,'CHANGE',fixture.viewport,{owner:fixture.base_window,relation:'workshop-base-bar'});
  return{adapter,append,annotate,target};
};

test('retained native CHANGE is visible in the base bar and is a sibling of the Window',()=>{
  const{adapter}=prepare();const node=adapter.nodes.get(fixture.change_button);
  assert.equal(node.tag,'$button');assert.equal(node.properties.text,'CHANGE');assert.equal(adapter.visible(fixture.change_button),true);
  assert.equal(adapter.within(fixture.change_button,fixture.base_bar),true);
  assert.equal(adapter.within(fixture.change_button,fixture.base_window),false);
  assert.equal(adapter.unique('dialog','game.popup.base_screen').id,fixture.base_window);
  assert.throws(()=>adapter.buttonInDialog('game.popup.base_screen','CHANGE',fixture.viewport));
});

test('unannotated or unrelated native scope cannot authorize the retained CHANGE target',()=>{
  const{adapter,target}=prepare();assert.throws(target);
  assert.throws(()=>adapter.target('not-native','CHANGE',fixture.viewport));
  assert.throws(()=>adapter.target(fixture.change_button,'unobserved label',fixture.viewport));
});

test('explicit synthetic owned-scope annotation resolves the actual retained node and geometry',()=>{
  const{adapter,annotate,target}=prepare();annotate();const actual=target();
  assert.equal(actual.id,fixture.change_button);assert.deepEqual(actual.bounds,adapter.nodes.get(fixture.change_button).effective);
  assert.equal(actual.x,(actual.bounds.left+actual.bounds.right)/2);assert.equal(actual.y,(actual.bounds.top+actual.bounds.bottom)/2);
});

test('foreign base or stale session annotation is rejected until the exact current scope is observed',()=>{
  const{annotate,target}=prepare();annotate(fixture.base_bar,'game.popup.base_screen:2:1');assert.throws(target);
  annotate(fixture.base_bar,'game.popup.base_screen:1:2');assert.throws(target);annotate();assert.equal(target().id,fixture.change_button);
});

test('the sibling Window cannot substitute for the actual owned base-bar scope',()=>{
  const{annotate,target}=prepare();annotate(fixture.base_window);assert.throws(target);
});

test('duplicate scope identities fail closed',()=>{
  const{annotate,target}=prepare();annotate();annotate(fixture.base_window);assert.throws(target);
});

test('hidden ancestor and destroyed native button cannot authorize a stale target',()=>{
  const{adapter,append,annotate,target}=prepare();annotate();append('node.hide',fixture.base_bar);assert.throws(target);
  append('node.show',fixture.base_bar);assert.equal(target().id,fixture.change_button);
  append('node.destroy',fixture.change_button);assert.ok(adapter.destroyed.has(fixture.change_button));assert.throws(target);
});

test('missing or out-of-viewport native bounds fail closed without guessed geometry',()=>{
  const{adapter,annotate,target}=prepare();annotate();const node=adapter.nodes.get(fixture.change_button),bounds=node.effective;
  delete node.effective;assert.throws(target);node.effective={...bounds,right:fixture.viewport.width+1};assert.throws(target);
  node.effective=bounds;assert.equal(target().id,fixture.change_button);
});

test('unrelated same-label sibling cannot redirect the scoped target and a duplicate inside it rejects',()=>{
  const{adapter,append,annotate,target}=prepare();annotate();
  const button=parent=>{
    append('node.create','synthetic-duplicate',{parent,tag:'$button'});append('node.show','synthetic-duplicate');
    append('node.property','synthetic-duplicate',{key:'text',value:'CHANGE'});
    append('semantic.geometry','synthetic-duplicate',structuredClone(adapter.nodes.get(fixture.change_button).effective));
  };
  button(fixture.base_window);assert.equal(target().id,fixture.change_button);
  append('node.attach','synthetic-duplicate',{parent:fixture.base_bar});assert.throws(target);
});

test('dropped or replayed native packets invalidate the observation stream',()=>{
  const{adapter}=prepare();assert.throws(()=>adapter.ingest({enabled:true,dropped:1,events:[]}));
  assert.throws(()=>adapter.ingest({enabled:true,dropped:0,events:[fixture.events.at(-1)]}));
});

test('a valid role cannot substitute for the exact actual native Window owner and relation',()=>{
  const{append,annotate,target}=prepare();annotate();
  append('semantic.part',fixture.base_bar,{owner:'foreign-window',relation:'workshop-base-bar'});assert.throws(target);
  append('semantic.part',fixture.base_bar,{owner:fixture.base_window,relation:'foreign-relation'});assert.throws(target);
  append('semantic.part',fixture.base_bar,{owner:fixture.base_window,relation:'workshop-base-bar'});assert.equal(target().id,fixture.change_button);
});

test('same-bar owner replacement rejects the old binding until a fresh session is linked to the new Window',()=>{
  const{adapter,append,annotate,target}=prepare();annotate();assert.equal(target().id,fixture.change_button);
  const fresh='game.popup.base_screen:1:2',owner='synthetic-replacement-window';
  append('node.create',owner,{parent:'n1',tag:'$window'});append('node.show',owner);
  const current=()=>adapter.buttonInScope('workshop-base-bar',fresh,'CHANGE',fixture.viewport,{owner,relation:'workshop-base-bar'});
  assert.throws(current);append('semantic.role',fixture.base_bar,{role:'workshop-base-bar',source:fresh});assert.throws(current);
  append('semantic.part',fixture.base_bar,{owner,relation:'workshop-base-bar'});assert.equal(current().id,fixture.change_button);assert.throws(target);
});

const closing=JSON.parse(readFileSync(new URL('fixtures/unit-workshop-native-base-close.json',import.meta.url)));
const closeFixture=()=>{
  const adapter=new WorkshopPresentation();adapter.ingest({enabled:true,dropped:0,events:structuredClone(closing.events)});
  let seq=closing.last_logged_native_sequence;
  // Every appended event is a synthetic protocol boundary. The actual retained
  // producer ended at closed WS_STATE before a later native drain was captured.
  const append=(kind,target=closing.dialog_id)=>adapter.ingest({enabled:true,dropped:0,events:[{seq:++seq,kind,target,data:{}}]});
  return{adapter,append};
};
test('actual closed script state and completed Escape do not imply a captured Native hide',()=>{
  const{adapter}=closeFixture();assert.equal(closing.closed_state.base_open,false);assert.equal(closing.escape.end.data.handled,true);
  assert.equal(adapter.visible(closing.dialog_id),true);assert.equal(adapter.hiddenAfter(closing.dialog_id,closing.escape.begin.seq),false);
});
test('an explicitly synthetic later same-Window hide completes the observation conjunction',()=>{
  const{adapter,append}=closeFixture();append('node.hide');assert.equal(adapter.hiddenAfter(closing.dialog_id,closing.escape.begin.seq),true);
});
test('a foreign, stale, reshown or destroyed node cannot substitute for the fresh same-Window hide',()=>{
  const{adapter,append}=closeFixture();append('node.hide','foreign-window');assert.equal(adapter.hiddenAfter(closing.dialog_id,closing.escape.begin.seq),false);
  append('node.hide');const fence=adapter.hideEvents.get(closing.dialog_id);assert.equal(adapter.hiddenAfter(closing.dialog_id,fence),false);
  append('node.show');assert.equal(adapter.hiddenAfter(closing.dialog_id,closing.escape.begin.seq),false);
  append('node.hide');append('node.destroy');assert.equal(adapter.hiddenAfter(closing.dialog_id,closing.escape.begin.seq),false);
});
