import assert from 'node:assert/strict';

// SDL ingress has raw keycode/scancode/SDL modifier bits. Only the completed
// native dispatch carries normalized GSE code/modifiers; never guess a mapping.
export function completedWorkshopKey(events,fence,code,modifiers){
  assert.ok(Number.isSafeInteger(fence)&&fence>=0);assert.equal(typeof code,'string');assert.ok(Number.isSafeInteger(modifiers));
  for(const begin of events.filter(event=>event.seq>fence&&event.kind==='input.dispatch'&&event.data.phase==='begin'&&event.data.type==='keydown'&&event.data.code===code&&event.data.modifiers===modifiers)){
    const ingress=events.find(event=>event.seq>fence&&event.seq<begin.seq&&event.kind==='input.ingress'&&event.data.ingress===begin.data.ingress&&event.data.type===begin.data.type);
    const end=events.find(event=>event.seq>begin.seq&&event.kind==='input.dispatch'&&event.data.phase==='end'&&event.data.ingress===begin.data.ingress);
    if(ingress&&end)return{ingress,begin,end};
  }
  return null;
}
