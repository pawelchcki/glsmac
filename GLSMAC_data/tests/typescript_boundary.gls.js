const behavior = #include('./_behavior');
const policy = #include('../default/game/land_resource_yields');
const identity = (value) => { return #js_call('tests/runtime','identity',value); };

behavior.scenario('TypeScript copies integer float missing and nested native values', () => {
	test.assert(identity(9007199254740993) == 9007199254740993);
	test.assert(identity(9223372036854775807) == 9223372036854775807);
	test.assert(identity((0 - 9223372036854775807) - 1) == (0 - 9223372036854775807) - 1);
	test.assert(identity(0.1) == 0.1 && identity(null) == null && identity(undefined) == undefined);
	const original = {nested:{n:1},items:[2,null,undefined]}; const copy = identity(original);
	copy.nested.n = 8; test.assert(original.nested.n == 1 && copy.nested.n == 8);
});

behavior.scenario('TypeScript errors retain class reason and original source frames', () => {
	let caught = false;
	try { #js_call('tests/runtime','mappedError',null); }
	catch { Error: (error) => {
		test.assert(error.reason == 'original TypeScript location witness');
		const frame = #split(error.stacktrace[0],'(');
		const location = #split(frame[1],':');
		test.assert(location[0] == 'scripts/tests/runtime.ts');
		caught = true;
	} }
	test.assert(caught);
	// The failed runtime is replaced, so later valid calls still work.
	test.assert(identity(7) == 7);
});

behavior.scenario('TypeScript rejects native callbacks cycles and wrapped engine objects', () => {
	const cycle = {}; cycle.self = cycle;
	const fixture = test.production_fixture();
	const reject = (input) => {
		let caught = false;
		try { identity(input); } catch { : (error) => { caught = true; } }
		test.assert(caught);
	};
	reject(() => { return 1; }); reject(cycle); reject(fixture.owner);
});

behavior.scenario('uncapped ocean yields preserve lazy native technology observations', () => {
	let reads = 0;
	const player = {get_faction: () => { reads = reads + 1; return {starting_technologies:[]}; }};
	const tile = {is_land:false,rockiness:1,features:{xenofungus:false,jungle:false,river:false},bonuses:{nutrient:false,minerals:false,energy:false},terraforming:{}};
	const rules = {forest:{NUTRIENTS:1,MINERALS:2,ENERGY:1},ocean:{NUTRIENTS:1,MINERALS:0,ENERGY:0},improved_sea:null,borehole:null,farm_nutrients:1,mine_nutrients:(0 - 1),mine_without_road_limit:1,caps:{NUTRIENTS:'Food',MINERALS:'Mineral',ENERGY:'Energy'},sea_mine_bonus_tech:'Sea'};
	test.assert(policy.apply(tile,player,rules,{NUTRIENTS:1,MINERALS:0,ENERGY:1}) == {NUTRIENTS:1,MINERALS:0,ENERGY:0});
	test.assert(reads == 0);
});

behavior.scenario('split policy calls require the package that produced their input', () => {
	test.assert(identity(7) == 7);
	const package_id = #js_package();
	test.assert(#js_call('tests/runtime','identity',8,package_id) == 8);
	let caught = false;
	try { #js_call('tests/runtime','identity',7,package_id + 'stale'); }
	catch { GSEOperationFailed: (error) => {
		test.assert(error.reason == 'TypeScript policy failed: Script package changed during operation');
		caught = true;
	} }
	test.assert(caught && identity(7) == 7);
});
