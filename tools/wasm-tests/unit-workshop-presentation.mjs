// Candidate-only adapter for actual native presentation packets. It supplies no
// layout, label inventory, geometry, input simulation or expected game state.
import assert from 'node:assert/strict';
import {TerraformGeometry} from './terraform-browser-geometry.mjs';

export class WorkshopPresentation extends TerraformGeometry {
  constructor(){super();this.choices=new Map();this.fields=new Map();this.parts=new Map();this.hideEvents=new Map();this.destroyed=new Set();this.roles=[];this.focus=null;this.modal=null;}
  ingest(packet){
    super.ingest(packet); // The shared adapter alone owns sequence validation.
    for(const event of packet.events){
      if(event.kind==='node.create'&&this.nodes.has(event.target)&&this.nodes.get(event.target).visible===undefined)this.nodes.get(event.target).visible=false;
      if(event.kind==='semantic.role')this.roles.push({id:event.target,role:event.data.role,source:event.data.source,sequence:event.seq});
      if(event.kind==='semantic.part')this.parts.set(event.target,structuredClone(event.data));
      if(event.kind==='node.create')this.hideEvents.delete(event.target);
      if(event.kind==='node.destroy'){this.hideEvents.delete(event.target);this.destroyed.add(event.target);this.choices.delete(event.target);this.fields.delete(event.target);this.parts.delete(event.target);}
      if(event.kind==='node.show'){this.hideEvents.delete(event.target);if(this.nodes.has(event.target))this.nodes.get(event.target).visible=true;}
      if(event.kind==='node.hide'){this.hideEvents.set(event.target,event.seq);if(this.nodes.has(event.target))this.nodes.get(event.target).visible=false;}
      if(event.kind==='semantic.choices'){
        assert.ok(Number.isInteger(event.data.count)&&event.data.count>=0);
        this.choices.set(event.target,{count:event.data.count,items:new Map()});
      }
      if(event.kind==='semantic.choice'){
        const list=this.choices.get(event.target);assert.ok(list,'Choice membership requires the preceding native count');
        assert.equal(typeof event.data.key,'string');assert.equal(typeof event.data.label,'string');assert.equal(typeof event.data.node,'string');
        assert.ok(!list.items.has(event.data.key),'Duplicate native choice key');list.items.set(event.data.key,structuredClone(event.data));
      }
      if(event.kind==='semantic.field'){
        if(!this.fields.has(event.target))this.fields.set(event.target,new Map());
        this.fields.get(event.target).set(event.data.key,structuredClone(event.data.value));
      }
      if(event.kind==='ui.focus')this.focus=event.data.node;
      if(event.kind==='ui.modal')this.modal=event.data.node;
    }
  }
  within(id,ancestor){
    const visited=new Set();
    while(id!=null&&!visited.has(id)){if(id===ancestor)return true;visited.add(id);id=this.nodes.get(id)?.parent;}
    return false;
  }
  visible(id){
    const visited=new Set();
    while(id!=null&&!visited.has(id)){
      const node=this.nodes.get(id);if(!node||node.visible===false)return false;
      visited.add(id);id=node.parent;
    }
    return id==null;
  }
  hiddenAfter(id,fence){
    assert.ok(Number.isSafeInteger(fence)&&fence>=0);
    return this.nodes.has(id)&&!this.destroyed.has(id)&&!this.visible(id)&&(this.hideEvents.get(id)??0)>fence;
  }
  unique(role,source){
    const matches=[...this.nodes].filter(([id,node])=>node.role===role&&node.source===source&&this.visible(id));
    assert.equal(matches.length,1,`Exactly one visible native ${role}/${source}`);return{id:matches[0][0],node:matches[0][1]};
  }
  buttonInScope(role,source,label,viewport,owner=null){
    const scope=this.unique(role,source);
    if(owner!==null)assert.deepEqual(this.parts.get(scope.id),owner,'Scope must have the exact observed native owner/relation');
    const matches=[...this.nodes].filter(([id,node])=>node.tag==='$button'&&node.properties.text===label&&this.within(id,scope.id)&&this.visible(id));
    assert.equal(matches.length,1,`Exactly one mounted native button ${role}/${source}/${label}`);
    return this.target(matches[0][0],label,viewport);
  }
  buttonInDialog(dialogSource,label,viewport){return this.buttonInScope('dialog',dialogSource,label,viewport);}
  target(id,label,viewport){
    const node=this.nodes.get(id);assert.ok(node&&!this.destroyed.has(id)&&this.visible(id),'Input target must be a live visible native node');
    assert.equal(node.tag,'$button');assert.equal(node.properties.text,label);
    const bounds=node.effective;assert.ok(bounds,'Actual native effective bounds are required');
    for(const key of ['left','top','right','bottom'])assert.ok(Number.isFinite(bounds[key]),`Native finite ${key}`);
    assert.ok(bounds.left>=0&&bounds.top>=0&&bounds.right<=viewport.width&&bounds.bottom<=viewport.height,'Native target is inside viewport');
    assert.ok(bounds.right>bounds.left&&bounds.bottom>bounds.top,'Native target has positive area');
    return{id,label,bounds:structuredClone(bounds),x:(bounds.left+bounds.right)/2,y:(bounds.top+bounds.bottom)/2};
  }
  list(source){
    const {id}=this.unique('workshop-list',source);const list=this.choices.get(id);
    assert.ok(list&&list.items.size===list.count,'Complete actual native choice membership is required');
    return{id,items:[...list.items.values()],selected:this.fields.get(id)?.get('selected')??null};
  }
  choice(source,key,viewport){
    const list=this.list(source);const matches=list.items.filter(item=>item.key===key);
    assert.equal(matches.length,1,`Exactly one actual native choice ${source}/${key}`);
    assert.ok(this.within(matches[0].node,list.id),'Native choice button belongs to its native list');
    return this.target(matches[0].node,matches[0].label,viewport);
  }
  preview(dialogSource,background){
    const dialog=this.unique('dialog',dialogSource);
    const matches=[...this.nodes].filter(([id,node])=>node.properties.background===background&&this.within(id,dialog.id)&&this.visible(id));
    assert.equal(matches.length,1,'Exactly one mounted preview must use the expected existing render resource');
    assert.ok(matches[0][1].effective,'Native preview geometry is required for pixel acquisition');
    return{id:matches[0][0],bounds:structuredClone(matches[0][1].effective),background};
  }
  texts(dialogSource){
    const dialog=this.unique('dialog',dialogSource);
    return[...this.nodes].filter(([id,node])=>node.tag==='$text'&&this.within(id,dialog.id)&&this.visible(id)).map(([,node])=>node.properties.text);
  }
  lifecycle(){return{focus_node:this.focus,modal_node:this.modal,sequence:this.sequence};}
}
