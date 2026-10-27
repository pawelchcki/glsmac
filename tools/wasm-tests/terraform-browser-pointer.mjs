import assert from 'node:assert/strict';

// Match native SDL ingress and the whole application dispatch, not Playwright's
// delivery completion. Button.cpp emits click inside EV_MOUSE_UP.
export function completedNativeClick(events,fence,target){
  assert.ok(Number.isInteger(fence));
  const inside=data=>target.bounds
    ? data.x>=target.bounds.left&&data.x<target.bounds.right&&data.y>=target.bounds.top&&data.y<target.bounds.bottom
    : data.x===target.x&&data.y===target.y;
  const begin=(e,type)=>e.kind==='input.dispatch'&&e.data.phase==='begin'&&e.data.type===type&&e.data.button===1;
  const ingressFor=e=>events.find(i=>i.seq>fence&&i.seq<e.seq&&i.kind==='input.ingress'&&i.data.ingress===e.data.ingress&&i.data.type===e.data.type&&i.data.button===1&&i.data.x===e.data.x&&i.data.y===e.data.y);
  const endFor=e=>events.find(i=>i.seq>e.seq&&i.kind==='input.dispatch'&&i.data.phase==='end'&&i.data.ingress===e.data.ingress);
  for(const down of events.filter(e=>e.seq>fence&&begin(e,'mousedown')&&inside(e.data))){
    const down_ingress=ingressFor(down),down_end=endFor(down);if(!down_ingress||!down_end)continue;
    for(const up of events.filter(e=>e.seq>down_end.seq&&begin(e,'mouseup')&&e.data.x===down.data.x&&e.data.y===down.data.y)){
      const up_ingress=ingressFor(up),end=endFor(up);
      if(up_ingress&&end)return{down_ingress,down,down_end,up_ingress,up,end};
    }
  }
  return null;
}

export function nativeHover(events,fence,hitNodes,bounds){
  return events.find(e=>e.seq>fence&&e.kind==='input.ui-transition'&&e.data.type==='mouseover'&&hitNodes.includes(e.target)
    &&e.data.x>=bounds.left&&e.data.x<bounds.right&&e.data.y>=bounds.top&&e.data.y<bounds.bottom)??null;
}
