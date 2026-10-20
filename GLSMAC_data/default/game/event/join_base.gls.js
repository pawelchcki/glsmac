// Stable scalar identities are revalidated by the authoritative transaction.
return {
	validate: (e) => { return e.game.validate_join_base(e.data.unit_id, e.data.base_id, e.caller); },
	apply: (e) => { return e.game.join_base(e.data.unit_id, e.data.base_id, e.caller); },
	rollback: (e) => { e.game.rollback_join_base(e.applied); },
};
