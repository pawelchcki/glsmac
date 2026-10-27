// Nearby native bases and real growth/add-pop/worker-link code. Tile yields and
// queued local delivery are declared boundaries; no original behavior claim.
const behavior = #include('./_behavior');
const configure_bases = #include('../default/game/bases');
const growth_stage = #include('../default/game/event/process_base_growth');
const add_pop = #include('../default/game/event/add_base_pop');
const work = #include('../default/game/base_work');
const key = (tile) => { return #to_string(tile.x) + '_' + #to_string(tile.y); };
const fixture = () => {
	const f = test.selection_fixture(); f.enable_economy(); f.pending = []; f.delivered = 0; f.yields = {};
	f.with_write(() => { f.add_snapshot_base(0, 2); });
	for (base of f.game.bm.get_bases()) { if (base != f.base) { f.other = base; } }
	f.game.tm.on('get_tile_resources', (e) => {
		const id = key(e.tile);
		return #is_defined(f.yields[id]) ? f.yields[id] : {NUTRIENTS: 0, MINERALS: 0, ENERGY: 0};
	});
	const rules = {}; const callbacks = {};
	rules.get_bm = () => { return f.game.bm; }; rules.get_tm = () => { return f.game.tm; };
	rules.get_turn = () => { return f.game.get_turn(); }; rules.is_master = () => { return f.game.is_master(); };
	rules.get = (name) => { return f.game.get(name); }; rules.set = (name, value) => { f.game.set(name, value); };
	rules.on = (name, callback) => { callbacks[name] = callback; };
	rules.event = (name, data) => {
		if (name == 'define_base_pop' || name == 'define_base_facility') { return; }
		if (name != 'add_base_pop') { throw Error('Unexpected bounded growth event: ' + name); }
		const e = {caller: 0}; e.game = f.game; e.data = data; f.pending :+ e;
	};
	configure_bases(rules); callbacks.start({});
	f.grow = (base) => {
		const e = {caller: 0, data: {turn_id: 1}}; e.game = rules; e.data.base = base;
		test.assert(!#is_defined(growth_stage.validate(e)));
		f.with_write(() => { growth_stage.apply(e); });
	};
	f.flush = () => {
		while (f.delivered < #sizeof(f.pending)) {
			const e = f.pending[f.delivered]; f.delivered = f.delivered + 1;
			test.assert(!#is_defined(add_pop.validate(e)));
			f.with_write(() => { e.applied = add_pop.apply(e); });
		}
	};
	f.claim = (tile) => {
		let pop = null;
		f.with_write(() => { pop = f.other.create_pop({type: 'WORKER'}); f.game.get('f_base_pop_work_tile')(f.other, pop, tile); });
		return pop;
	};
	f.resources = (tile, nutrients, minerals, energy) => {
		const id = key(tile); f.yields[id] = {NUTRIENTS: nutrients, MINERALS: minerals, ENERGY: energy};
	};
	f.score = (tile, amount) => { f.resources(tile, amount, amount, amount); };
	return f;
};
const one_worker = (f, expected) => {
	const pops = f.base.get_pops(); test.assert(#sizeof(pops) == 1 && pops[0].get_type() == 'WORKER');
	const pop = pops[0]; const tile = pop.get('worked_tile');
	test.assert(tile == expected && work.workable_tile(f.game, f.base, tile), 'Growth must choose a legal vacant non-base square');
	test.assert(tile.get('working_pop') == pop && f.base.get_worked_tiles() == [tile]);
	test.assert(!#is_defined(f.base.validate_citizen_reconciliation(f.owner.id, 1)), 'Ordinary growth must leave a management-valid native city');
};

behavior.scenario('growth excludes a nearby higher-yield base center', () => {
	const f = fixture(); const vacant = f.tile_at(2, 0);
	f.score(f.other.get_tile(), 9); f.score(vacant, 3); f.grow(f.base); f.flush();
	one_worker(f, vacant); test.assert(!f.other.get_tile().has('working_pop'));
});

behavior.scenario('growth preserves another base citizen claim while choosing a legitimate vacancy', () => {
	const f = fixture(); const claimed = f.tile_at(2, 0); const vacant = f.tile_at(1, 1); const existing = f.claim(claimed);
	f.score(claimed, 9); f.score(vacant, 3); f.grow(f.base); f.flush();
	one_worker(f, vacant);
	test.assert(claimed.get('working_pop') == existing && existing.get('worked_tile') == claimed && f.other.get_worked_tiles() == [claimed]);
});

behavior.scenario('growth retains the existing weighted choice among legitimate vacancies', () => {
	const f = fixture(); const best = f.tile_at(1, 1); f.score(f.tile_at(2, 0), 2); f.score(best, 4);
	f.grow(f.base); f.flush(); one_worker(f, best);
});

behavior.scenario('growth falls back to Doctor when all non-base squares already belong to other citizens', () => {
	const f = fixture(); const claims = [];
	for (tile of f.base.get_unworked_tiles()) { if (tile.get_base() == null) { const pop = f.claim(tile); claims :+ pop; f.score(tile, 9); } }
	f.score(f.other.get_tile(), 10); f.grow(f.base); f.flush();
	const pops = f.base.get_pops(); test.assert(#sizeof(pops) == 1 && pops[0].get_type() == 'DOCTOR');
	test.assert(!pops[0].has('worked_tile') && f.base.get_worked_tiles() == [] && !f.other.get_tile().has('working_pop'));
	for (pop of claims) { const tile = pop.get('worked_tile'); test.assert(tile.get('working_pop') == pop); }
	test.assert(!#is_defined(f.base.validate_citizen_reconciliation(f.owner.id, 1)));
});

// Positive-component cases are application invariants; only the declared
// natural flat-arid zero-yield context has accepted original observations.
const one_doctor = (f) => {
	const pops = f.base.get_pops();
	test.assert(#sizeof(pops) == 1 && pops[0].get_type() == 'DOCTOR');
	test.assert(!pops[0].has('worked_tile') && f.base.get_worked_tiles() == []);
	test.assert(!#is_defined(f.base.validate_citizen_reconciliation(f.owner.id, 1)));
};
behavior.scenario('automatic growth uses Doctor when legal vacant terrain yields nothing', () => {
	const f = fixture(); const vacant = f.tile_at(2, 0);
	const ranked = f.game.get('f_base_find_best_or_worst_tiles')(f.base, [vacant], 1, 1);
	test.assert(ranked == [vacant], 'Shared selector retains zero-yield squares for other controls');
	f.grow(f.base); f.flush(); one_doctor(f);
});
for (entry of [{name: 'nutrient', n: 1, m: 0, e: 0}, {name: 'mineral', n: 0, m: 1, e: 0}, {name: 'energy', n: 0, m: 0, e: 1}]) {
	behavior.scenario('automatic growth preserves ' + entry.name + '-only productive Worker terrain', () => {
		const f = fixture(); const vacant = f.tile_at(2, 0);
		f.resources(vacant, entry.n, entry.m, entry.e); f.grow(f.base); f.flush(); one_worker(f, vacant);
	});
}
behavior.scenario('productive claimed terrain and other base centers cannot displace zero-yield Doctor fallback', () => {
	const f = fixture(); const claimed = f.tile_at(2, 0); const existing = f.claim(claimed);
	f.score(claimed, 9); f.score(f.other.get_tile(), 10); f.grow(f.base); f.flush(); one_doctor(f);
	test.assert(existing.get('worked_tile') == claimed && claimed.get('working_pop') == existing && f.other.get_worked_tiles() == [claimed]);
});

for (productive_vacancy of [true,false]) {
behavior.scenario('deferred native growth preserves shared claim and ' + (productive_vacancy ? 'chooses another productive tile' : 'retains both cities with a Doctor'), () => {
 const f = fixture(); const shared = f.tile_at(2,0); const alternative = f.tile_at(1,1);
 f.score(shared,9); f.score(alternative,productive_vacancy ? 3 : 0); const applied = []; const rejected = [];
 f.game.register_event('process_base_growth',growth_stage);
 f.game.register_event('add_base_pop',{validate:add_pop.validate,apply:(e) => {
  const tile = e.data.worked_tile; let claim = null;
  if (#is_defined(tile) && tile.has('working_pop')) { claim = tile.get('working_pop'); }
  const population = [];
  for (base of f.game.bm.get_bases()) {
   const citizens = [];
   for (pop of base.get_pops()) {
    const worked = pop.get('worked_tile');
    citizens :+ {id:pop.id + 0,type:pop.get_type() + '',x:#is_defined(worked) ? worked.x + 0 : null,y:#is_defined(worked) ? worked.y + 0 : null};
   }
   population :+ {base_id:base.id + 0,x:base.get_tile().x + 0,y:base.get_tile().y + 0,pops:citizens};
  }
  #print('GROWTH_NATIVE_GRAPH|' + #json_text_exact({population:population,
   claim:claim == null ? null : {pop_id:claim.id + 0,base_id:claim.get_base().id + 0}}));
  #print('GROWTH_NATIVE_INTENT|' + #json_text_exact({base:e.data.base.id + 0,base_x:e.data.base.get_tile().x + 0,base_y:e.data.base.get_tile().y + 0,
   type:e.data.type + '',x:#is_defined(tile) ? tile.x + 0 : null,y:#is_defined(tile) ? tile.y + 0 : null,
   existing_claim:#is_defined(tile) ? tile.has('working_pop') : false,created_children:#sizeof(applied)}));
  if (#sizeof(applied) == 1) { test.assert(#typeof(f.snapshot()) == 'String','First child leaves an intact native snapshot before the second child applies'); }
  const receipt = add_pop.apply(e); applied :+ e; return receipt;
 },rollback:add_pop.rollback});
 f.game.on('event_result',(e) => { if (!e.success) { rejected :+ e.name + ''; } });
 for (base of [f.base,f.other]) { f.game.event('process_base_growth',{base:base,turn_id:f.game.get_turn()}); }
 f.process_events();
 test.assert(f.base.get_size() == 0 && f.other.get_size() == 0 && #sizeof(applied) == 0,
  'Actual native growth batch must finish before its queued AddPop children run');
 #print('GROWTH_NATIVE_DEFERRED|' + #json_text_exact({bases:[{x:f.base.get_tile().x + 0,y:f.base.get_tile().y + 0},
  {x:f.other.get_tile().x + 0,y:f.other.get_tile().y + 0}],shared:{x:shared.x + 0,y:shared.y + 0},
  shared_unclaimed: !shared.has('working_pop'),first_size:f.base.get_size(),second_size:f.other.get_size()}));
 f.process_events();
 test.assert(rejected == [] && #sizeof(applied) == 2 && f.base.get_size() == 1 && f.other.get_size() == 1,'Both native population children must survive allocation');
 const bytes = f.snapshot();
 test.assert(#typeof(bytes) == 'String','Native serialization must retain consistent unique worker backlinks');
 const first = f.base.get_pops(); const second = f.other.get_pops(); const a = first[0]; const b = second[0];
 test.assert(a.get('worked_tile') == shared && shared.get('working_pop') == a);
 if (productive_vacancy) {
  test.assert(b.get_type() == 'WORKER' && b.get('worked_tile') == alternative && alternative.get('working_pop') == b);
  test.assert(applied[1].applied.worked_tile == alternative,'Receipt must own the actual fallback tile, not the stale proposal');
 } else {
  test.assert(b.get_type() == 'DOCTOR' && !b.has('worked_tile') && f.other.get_worked_tiles() == []);
  test.assert(!#is_defined(applied[1].applied.worked_tile),'Exhausted fallback has no worker receipt');
 }
 test.assert(work.valid_pop_links(f.game,f.base,a) && work.valid_pop_links(f.game,f.other,b));
 const stored = [applied[0].applied.old_nutrients,applied[1].applied.old_nutrients];
 f.with_write(() => { add_pop.rollback(applied[1]); });
 test.assert(f.other.get_size() == 0 && f.base.get_size() == 1 && shared.get('working_pop') == a && a.get('worked_tile') == shared);
 test.assert(!alternative.has('working_pop') && f.other.get('accumulated_nutrients') == stored[1]);
 test.assert(#typeof(f.snapshot()) == 'String','Undoing the second child must preserve the first city and serialization');
 f.with_write(() => { add_pop.rollback(applied[0]); });
 test.assert(f.base.get_size() == 0 && f.other.get_size() == 0 && !shared.has('working_pop'));
 test.assert(f.base.get_worked_tiles() == [] && f.other.get_worked_tiles() == [] && f.base.get('accumulated_nutrients') == stored[0]);
 test.assert(#typeof(f.snapshot()) == 'String');
});
}

behavior.scenario('explicit stale worker assignment and malformed automatic marker reject before mutation', () => {
 const f = fixture(); const tile = f.tile_at(2,0); f.score(tile,9); const existing = f.claim(tile); const before = f.snapshot();
 const event = {caller:0,data:{type:'WORKER'}}; event.game = f.game; event.data.base = f.base; event.data.worked_tile = tile;
 for (mode of ['explicit','malformed']) {
  if (mode == 'malformed') { event.data.automatic_growth = 'true'; }
  test.assert(#typeof(add_pop.validate(event)) == 'String'); let rejected = false;
  try { f.with_write(() => { add_pop.apply(event); }); } catch { : (error) => { rejected = true; } }
  test.assert(rejected && f.snapshot() == before && tile.get('working_pop') == existing);
 }
});
