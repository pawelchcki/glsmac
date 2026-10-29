// Resolve command identity at the authoritative boundary. Legacy requests may
// carry a Unit wrapper; it must be the exact current manager entity. Current
// frontend controls send only the scalar unit_id.
const resolve = (game, data) => {
	let id = #undefined;
	if (#is_defined(data.unit_id)) { id = data.unit_id; }
	else if (#is_defined(data.unit) && #classof(data.unit) == 'Unit') { id = data.unit.id; }
	if (#typeof(id) != 'Int' || id <= 0) { return null; }
	const um = game.get_um();
	if (!um.has_unit(id)) { return null; }
	const unit = um.get_unit(id);
	if (#is_defined(data.unit) && data.unit != unit) { return null; }
	return unit;
};

// Observe native state by value. No wrapper or callback crosses into policy.
const validation_snapshot = (e, movement_required) => {
	const unit = resolve(e.game, e.data);
	const snapshot = {schema:1,live:unit != null,caller:null,owner:0,started:false,turn:0,completed:false,
		health:0.0,immovable:false,locked:false,needs_orders:false,movement_required:movement_required};
	if (unit == null) { return snapshot; }
	if (#typeof(e.caller) == 'Int') { snapshot.caller = e.caller + 0; }
	snapshot.owner = unit.owner + 0;
	snapshot.started = e.game.is_started(); snapshot.turn = e.game.get_turn() + 0;
	if (snapshot.caller != null && snapshot.caller == snapshot.owner && snapshot.started && snapshot.turn > 0) {
		snapshot.completed = e.game.is_turn_complete(snapshot.caller);
	}
	snapshot.health = unit.health + 0.0; snapshot.immovable = unit.is_immovable;
	snapshot.locked = unit.get_tile().is_locked(); snapshot.needs_orders = unit.needs_orders();
	return snapshot;
};
const validate = (e, movement_required) => {
	// Identity and ownership stay authoritative at the host boundary. Reject
	// malformed/foreign requests before allocating a copied policy snapshot.
	const unit = resolve(e.game,e.data);
	if (unit == null) { return 'Unit identity is not live'; }
	if (#typeof(e.caller) != 'Int' || unit.owner != e.caller) { return 'Unit command requires its owner'; }
	const result = #js_call('game/unit-orders','validate',validation_snapshot(e,movement_required));
	if (result.error != null) { return result.error; }
};

const rollback_unit = (e) => {
	const unit = resolve(e.game, e.data);
	if (unit == null || unit != e.applied.unit || unit.owner != e.applied.owner) { throw Error('Unit order rollback identity changed'); }
	return unit;
};
const order_state = (game,unit) => {
	const tile = unit.get_tile();
	return {version:1,id:unit.id + 0,owner:unit.owner + 0,turn:game.get_turn() + 0,x:tile.x + 0,y:tile.y + 0,
		definition:unit.def,health:unit.health + 0.0,morale:unit.morale + 0,home:unit.get_terraform_home(),
		order:unit.get_order(),plan:unit.get_automation(),work:unit.get_terraforming(),recovery:unit.get_terraforming_recovery(),
		movement:unit.movement + 0.0,moved:unit.moved_this_turn == true};
};
const restore_order_state = (unit,state) => {
	unit.set_automation(state.plan); unit.set_terraforming(state.work); unit.set_terraforming_recovery(state.recovery);
	if (state.order != 'TERRAFORM' && state.order != 'AUTOMATE') { unit.set_order(state.order); }
	unit.movement = state.movement; unit.moved_this_turn = state.moved;
};
const automation_cancel_error = (e,unit) => {
	const plan = unit.get_automation(); if (plan.command == '') { return; }
	const intent = {caller:e.caller,data:{unit_id:unit.id + 0,command:'cancel',expected_epoch:plan.epoch}}; intent.game = e.game;
	return #include('./terraforming_automation').validate(intent);
};
const ordinary_apply = (e,target,cancel_work) => {
	const error = validate(e,false); if (#is_defined(error)) { throw Error(error); }
	const package_id = #js_package();
	const unit = resolve(e.game,e.data); const original = order_state(e.game,unit);
	const operation = #js_call('game/unit-orders','plan',{schema:1,validation:validation_snapshot(e,false),target:target,
		original_order:original.order,has_automation:original.plan.command != '',cancel_work:cancel_work},package_id);
	const receipt = {owner:unit.owner + 0,turn:e.game.get_turn() + 0,original_order:unit.get_order(),original_state:original}; receipt.unit = unit;
	if (original.order == 'TERRAFORM') { receipt.original_work = original.work; receipt.movement = original.movement; receipt.moved = original.moved; }
	const rejected = automation_cancel_error(e,unit); if (#is_defined(rejected)) { throw Error(rejected); }
	try {
		if (operation.cancel_automation) { #include('./terraforming_automation').cancel(e.game,unit); }
		else if (operation.cancel_terraforming) { #include('./terraforming').cancel(e.game,unit); }
		unit.set_order(operation.order);
	} catch { : (failure) => {
		restore_order_state(unit,original); throw Error('Unit order failed: ' + failure.reason);
	} }
	// Reacquire the canonical wrapper: setters may cache scalar input values.
	receipt.expected_state = order_state(e.game,resolve(e.game,e.data));
	return receipt;
};
const ordinary_rollback = (e) => {
	const unit = rollback_unit(e); const error = validate(e,false);
	if (#is_defined(error)) { throw Error(error); }
	if (e.game.get_turn() != e.applied.turn || order_state(e.game,unit) != e.applied.expected_state) { throw Error('Unit order receipt is stale'); }
	// All native identity/state checks complete before the first restore. No
	// treasury operation or scheduler enqueue occurs during ordinary order undo.
	restore_order_state(unit,e.applied.original_state);
	#include('./terraforming_view_revision').changed(e.game);
};

return {
	resolve: resolve,
	validate: validate,
	apply_unit: (e, movement_required) => {
		const error = validate(e, movement_required);
		if (#is_defined(error)) { throw Error(error); }
		return resolve(e.game, e.data);
	},
	rollback_unit:rollback_unit,
	automation_cancel_error:automation_cancel_error,
	ordinary_apply:ordinary_apply,
	ordinary_rollback:ordinary_rollback,
};
