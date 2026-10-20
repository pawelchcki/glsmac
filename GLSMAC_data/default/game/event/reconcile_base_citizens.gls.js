// Opening owned management reconciles idle citizens, without allocating tiles
// or crediting income. Scalar request identity also protects deferred UI opens.
const resolve = (game, id) => {
	for (base of game.get_bm().get_bases()) { if (base.id == id) { return base; } }
	return null;
};
return {
	validate: (e) => {
		if (#typeof(e.data.base_id) != 'Int' || #typeof(e.data.turn_id) != 'Int' || #typeof(e.data.request_token) != 'Int' || e.data.request_token <= 0) { return 'Invalid base management request'; }
		const base = resolve(e.game, e.data.base_id);
		if (base == null) { return 'Base no longer exists'; }
		return base.validate_citizen_reconciliation(e.caller, e.data.turn_id);
	},
	apply: (e) => {
		const base = resolve(e.game, e.data.base_id);
		if (base == null) { throw Error('Base no longer exists'); }
		const result = {receipt: base.reconcile_citizens(e.caller, e.data.turn_id)};
		result.base = base; return result;
	},
	rollback: (e) => {
		const base = resolve(e.game, e.data.base_id);
		if (base == null || base != e.applied.base) { throw Error('Base management identity changed'); }
		base.rollback_citizen_reconciliation(e.applied.receipt);
	},
};
