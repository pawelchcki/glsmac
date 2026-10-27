// Replay actual native presentation observations. No layout model, guessed
// source ordinal or synthetic geometry may authorize an input target.
import assert from 'node:assert/strict';
export class TerraformGeometry {
  constructor(){this.nodes=new Map();this.sequence=0;}
  ingest(packet){
    assert.equal(packet.enabled,true);assert.equal(packet.dropped,0);
    assert.ok(Array.isArray(packet.events));
    for(const event of packet.events){
      assert.ok(Number.isInteger(event.seq)&&event.seq>this.sequence,'Native presentation sequence must advance');this.sequence=event.seq;
      const node=this.nodes.get(event.target)||{properties:{}};this.nodes.set(event.target,node);
      if(event.kind==='node.destroy'){this.nodes.delete(event.target);continue;}
      if(event.kind==='node.create'){node.tag=event.data.tag;node.parent=event.data.parent;}
      if(event.kind==='node.attach')node.parent=event.data.parent;
      if(event.kind==='semantic.role'){node.role=event.data.role;node.source=event.data.source;}
      if(event.kind==='node.property')node.properties[event.data.key]=event.data.value;
      if(event.kind==='semantic.geometry'&&event.data.area==='effective')node.effective=structuredClone(event.data);
    }
  }
  button(role,source,label,viewport){
    const found=[...this.nodes].filter(([,node])=>node.role===role&&node.source===source);
    assert.equal(found.length,1,`Exactly one actual native ${role}/${source}`);
    const [id,node]=found[0];assert.equal(node.tag,'$button');assert.equal(node.properties.text,label);
    const bounds=node.effective;assert.ok(bounds,'Native effective bounds are required');
    for(const key of ['left','top','right','bottom'])assert.ok(Number.isFinite(bounds[key]),`Native finite ${key}`);
    assert.ok(bounds.left>=0&&bounds.top>=0&&bounds.right<=viewport.width&&bounds.bottom<=viewport.height,'Native target lies inside the viewport');
    assert.ok(bounds.right>bounds.left&&bounds.bottom>bounds.top,'Native target has positive area');
    return {id,role,source,label,bounds:structuredClone(bounds),x:(bounds.left+bounds.right)/2,y:(bounds.top+bounds.bottom)/2};
  }
  assertPointerHit(packet,target){
    const within=id=>{const visited=new Set();while(id!=null&&!visited.has(id)){if(id===target.id)return true;visited.add(id);id=this.nodes.get(id)?.parent;}return false;};
    assert.ok(packet.events.some(event=>event.kind==='input.ui-transition'&&event.data.type==='mouseover'&&within(event.target)),`Actual SDL pointer must enter native ${target.source}`);
  }
}

export function nativeToCanvas(x,y,viewport,box){
  assert.ok(Number.isFinite(x)&&Number.isFinite(y));
  assert.ok(viewport.width>0&&viewport.height>0&&box.width>0&&box.height>0);
  return {x:box.x+box.width*x/viewport.width,y:box.y+box.height*y/viewport.height};
}
