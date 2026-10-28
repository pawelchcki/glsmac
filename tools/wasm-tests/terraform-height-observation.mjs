// Test-only adaptation of the audited Workshop presentation/query contract.
// Inputs come exclusively from actual native packets, never layout estimates.
import assert from 'node:assert/strict';
import {TerraformGeometry} from './terraform-browser-geometry.mjs';
export const heightFatal=/TH_ERROR|Unhandled exception|Uncaught|Unsupported image format|Assertion failed|Aborted\(|RuntimeError:|(?:worker|Pthread[^\n]*) sent an error!|\[Error\]/i;

export class HeightPresentation extends TerraformGeometry {
  constructor(){super();this.hidden=new Map();}
  ingest(packet){
    super.ingest(packet);
    for(const event of packet.events){
      const node=this.nodes.get(event.target);
      if(event.kind==='node.create'&&node&&node.visible===undefined)node.visible=false;
      if(event.kind==='node.show'){if(node)node.visible=true;this.hidden.delete(event.target);}
      if(event.kind==='node.hide'){if(node)node.visible=false;this.hidden.set(event.target,event.seq);}
      if(event.kind==='node.destroy')this.hidden.delete(event.target);
    }
  }
  within(id,ancestor){const seen=new Set();while(id!=null&&!seen.has(id)){if(id===ancestor)return true;seen.add(id);id=this.nodes.get(id)?.parent;}return false;}
  visible(id){const seen=new Set();while(id!=null&&!seen.has(id)){const node=this.nodes.get(id);if(!node||node.visible===false)return false;seen.add(id);id=node.parent;}return id==null;}
  hiddenAfter(id,fence){return this.nodes.has(id)&&!this.visible(id)&&(this.hidden.get(id)??0)>fence;}
  dialog(){const rows=[...this.nodes].filter(([id,node])=>node.role==='dialog'&&node.source==='game.popup.terraforming_height'&&this.visible(id));assert.equal(rows.length,1);return rows[0][0];}
  choice(index,label,viewport){
    const target=this.button('terraform-height-choice',String(index),label,viewport);
    assert.ok(this.visible(target.id)&&this.within(target.id,this.dialog()));return target;
  }
  ok(viewport){const target=this.button('terraform-height-ok','confirm','OK',viewport);assert.ok(this.visible(target.id)&&this.within(target.id,this.dialog()));return target;}
  textButton(label,viewport){
    const rows=[...this.nodes].filter(([id,node])=>node.tag==='$button'&&node.properties.text===label&&this.visible(id));
    assert.equal(rows.length,1,`Exactly one actual visible button ${label}`);
    const [id,node]=rows[0],bounds=node.effective;assert.ok(bounds);
    for(const key of ['left','top','right','bottom'])assert.ok(Number.isFinite(bounds[key]));
    assert.ok(bounds.left>=0&&bounds.top>=0&&bounds.right<=viewport.width&&bounds.bottom<=viewport.height);
    assert.ok(bounds.right>bounds.left&&bounds.bottom>bounds.top);
    return{id,label,bounds:structuredClone(bounds),x:(bounds.left+bounds.right)/2,y:(bounds.top+bounds.bottom)/2};
  }
}

// Raw SDL ingress carries keycode/scancode/mod; normalized code/modifiers
// belong to native dispatch only. The exact ingress ID links the two records.
export function completedHeightKey(events,fence,code,modifiers){
  for(const begin of events.filter(e=>e.seq>fence&&e.kind==='input.dispatch'&&e.data.phase==='begin'&&e.data.type==='keydown'&&e.data.code===code&&e.data.modifiers===modifiers)){
    const ingress=events.find(e=>e.seq>fence&&e.seq<begin.seq&&e.kind==='input.ingress'&&e.data.type==='keydown'&&e.data.ingress===begin.data.ingress);
    const end=events.find(e=>e.seq>begin.seq&&e.kind==='input.dispatch'&&e.data.phase==='end'&&e.data.ingress===begin.data.ingress);
    if(ingress&&end)return{ingress,begin,end};
  }
  return null;
}

export function nativeHeightWorld(record){const world=structuredClone(record.world);delete world.terrain_trace.ui;return world;}

export function verifyHeightCapture(record,previousQuery,key){
  assert.equal(record.query,previousQuery+1);assert.equal(key.end.data.handled,true);
  assert.equal(record.query_owner.query,record.query);assert.equal(record.query_owner.actor,record.ui.actor);
  assert.equal(record.query_owner.owner,record.ui.owner);assert.equal(record.query_owner.turn,record.ui.turn);
  assert.equal(record.query_owner.session,record.ui.session);assert.equal(record.query_owner.dialog_generation,record.ui.dialog_generation);
  assert.equal(record.query_owner.scope,record.ui.modal?'height':'root');
  assert.equal(record.world.players.length,7);assert.equal(record.world.units.length,8);assert.equal(record.world.bases.length,7);
  assert.equal(Object.keys(record.world.terrain_trace.tiles).length,128);
  assert.deepEqual(record.world.terrain_trace.policy,{version:1,ignore_technologies:true});
}

// A narrow allowed-diff audit for this single empty-arid land/rate1 case.
// Every field not explicitly assigned below must retain its exact value/type.
// No whole player/unit/tile record is replaced by its observed after-state.
export function auditPaidLandHeight(beforeRecord,afterRecord,quote){
  const before=nativeHeightWorld(beforeRecord),after=nativeHeightWorld(afterRecord),expected=structuredClone(before);
  const payer=before.players.find(row=>row.raw_id===quote.owner);assert.ok(payer);
  const actor=expected.units.find(row=>row.raw_id===quote.unit_id);assert.ok(actor);
  assert.equal(quote.source_water,false);assert.equal(quote.destination_water,false);
  actor.movement=0;actor.order='NO_ORDERS';
  const details=expected.terrain_trace.unit_details[actor.id];details.moved_this_turn=true;
  for(const value of Object.values(details.quotes))if(value!==null){value.allowed_now=false;value.reason='Unit is out of moves';}
  const energy=expected.terrain_trace.player_details[payer.id];
  assert.ok(Number.isSafeInteger(energy.energy_revision));
  energy.energy.credits-=quote.fee;energy.energy_revision++;
  const patches=new Map(quote.plan.map(patch=>[`${patch.x},${patch.y}`,patch]));
  assert.equal(patches.size,quote.plan.length);
  const region=new Set(patches.keys());
  for(const key of patches.keys())for(const point of Object.values(before.terrain_trace.tiles[key].neighbors))if(point!==null)region.add(`${point.x},${point.y}`);
  const geometryChanges=[];
  for(const key of region){
    const old=before.terrain_trace.tiles[key],actual=after.terrain_trace.tiles[key],target=expected.terrain_trace.tiles[key];assert.ok(old&&actual&&target);
    const geometryChanged=['left','top','right','bottom'].some(corner=>!Object.is(old.elevation[corner],actual.elevation[corner]));
    const patch=patches.get(key);
    if(!patch&&!geometryChanged)continue;
    // TerrainMutation.cpp renders shared vertices on the actual patch tiles
    // and their native adjacent tiles. Their numeric mesh fidelity is outside
    // this case; canonical centers/classes are still exact from the live plan.
    if(geometryChanged){
      for(const corner of ['left','top','right','bottom']){
        assert.ok(Number.isSafeInteger(actual.elevation[corner])&&actual.elevation[corner]>=-3500&&actual.elevation[corner]<=3500);
        target.elevation[corner]=actual.elevation[corner];
      }
      geometryChanges.push(key);
    }
    target.terrain_epoch=old.terrain_epoch+1;
    target.canonical.active=true;target.canonical.elevation=patch?patch.canonical.elevation:old.elevation.center;
    target.canonical.is_water=patch?patch.canonical.is_water:old.is_water;
    if(patch){
      assert.deepEqual(Object.keys(patch).sort(),['canonical','x','y'],'This land-only case must not silently accept additional effect fields');
      target.elevation.center=patch.canonical.elevation;target.is_water=patch.canonical.is_water;target.is_land=!patch.canonical.is_water;
      target.native_type.domain=patch.canonical.is_water?'sea':'land';
      target.imported.active=false;target.imported.source_corners=null;target.imported.source_elevation=null;target.imported.source_water=null;
      target.native_height_band.below_coast=patch.canonical.elevation<0;
      target.native_height_band.below_ocean=patch.canonical.elevation<-1000;
      target.native_height_band.below_trench=patch.canonical.elevation<-2000;
    }
  }
  assert.deepEqual(after,expected,'Full native height world differs only at the actual payer fee/revision, actor MP/order, quoted canonical terrain and adjacent shared geometry');
  return{quoted_tiles:[...patches.keys()],adjacent_geometry_tiles:geometryChanges,payer:payer.id,actor:actor.id,scope:'exact full-world noninterference; shared corner values observed, no mesh-fidelity claim'};
}

export function verifyHeightFinalization({sealed,joined,producerClosed,errors,configuration,nativeExit}){
  assert.equal(producerClosed,true);assert.equal(sealed.failure,null,'A settled read failure leaves the raw tail unknown');
  assert.equal(joined,sealed.text,'Final raw text must equal every retained final chunk');
  assert.doesNotMatch(sealed.text,heightFatal,'Final suffix must not contain a late native error');
  assert.deepEqual(errors,[]);assert.equal(configuration.installations,1);assert.equal(configuration.barrier.continued,true);
  assert.ok(configuration.worker_requests?.length>0);assert.ok(configuration.worker_requests.every(row=>row.continued===true));
  const callback=configuration.callbacks?.first_callback;assert.ok(callback);
  assert.equal(callback.runtime_out_bound,true);assert.equal(callback.runtime_err_bound,true);assert.equal(callback.runtime_callMain_present,true);
  assert.deepEqual(nativeExit,{body_state:'exited',status_text:'GLSMAC exited (0).',raw_code:0});
}
