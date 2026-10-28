// Test-only serial query protocol. Native frame handles remain with the caller;
// this queue owns only detached scalar request metadata and one pending slot.
return () => {
 const state = {next:0,pending:null};
 return {
  request: (owner) => {
   if (#typeof(owner.scope) != 'String' || (owner.scope != 'base' && owner.scope != 'production' && owner.scope != 'workshop') ||
    #typeof(owner.token) != 'Int' || owner.token < 1 || #typeof(owner.base_id) != 'Int' || owner.base_id < 1 ||
    #typeof(owner.owner_session) != 'Int' || owner.owner_session < 1 || #typeof(owner.source) != 'String') { throw Error('Invalid Workshop query owner'); }
   const scope = owner.scope + ''; const token = owner.token + 0; const base_id = owner.base_id + 0;
   const owner_session = owner.owner_session + 0; const source = owner.source + '';
   if (state.pending != null) {
    if (state.pending.scope != scope || state.pending.token != token || state.pending.base_id != base_id ||
     state.pending.owner_session != owner_session || state.pending.source != source) { throw Error('Conflicting Workshop query owner while capture is pending'); }
    state.pending.coalesced = state.pending.coalesced + 1; return false;
   }
   const next = state.next + 1; state.next = next;
   state.pending = {query:next,scope:scope,token:token,base_id:base_id,owner_session:owner_session,source:source,coalesced:0};
   return true;
  },
  peek: () => { return state.pending == null ? null : #clone(state.pending); },
  take: () => { const result = state.pending == null ? null : #clone(state.pending); state.pending = null; return result; },
 };
};
