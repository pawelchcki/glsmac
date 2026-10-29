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

behavior.scenario('oversized native collections fail before copying their children', () => {
	const reject_large = (input) => {
		let caught = false;
		try { identity(input); }
		catch { GSEOperationFailed: (error) => {
			test.assert(error.reason == 'TypeScript policy failed: Native snapshot collection limit exceeded');
			caught = true;
		} }
		test.assert(caught);
	};
	const array = #split(#pad('', 'right', 65537, ','), ',');
	test.assert(#sizeof(array) == 65537);
	// Traversing the first child would fail with a different callback error.
	array[0] = () => { return 1; };
	reject_large(array);
	const object = {};
	for (let i = 0; i < 65537; i++) { const key = #to_string(i); object[key] = 0; }
	test.assert(object['0'] == 0 && object['65536'] == 0);
	object['0'] = () => { return 1; };
	reject_large(object);
});

behavior.scenario('TypeScript unit-order policy preserves guard precedence cancellation and numeric contracts', () => {
	test.assert(#js_call('tests/unit-orders','run',null) == 73);
});

behavior.scenario('TypeScript unit-order UI policy preserves completion selection and stale dialog contracts', () => {
 test.assert(#js_call('tests/unit-order-ui','run',null) == 138);
});

behavior.scenario('unit-order UI adapter ignores malformed and unrelated native event results', () => {
 const ui = #include('../default/ui/parts/game/unit_order_controller');
 const pending = {name:'unit_hold',unit_id:9007199254740993};
 const event = {name:'unit_hold',caller:9223372036854775807,data:{unit_id:9007199254740993},success:true};
 test.assert(ui.match(pending,event,9223372036854775807) == {matched:true,succeeded:true});
 for (data of [undefined,null,[],false,'invalid',{unit_id:9007199254740993.0},{unit_id:null}]) {
  const changed = #clone(event); changed.data = data;
  test.assert(!ui.match(pending,changed,9223372036854775807).matched);
 }
 for (success of [undefined,null,0,'true',[]]) {
  const changed = #clone(event); changed.success = success;
  test.assert(!ui.match(pending,changed,9223372036854775807).matched);
 }
 const failed = #clone(event); failed.success = false;
 test.assert(ui.match(pending,failed,9223372036854775807) == {matched:true,succeeded:false});
 const foreign = #clone(event); foreign.caller = 9007199254740993;
 test.assert(!ui.match(pending,foreign,9223372036854775807).matched);
});
