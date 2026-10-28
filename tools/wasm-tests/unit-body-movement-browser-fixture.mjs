// Candidate-only normal movement. No original oracle, duration/pose override or C++ seam.
import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {accessSync,constants,readFileSync,realpathSync,statSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {declaredTerrain} from './terraform-browser-inputs.mjs';
import {stackOrderWorld} from './unit-stack-order-browser-fixture.mjs';
// Metadata/evaluator subprocesses only. Async spawn avoids the independently
// reproduced spawnSync git EPERM setup blocker. No command is inferred successful
// from an Error.status property; success requires actual spawn + close + exit0.
export function movementChild(command,args,{cwd,timeout_ms=10000,term_ms=1000,kill_wait_ms=1000,signal,max_output_bytes=1048576}={}){
  for(const value of [timeout_ms,term_ms,kill_wait_ms,max_output_bytes]){
    if(!Number.isSafeInteger(value)||value<=0)throw Error('Invalid movement child limit');
  }
  return new Promise(resolve=>{
    const started=performance.now();let child=null,settled=false,spawned=false;
    let timeout=null,terminate=null,unknown=null,stopping=false,cancelled=false,timedOut=false,overflow=false;
    let output=[],errors=[],retained=0,spawnError=null;
    const finish=(status,exitSignal,waited)=>{
      if(settled)return;settled=true;clearTimeout(timeout);clearTimeout(terminate);clearTimeout(unknown);
      signal?.removeEventListener('abort',abort);
      resolve({command,args:[...args],cwd,pid:child?.pid??null,spawned,
        status:spawned&&waited?status:null,signal:exitSignal??null,wait_completed:spawned&&waited,
        timed_out:timedOut,cancelled,output_limit:overflow,unknown_wait:spawned&&!waited,
        error:spawnError?String(spawnError.stack||spawnError):null,
        spawn_error_code:spawnError?.code??null,timeout_ms,term_ms,kill_wait_ms,
        elapsed_ms:performance.now()-started,stdout:Buffer.concat(output).toString('utf8'),stderr:Buffer.concat(errors).toString('utf8')});
    };
    const stop=reason=>{
      if(settled||stopping)return;stopping=true;timedOut=reason==='timeout';cancelled=reason==='cancel';overflow=reason==='output';
      if(!child?.pid){finish(null,null,false);return;}
      const send=kind=>{if(child.exitCode!=null||child.signalCode!=null)return;try{child.kill(kind);}catch(error){spawnError??=error;}};
      send('SIGTERM');
      terminate=setTimeout(()=>{if(settled)return;send('SIGKILL');unknown=setTimeout(()=>finish(null,null,false),kill_wait_ms);},term_ms);
    };
    const abort=()=>stop('cancel');
    if(signal?.aborted){cancelled=true;finish(null,null,false);return;}
    signal?.addEventListener('abort',abort,{once:true});
    try{
      child=spawn(command,args,{cwd,stdio:['ignore','pipe','pipe']});
      child.once('spawn',()=>{spawned=true;});
      child.once('error',error=>{spawnError=error;if(!spawned&&!child.pid)finish(null,null,false);else stop('error');});
      child.once('close',(code,exitSignal)=>finish(code,exitSignal,true));
      const collect=(list,data)=>{const available=Math.max(0,max_output_bytes-retained);if(available){list.push(data.subarray(0,available));retained+=Math.min(data.length,available);}if(data.length>available)stop('output');};
      child.stdout.on('data',data=>collect(output,data));child.stderr.on('data',data=>collect(errors,data));
      timeout=setTimeout(()=>stop('timeout'),timeout_ms);
    }catch(error){spawnError=error;finish(null,null,false);}
  });
}
// Current-profile tool inputs only. File hashes bind requested executable paths,
// not executable memory, transitive libraries or independent compiler provenance.
export function movementTool(pin){
  if(!pin||Object.keys(pin).sort().join(',')!=='path,sha256'||typeof pin.path!=='string'||!isAbsolute(pin.path))throw Error('Explicit absolute tool binding required');
  if(realpathSync(pin.path)!==pin.path||!statSync(pin.path).isFile())throw Error('Canonical executable tool required');
  accessSync(pin.path,constants.X_OK);
  if(createHash('sha256').update(readFileSync(pin.path)).digest('hex')!==pin.sha256)throw Error('Pinned executable changed');
  return pin.path;
}
export async function movementBoundChild(pin,args,options){
  const result=await movementChild(movementTool(pin),args,options);
  try{movementTool(pin);result.tool_unchanged=true;}
  catch(error){result.tool_unchanged=false;result.tool_binding_error=String(error);}
  return result;
}
export function movementAssetServer(pin,{web,assets,cwd}){
  const command={command:movementTool(pin),args:['tools/serve-wasm.py',web,'--port','0','--assets',assets],cwd};
  return {child:spawn(command.command,command.args,{cwd:command.cwd}),command};
}
export function movementProfile(path,digest){
  if(typeof path!=='string'||!isAbsolute(path)||typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest))throw Error('Explicit reviewed movement preflight required');
  const bytes=readFileSync(path);
  if(createHash('sha256').update(bytes).digest('hex')!==digest)throw Error('Different movement preflight');
  const pre=JSON.parse(bytes);
  if(pre.version!==2||pre.profile!=='current-checkout'||pre.runtime_binding!=='metadata-consistent'||pre.independent_compile_proof_verified!==false||pre.fidelity_passing_cases!==0)throw Error('Unsupported movement profile');
  if(!pre.tools||Object.keys(pre.tools).sort().join(',')!=='git,python')throw Error('Explicit Git/Python tools required');
  movementTool(pre.tools.git);movementTool(pre.tools.python);
  if(realpathSync(process.execPath)!==movementTool({path:pre.node,sha256:pre.node_sha256}))throw Error('Different running Node');
  return pre;
}
export const movementWorld=stackOrderWorld;
export function movementTerrain(){
  const bytes=declaredTerrain();const offset=15+0xaa4;
  // Actual SMACMap parser: altitude3/contour60 selects constant +10 rather
  // than coordinate-dependent contour64 jitter. No native terrain mutation.
  for(let i=0;i<128;i++)bytes[offset+i*44+1]=60;
  return bytes;
}
export const movementBudgets=Object.freeze({node_ms:180000,observation_ms:120000,outer_seconds:190,
  term_seconds:3,kill_wait_seconds:5,cleanup_seconds:8,postkill_seconds:2,census_calls:32,sample_delay_ms:10});
