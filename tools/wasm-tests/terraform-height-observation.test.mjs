// Protocol/presentation tests only; synthetic packets are never candidate
// gameplay or original-game evidence.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {HeightPresentation,completedHeightKey,verifyHeightCapture,nativeHeightWorld,auditPaidLandHeight,verifyHeightFinalization} from './terraform-height-observation.mjs';
const edge=(seq,kind,data,target='node')=>({seq,kind,data,target});

test('height key receipt links raw SDL ingress to normalized completed dispatch',()=>{
  const input=[edge(3,'input.ingress',{ingress:7,type:'keydown',keycode:112,scancode:19,mod:192}),
    edge(4,'input.dispatch',{ingress:7,phase:'begin',type:'keydown',code:'P',modifiers:6}),
    edge(5,'input.dispatch',{ingress:7,phase:'end',handled:true})];
  assert.equal(completedHeightKey(input,2,'P',6).ingress.seq,3);
  assert.equal(completedHeightKey(input,3,'P',6),null);
  assert.equal(completedHeightKey(input.slice(0,2),2,'P',6),null);
  assert.equal(completedHeightKey(input,2,'P',2),null);
  const wrong=structuredClone(input);wrong[2].data.ingress=8;assert.equal(completedHeightKey(wrong,2,'P',6),null);
});

test('height close requires actual hide after the processed input fence',()=>{
  const view=new HeightPresentation();
  view.ingest({enabled:true,dropped:0,events:[edge(1,'node.create',{tag:'$window',parent:null},'dialog'),edge(2,'semantic.role',{role:'dialog',source:'game.popup.terraforming_height'},'dialog'),edge(3,'node.show',{},'dialog')]});
  assert.equal(view.dialog(),'dialog');assert.equal(view.hiddenAfter('dialog',3),false);
  view.ingest({enabled:true,dropped:0,events:[edge(4,'node.hide',{},'dialog')]});
  assert.equal(view.hiddenAfter('dialog',3),true);assert.equal(view.hiddenAfter('dialog',4),false);
  assert.throws(()=>view.dialog());
  view.ingest({enabled:true,dropped:0,events:[edge(5,'node.show',{},'dialog')]});
  assert.equal(view.hiddenAfter('dialog',3),false);
});

test('button geometry comes from one actual native label and finite effective bounds',()=>{
  const view=new HeightPresentation();
  const node=(id,seq)=>[edge(seq,'node.create',{tag:'$button',parent:null},id),edge(seq+1,'node.show',{},id),edge(seq+2,'node.property',{key:'text',value:'MENU'},id),edge(seq+3,'semantic.geometry',{area:'effective',left:12,top:14,right:80,bottom:32},id)];
  view.ingest({enabled:true,dropped:0,events:node('menu',1)});
  assert.deepEqual(view.textButton('MENU',{width:100,height:100}).bounds,{area:'effective',left:12,top:14,right:80,bottom:32});
  assert.throws(()=>view.textButton('MENU',{width:60,height:100}));
  view.ingest({enabled:true,dropped:0,events:node('other',5)});assert.throws(()=>view.textButton('MENU',{width:100,height:100}));
});

function capture(){return{query:1,query_owner:{query:1,actor:8,owner:0,turn:1,session:2,dialog_generation:3,scope:'height'},ui:{actor:8,owner:0,turn:1,session:2,dialog_generation:3,modal:true},world:{players:Array.from({length:7},(_,id)=>({id})),units:Array.from({length:8},(_,id)=>({id})),bases:Array.from({length:7},(_,id)=>({id})),terrain_trace:{policy:{version:1,ignore_technologies:true},tiles:Object.fromEntries(Array.from({length:128},(_,id)=>[String(id),{opaque:'retained'}])),ui:{native:'retained'}}}};}

test('full height capture rejects stale owner/session/query and missing player/tile coverage',()=>{
  const key={end:{data:{handled:true}}};verifyHeightCapture(capture(),0,key);
  for(const mutate of [r=>r.query_owner.session++,r=>r.query_owner.owner++,r=>r.world.players.pop(),r=>delete r.world.terrain_trace.tiles['127'],r=>r.query_owner.scope='root']){
    const row=capture();mutate(row);assert.throws(()=>verifyHeightCapture(row,0,key));
  }
  assert.throws(()=>verifyHeightCapture(capture(),1,key));
  assert.throws(()=>verifyHeightCapture(capture(),0,{end:{data:{handled:false}}}));
});

test('native-only projection removes only UI and preserves every unknown native field',()=>{
  const row=capture();row.world.unrecognized={float:-0,fields:[1,'unchanged',null]};
  const native=nativeHeightWorld(row);assert.equal(native.terrain_trace.ui,undefined);
  assert.ok(Object.is(native.unrecognized.float,-0));assert.deepEqual(native.unrecognized.fields,row.world.unrecognized.fields);
  assert.equal(row.world.terrain_trace.ui.native,'retained');
});

