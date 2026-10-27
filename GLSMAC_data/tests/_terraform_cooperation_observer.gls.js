// Read-only cooperation capability/observation. Null on a supported schema is
// an actual absent/stale/ineligible cohort, not a stand-in for a missing API.
const work = #include('../default/game/terraforming');
return (game,unit,read_cache) => {
 const result = {supported:false,native_schema_version:null,reason:'Native work schema observation is unavailable',state:null};
 if (#typeof(unit.get_terraforming_schema_version) != 'Callable') { return result; }
 const version = unit.get_terraforming_schema_version();
 if (#typeof(version) != 'Int' || version < 1) { throw Error('Invalid observed native work schema version'); }
 result.native_schema_version = version;
 if (version != 2) { result.reason = 'Native work schema is unsupported for cooperative observation'; return result; }
 if (#typeof(work.cohort_state) != 'Callable') { result.reason = 'Pure cooperation observation is unavailable'; return result; }
 const state = work.cohort_state(game,unit,read_cache);
 if (state != null && #typeof(state) != 'Object') { throw Error('Invalid observed cooperation state'); }
 result.supported = true; result.reason = null;
 if (state != null) { result.state = #clone(state); }
 return result;
};