export const movementMain=String.raw`#main((glsmac) => {
 #include('game/game')(glsmac); #include('ui/ui')(glsmac);
 const preview = #include('ui/parts/game/bottom_bar/object_preview');
 const terrain_observer = #include('../tests/_terrain_trace_observer');
 glsmac.on('configure_game',(configured) => {
  const game = configured.game;
  game.on('start_ui',() => {
   if (#typeof(glsmac.get_unit_body_census) != 'Callable') { throw Error('Census API unavailable'); }
   const proxy = {}; proxy.um = game.get_um(); proxy.bm = game.get_bm();
   for (field of ['get_um','get_bm','get_tm','get_players','get_player','get_turn','get_settings','get','is_started','is_turn_complete','get_research_state','get_research_science']) { proxy[field] = game[field]; }
   proxy.technologies = game.technologies;
   // No read_ui callback: full Native worlds do not absorb transient frontend UI.
   const observer = terrain_observer(proxy,null);
   let a = null; let b = null; let city_id = null; const owners = [];
   const owner = game.get_player().id + 0;
   for (player of game.get_players()) { owners :+ player.id + 0; }
   for (unit of game.get_tm().get_tile(8,8).get_units()) {
    if (unit.owner == owner && unit.def == 'ScoutPatrol') {
     if (unit.morale == 2) { if (a != null) { throw Error('Ambiguous A'); } a = unit.id + 0; }
     if (unit.morale == 1) { if (b != null) { throw Error('Ambiguous B'); } b = unit.id + 0; }
    }
   }
   for (base of game.get_bm().get_bases()) { if (base.get_owner().id == owner) { if (city_id != null) { throw Error('Ambiguous readiness city'); } city_id = base.id + 0; } }
   if (a == null || b == null || city_id == null || #sizeof(owners) != 7) { throw Error('Missing movement world'); }
   let seq = 0; let phase = 'ready'; let submit_seq = null; let receipt_seq = null;
   let selection_fence = null; let tile_seq = null; let preview_seq = null;
   let reads = 0; let sampled = 0; let pending_ticks = 0; let ticks = 0;
   let failed = false;
   const emit = (kind,row) => { seq++; row.seq = seq; #print('UM_' + kind + '|' + #json_text_exact(row)); return seq; };
   const abort = (reason) => { #print('UM_UNSUPPORTED|' + reason); glsmac.exit(); };
   game.on('error',() => { failed = true; });
   game.on('tile_select',(e) => { tile_seq = emit('EVENT',{kind:'tile-select',x:e.tile.x + 0,y:e.tile.y + 0}); });
   game.get_map().on('unit_preview',(e) => {
    // Only immutable native identity metadata; no mutable unit/tile/MP reads.
    const id = e.unit == null ? null : e.unit.id + 0;
    const serial = emit('EVENT',{kind:'native-unit-preview',unit_id:id});
    if (id == a) { preview_seq = serial; }
   });
   game.on('event_result',(e) => {
    if (#typeof(e.name) != 'String' || #typeof(e.event_id) != 'String' || #typeof(e.caller) != 'Int' || #typeof(e.success) != 'Bool') { throw Error('Native receipt types'); }
    const serial = emit('RECEIPT',{name:e.name + '',event_id:e.event_id + '',caller:e.caller + 0,success:e.success});
    if (submit_seq != null) {
     if (e.name != 'move_unit' || !e.success || e.caller != owner || receipt_seq != null) { throw Error('Unexpected post-submit receipt'); }
     receipt_seq = serial;
    }
   });
   const pending = () => {
    const values = [];
    for (id of owners) { values :+ {owner_id:id,pending:game.has_pending_actions(id)}; }
    return values;
   };
   const clear = (values) => { let result = true; for (row of values) { if (row.pending) { result = false; } } return result; };
   const capture = (label) => {
    const checkpoint = {label:label}; checkpoint.world = observer.read(); const scalars = [];
    for (entry of checkpoint.world.units) {
     const unit = game.get_um().get_unit(entry.raw_id);
     scalars :+ {unit_id:unit.id + 0,owner_id:unit.owner + 0,id_type:#typeof(unit.id),owner_type:#typeof(unit.owner),health_type:#typeof(unit.health),health_bits:#float_bits(unit.health),movement_type:#typeof(unit.movement),movement_bits:#float_bits(unit.movement)};
    }
    checkpoint.native_unit_scalars = scalars; checkpoint.state = {}; checkpoint.pending = pending();
    emit('CHECKPOINT',checkpoint); // All Native FloatPtr data serialized immediately.
   };
   const validate_input = () => {
    const actor = game.get_um().get_unit(a); const target = game.get_tm().get_tile(10,8);
    if (actor.owner != owner || actor.get_tile().x != 8 || actor.get_tile().y != 8 || actor.movement != 1.0 || actor.health != 1.0 || actor.moved_this_turn || actor.get_order() != 'NO_ORDERS' || actor.get_terraforming().active || actor.get_automation().command != '' || actor.get_terraforming_recovery().active) { throw Error('Controlled A is not idle'); }
    if (target.get_base() != null || #sizeof(target.get_units()) != 0 || actor.get_tile().get_base() != null) { throw Error('Controlled route occupied'); }
    const points = [{x:8,y:8},{x:10,y:8}];
    for (point of points) {
     const center = game.get_tm().get_terrain_state(point.x,point.y); const neighborhood = [];
     neighborhood :+ point;
     for (direction in center.neighbors) { const neighbor = center.neighbors[direction]; if (neighbor != null) { neighborhood :+ neighbor; } }
     for (position of neighborhood) {
      const state = game.get_tm().get_terrain_state(position.x,position.y);
      if (state.is_water || game.get_tm().get_tile(position.x,position.y).is_locked() || state.rockiness != 1 || state.features.river || state.features.xenofungus || state.terraforming.road || state.terraforming.mag_tube) { throw Error('Controlled route is not clear dry flat land'); }
      for (height in state.elevation) { if (state.elevation[height] != 10) { throw Error('Controlled Native height is not ten'); } }
     }
    }
    const quote = observer.quote(actor,target);
    if (!quote.allowed_now || quote.reason != null || quote.policy_quote_version != 1 || quote.policy_quote.road_rate != 0 || quote.policy_quote.base_cost != 1.0 || quote.policy_quote.after_cost != 0.0 || quote.policy_quote.total_cost != 1.0 || quote.quoted_step_cost_mp != 1.0) { throw Error('Controlled normal movement cost unavailable'); }
   };
   const census = (stage) => {
    if (reads >= 32) { throw Error('Census call cap exceeded'); } reads++;
    const payload = glsmac.get_unit_body_census(game);
    if (#typeof(payload) != 'String') { throw Error('Census is not a Native String'); }
    return emit('CENSUS',{ordinal:reads,stage:stage,payload:payload});
   };
   glsmac.ui.root.timer(100,() => {
    ticks++; if (failed || ticks >= 600) { abort('readiness-limit'); return false; }
    if (phase == 'ready') {
     let ready = false;
     try { glsmac.focus_owned_base(city_id); ready = true; } catch { : (e) => { if (ticks == 1) { #print('UM_READINESS_WAIT|' + e.reason); } } }
     if (ready) { phase = 'warm'; selection_fence = seq; game.select_tile(game.get_tm().get_tile(8,8)); }
    } else {
     if (phase == 'warm' && tile_seq != null && preview_seq != null && selection_fence < tile_seq && tile_seq < preview_seq && preview.rendered_unit_id == a && preview.selected_unit_id == null) { phase = 'deferred'; }
     else {
      if (phase == 'deferred') {
       const initial_pending = pending(); if (!clear(initial_pending)) { throw Error('Initial pending actions'); }
       if (preview.preview == null || preview.preview.data.unit.id != a) { throw Error('Missing mounted native A'); }
       emit('READY',{a:a,b:b,owner:owner,selection_fence:selection_fence,tile_seq:tile_seq,preview_seq:preview_seq,mounted_unit_id:preview.preview.data.unit.id + 0});
       validate_input(); capture('before'); census('baseline');
       submit_seq = emit('SUBMIT',{name:'move_unit',a:a,owner:owner,x:10,y:8});
       const data = {}; data.unit = game.get_um().get_unit(a); data.tile = game.get_tm().get_tile(10,8);
       game.event('move_unit',data); phase = 'sampling';
       glsmac.ui.root.timer(10,() => {
        if (failed) { abort('native-game-error'); return false; }
        if (phase == 'sampling') {
         if (sampled < 29) { sampled++; census('sample'); }
         // Runtime trigger is fixed sample budget + accepted apply, NOT decoded
         // coordinates. Offline strict JSON validation must prove two actual
         // endpoint callbacks precede the first pending query; absent => incomplete.
         if (sampled == 29 && receipt_seq != null) { phase = 'pending'; }
         else { pending_ticks++; if (pending_ticks >= 600) { abort('receipt-limit'); return false; } }
        } else {
         if (phase == 'pending') {
          pending_ticks++; if (pending_ticks >= 600) { abort('pending-limit'); return false; }
          const values = pending(); const serial = emit('PENDING',{stage:'poll',values:values});
          if (clear(values)) { phase = 'settled'; }
         } else {
          if (phase == 'settled') {
           const values = pending(); if (!clear(values)) { throw Error('New pending action at capture'); }
           emit('PENDING',{stage:'capture',values:values}); census('settled'); capture('after'); phase = 'confirm';
          } else {
           if (phase != 'confirm') { throw Error('Unexpected movement observer phase'); }
           const values = pending(); if (!clear(values)) { throw Error('New pending action at confirmation'); }
           emit('PENDING',{stage:'confirm',values:values}); census('confirm');
           emit('RESULT',{schema:'application.unit-body-movement-observation.v1',a:a,b:b,owner:owner,reads:reads,sampled:sampled,submit_seq:submit_seq,receipt_seq:receipt_seq,physical_inputs:0,move_commands:1});
           phase = 'done'; glsmac.exit(); return false;
          }
         }
        }
        return true;
       }); return false;
      }
     }
    }
    return true;
   });
  });
 }); glsmac.run();
});`;
