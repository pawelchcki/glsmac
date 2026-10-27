// Lossless bounded chunks. Read purity includes native RNG/registered entity
// inventories; begin/end manifests cover every emitted tile and owner field.
return (f,observer) => {
 return (stage) => {
  const native = f.audit_snapshot(); const inventory = f.audit_inspect(); const snapshot = observer.read();
  test.assert(#sizeof(snapshot.players) == 7 && #sizeof(snapshot.bases) == 7 && #sizeof(snapshot.units) == #sizeof(inventory.unit_ids));
  test.assert(f.audit_snapshot() == native && f.audit_inspect() == inventory,'Trace reads preserve actual native state, RNG and queued bookkeeping');
  #print('TERRAIN_NATIVE|' + stage + '|' + #json_text_exact(inventory));
  const trace = snapshot.terrain_trace;
  const header = {turn:snapshot.turn,width:snapshot.width,height:snapshot.height,terrain_trace:{schema:trace.schema,elevation_units:trace.elevation_units}};
  // Every source field is already detached by observer.read(). Keep references
  // only in this ephemeral header and serialize immediately, rather than
  // deep-cloning the same large consent envelope again in an object literal.
  header.players = snapshot.players; header.units = snapshot.units; header.bases = snapshot.bases; header.research = snapshot.research;
  header.terrain_trace.terrain_units = trace.terrain_units; header.terrain_trace.ui = trace.ui;
  header.terrain_trace.coverage = trace.coverage; header.terrain_trace.policy = trace.policy;
  #print('TERRAIN_STAGE_BEGIN|' + stage + '|' + #json_text_exact(header));
  const counts = {tiles:0,unit_details:0,base_details:0,player_details:0};
  for (domain of ['tiles','unit_details','base_details','player_details']) {
   for (key in trace[domain]) {
    const row = {domain:domain + '',key:key + ''}; row.value = trace[domain][key];
    #print('TERRAIN_STAGE_ROW|' + stage + '|' + #json_text_exact(row)); counts[domain] = counts[domain] + 1;
   }
  }
  #print('TERRAIN_STAGE_END|' + stage + '|' + #json_text_exact(counts)); return snapshot;
 };
};
