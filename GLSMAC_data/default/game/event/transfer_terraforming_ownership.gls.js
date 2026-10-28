// Authoritative integration hook for the application construction-owner model.
// A future territory controller may submit observed transfers through this same
// CAS boundary. No territory or friendly owner is inferred for imported flags.
const validate = (e) => {
	if (#typeof(e.caller) != 'Int' || e.caller != 0 || !e.game.is_master()) { return 'Improvement ownership transfers require the authoritative host'; }
	if (#typeof(e.data.x) != 'Int' || #typeof(e.data.y) != 'Int' || #typeof(e.data.improvement) != 'String' ||
		#typeof(e.data.from_owner) != 'Int' || #typeof(e.data.to_owner) != 'Int') { return 'Improvement transfer fields are invalid'; }
	const tm = e.game.get_tm(); let state = null;
	try { state = tm.get_terrain_state(e.data.x,e.data.y); } catch { : (error) => { return 'Improvement transfer tile is not live'; } }
	if (!#is_defined(state.terraforming[e.data.improvement]) || !state.terraforming[e.data.improvement] || state.terraforming_owners[e.data.improvement] != e.data.from_owner) { return 'Improvement transfer identity changed'; }
	let found = e.data.to_owner == (0-1);
	for (owner of e.game.get_players()) { if (owner.id == e.data.to_owner) { found = true; } }
	if (!found) { return 'Improvement transfer recipient is not live'; }
	const owners = state.terraforming_owners; owners[e.data.improvement] = e.data.to_owner + 0;
	tm.validate_terrain([{x:e.data.x + 0,y:e.data.y + 0,terraforming_owners:owners}],[]);
};
return {
	validate:validate,
	apply:(e) => {
		const error = validate(e); if (#is_defined(error)) { throw Error(error); }
		const tm = e.game.get_tm(); const owners = tm.get_terrain_state(e.data.x,e.data.y).terraforming_owners;
		owners[e.data.improvement] = e.data.to_owner + 0;
		const token = tm.apply_terrain([{x:e.data.x + 0,y:e.data.y + 0,terraforming_owners:owners}],[]);
		#include('../terraforming_view_revision').changed(e.game); return {token:token};
	},
	rollback:(e) => { e.game.get_tm().validate_terrain_rollback(e.applied.token); e.game.get_tm().rollback_terrain(e.applied.token); #include('../terraforming_view_revision').changed(e.game); },
};
