const faction_id = (player) => {
 const faction = player.get_faction().id;
 const aliases = {UNIVERSITY: 'UNIV', MORGANITES: 'MORGAN', BELIEVERS: 'BELIEVE', PEACEKEEPERS: 'PEACE'};
 return #is_defined(aliases[faction]) ? aliases[faction] : faction;
};
const player_id = (player) => {
 const faction = faction_id(player);
 const canonical = {GAIANS: 'player:1', HIVE: 'player:2', UNIV: 'player:3', MORGAN: 'player:4', SPARTANS: 'player:5', BELIEVE: 'player:6', PEACE: 'player:7'};
 return #is_defined(canonical[faction]) ? canonical[faction] : 'native-player:' + #to_string(player.id);
};
const prototype_id = (unit) => {
 const value = unit.get_def().id;
 const canonical = {ColonyPod: 'colony-pod', Formers: 'formers', ScoutPatrol: 'scout-patrol', Scout: 'scout-patrol'};
 if (#is_defined(canonical[value])) { return canonical[value]; }
 let token = '';
 for (word of #split(#lowercase(unit.get_def().name), ' ')) { if (word != '') { token += (token == '' ? '' : '-') + word; } }
 return token;
};
const destination = (unit, direction) => {
 const origin = unit.get_tile();
 const getter_name = 'get_' + direction;
 const getter = origin[getter_name];
 return getter();
};
const make_observer = (game, requested_profile, fixture_kind) => {
 const economy = #is_defined(requested_profile) && requested_profile == 'economy-research-v1';
 const explicit = #is_defined(fixture_kind) && fixture_kind == 'explicit-world';
 const unsupported = (reason) => { #print('TRACE_UNSUPPORTED|' + reason); throw Error(reason); };
 const identities = {}; const counts = {}; const bindings = {}; const bound_logical = {};
 // Declared factory-handle bindings pin authored logical identities before the
 // first read. Natural observation never binds and keeps its existing logic.
 const bind = (kind, native_id, logical_id) => {
  if (kind != 'unit' && kind != 'base') { throw Error('Observer binding requires a unit or base kind'); }
  if (#typeof(native_id) != 'Int') { throw Error('Observer binding requires a native integer handle'); }
  if (#typeof(logical_id) != 'String' || logical_id == '') { throw Error('Observer binding requires a logical identity'); }
  const handle = kind + ':' + #to_string(native_id);
  if (#is_defined(bindings[handle])) { throw Error('Duplicate observer binding for native handle: ' + handle); }
  if (#is_defined(bound_logical[logical_id])) { throw Error('Duplicate observer binding for logical identity: ' + logical_id); }
  bindings[handle] = logical_id; bound_logical[logical_id] = handle;
 };
 // Lifecycle notifications retire handles even if delete/create occurs between
 // checkpoints or a fixture deliberately reuses a native numeric handle.
 // Declared bindings outlive retirement: a bound handle never re-keys.
 game.um.on('unit_despawn', (e) => { const handle = 'unit:' + #to_string(e.unit.id); identities[handle] = #undefined; });
 game.bm.on('base_despawn', (e) => { const handle = 'base:' + #to_string(e.base.id); identities[handle] = #undefined; });
 const identity = (kind, raw, key) => {
  const handle = kind + ':' + #to_string(raw);
  if (#is_defined(bindings[handle])) { return bindings[handle]; }
  if (!#is_defined(identities[handle])) {
   const ordinal = #is_defined(counts[key]) ? counts[key] : 0;
   identities[handle] = key + ':' + #to_string(ordinal);
   counts[key] = ordinal + 1;
  }
  return identities[handle];
 };
 const read = () => {
  const tm = game.get_tm(); const width = tm.get_map_width(); const height = tm.get_map_height();
  const result = {turn: game.get_turn(), width: width, height: height, players: [], units: [], bases: []};
  for (player of game.get_players()) {
   result.players :+ {id: player_id(player), faction: faction_id(player), raw_id: player.id + 0};
  }
  for (let y = 0; y < height; y++) {
   for (let x = y % 2; x < width; x += 2) {
    for (unit of tm.get_tile(x, y).get_units()) {
     const owner = player_id(unit.get_owner()); const proto = prototype_id(unit);
     const key = 'unit:' + owner + ':' + proto + ':' + #to_string(x) + ':' + #to_string(y);
     const row = {id: identity('unit', unit.id, key), owner: owner, x: x, y: y, prototype: proto,
      raw_id: unit.id + 0, movement: unit.movement + 0.0, order: unit.get_order()};
     if (explicit) { row.health = unit.health + 0.0; row.morale = unit.morale + 0; }
     result.units :+ row;
    }
   }
  }
  if (economy) {
   result.research = [];
   for (player of game.get_players()) {
    const owned = [];
    for (let id = 0; id < 89; id++) { if (game.technologies.has_tech(id, player.id + 1)) { owned :+ id; } }
    const target = game.get_research_state(player.id); const science = game.get_research_science(player.id);
    result.research :+ {player: player_id(player), owned_tech_ids: owned, target_id: target.target_id, accumulated: science.accumulated};
   }
  }
  for (base of game.bm.get_bases()) {
   const tile = base.get_tile(); const owner = player_id(base.get_owner());
   const key = 'base:' + owner + ':' + #to_string(tile.x) + ':' + #to_string(tile.y);
   const row = {id: identity('base', base.id, key), owner: owner, x: tile.x + 0, y: tile.y + 0,
    population: base.get_size(), raw_id: base.id + 0};
   if (economy) {
    const production = base.get_production();
    const projects = {COLONY_POD: 'colony-pod', FORMERS: 'formers', SCOUT_PATROL: 'scout-patrol'};
    if (!#is_defined(projects[production.choice_id])) { unsupported('Unverified production project kind: ' + production.choice_id); }
    let workers = 0; let doctors = 0;
    for (pop of base.get_pops()) {
     const type = pop.get_type();
     if (type == 'WORKER') { workers++; } else if (type == 'DOCTOR') { doctors++; }
     else { unsupported('Unverified specialist type: ' + type); }
    }
    row.resources = {minerals: production.minerals + 0}; row.project = projects[production.choice_id];
    row.jobs = {workers: workers, doctors: doctors};
    const nutrients = base.get('accumulated_nutrients');
    row.nutrients_native = #typeof(nutrients) == 'Int' ? nutrients + 0 : 'uninitialized';
   }
   result.bases :+ row;
  }
  return result;
 };
 const find = (logical) => {
  const observed = read();
  for (unit of observed.units) { if (unit.id == logical) { return game.um.get_unit(unit.raw_id); } }
  throw Error('Unknown logical unit: ' + logical);
 };
 return {read: read, find: find, bind: bind};
};
return {make: make_observer, player_id: player_id, destination: destination};