function paidPair(){
  const tile={x:2,y:2,elevation:{center:240,left:64,top:64,right:64,bottom:64},neighbors:{W:null},terrain_epoch:0,
    canonical:{active:false,elevation:null,is_water:null,unknown:'preserved'},imported:{active:true,source_corners:[64,64,64,64],source_elevation:240,source_water:false},
    is_land:true,is_water:false,native_type:{domain:'land'},native_height_band:{below_coast:false,below_ocean:false,below_trench:false},resources:{payer:{energy:0}},unknown_native:'untouched'};
  const world={players:[{id:'payer',raw_id:0}],units:[{id:'actor',raw_id:8,movement:1,order:'NO_ORDERS',health:1,morale:2}],
    terrain_trace:{player_details:{payer:{energy:{credits:10,last_income_turn:0,initialized:true},energy_revision:1,unknown:'preserved'}},
      unit_details:{actor:{moved_this_turn:false,work:{action:'',work_units:0,unknown:'preserved'},quotes:{W:{allowed_now:true,reason:null,cost:1}},combat:{defense:1},unknown:'preserved'}},tiles:{'2,2':tile},ui:{different:'allowed'}}};
  const quote={owner:0,unit_id:8,fee:4,source_water:false,destination_water:false,plan:[{x:2,y:2,canonical:{elevation:1500,is_water:false}}]};
  const after=structuredClone(world);after.units[0].movement=0;after.terrain_trace.unit_details.actor.moved_this_turn=true;
  after.terrain_trace.unit_details.actor.quotes.W.allowed_now=false;after.terrain_trace.unit_details.actor.quotes.W.reason='Unit is out of moves';
  after.terrain_trace.player_details.payer.energy.credits=6;after.terrain_trace.player_details.payer.energy_revision=2;
  const changed=after.terrain_trace.tiles['2,2'];changed.elevation.center=1500;changed.terrain_epoch=1;
  Object.assign(changed.canonical,{active:true,elevation:1500,is_water:false});Object.assign(changed.imported,{active:false,source_corners:null,source_elevation:null,source_water:null});
  return{before:{world},after:{world:after},quote};
}

test('full native paid audit permits only the declared fee actor budget and quoted terrain',()=>{
  const pair=paidPair();assert.deepEqual(auditPaidLandHeight(pair.before,pair.after,pair.quote).quoted_tiles,['2,2']);
  const corruptions=[r=>r.world.units[0].health=0.5,r=>r.world.units[0].morale=3,
    r=>r.world.terrain_trace.player_details.payer.unknown='changed',r=>r.world.terrain_trace.player_details.payer.energy.initialized=false,
    r=>r.world.terrain_trace.unit_details.actor.work.unknown='changed',r=>r.world.terrain_trace.unit_details.actor.combat.defense=2,
    r=>r.world.terrain_trace.tiles['2,2'].unknown_native='changed',r=>r.world.terrain_trace.tiles['2,2'].canonical.unknown='changed',
    r=>r.world.terrain_trace.tiles['2,2'].resources.payer.energy=10];
  for(const corrupt of corruptions){const bad=structuredClone(pair.after);corrupt(bad);assert.throws(()=>auditPaidLandHeight(pair.before,bad,pair.quote));}
});

test('native paid audit rejects terrain edits beyond actual patch adjacency',()=>{
  const pair=paidPair();pair.before.world.terrain_trace.tiles['8,8']=structuredClone(pair.before.world.terrain_trace.tiles['2,2']);
  pair.after.world.terrain_trace.tiles['8,8']=structuredClone(pair.before.world.terrain_trace.tiles['8,8']);
  pair.after.world.terrain_trace.tiles['8,8'].elevation.left=65;
  assert.throws(()=>auditPaidLandHeight(pair.before,pair.after,pair.quote));
});

function finalState(){return{sealed:{text:'all retained\n',failure:null},joined:'all retained\n',producerClosed:true,errors:[],
  configuration:{installations:1,barrier:{continued:true},worker_requests:[{continued:true}],callbacks:{first_callback:{runtime_out_bound:true,runtime_err_bound:true,runtime_callMain_present:true}}},
  nativeExit:{body_state:'exited',status_text:'GLSMAC exited (0).',raw_code:0}};}

test('final seal rejects unknown tail late errors incomplete worker ACK and nonzero native status',()=>{
  verifyHeightFinalization(finalState());
  const corruptions=[r=>r.sealed.failure='late read failed',r=>r.joined+='39 late bytes',
    r=>{r.sealed.text+='TH_ERROR|late\n';r.joined=r.sealed.text;},r=>r.errors.push('late barrier rejection'),
    r=>r.configuration.worker_requests.push({continued:false}),r=>r.configuration.callbacks.first_callback.runtime_callMain_present=false,
    r=>r.nativeExit.raw_code=1,r=>r.nativeExit.status_text='GLSMAC exited (1).',r=>r.producerClosed=false];
  for(const corrupt of corruptions){const row=finalState();corrupt(row);assert.throws(()=>verifyHeightFinalization(row));}
});
