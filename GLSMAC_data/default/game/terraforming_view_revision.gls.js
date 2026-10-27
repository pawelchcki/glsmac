// Process-local view invalidation only. Game custom globals are not saved or
// peer-compared. Updating this scalar never calls UI listeners inside RW work.
const key = 'terraforming_view_revision_v1';
const read = (game) => {
 const value = game.get(key);
 if (!#is_defined(value)) { return 0; }
 if (#typeof(value) != 'Int' || value < 0) { throw Error('Invalid terraforming view revision'); }
 return value;
};
return {
 read:read,
 changed:(game) => { const prior = read(game); game.set(key,prior == 9223372036854775807 ? 0 : prior + 1); },
};
