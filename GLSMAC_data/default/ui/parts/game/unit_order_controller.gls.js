// Temporary value-only UI adapter. Native wrappers, callback tokens and effects
// remain local; migrated matching/selection policy is authored only in TS.
return {
 match:(pending,e,owner) => {
  let saved = null;
  if (pending != null) {
   saved = {name:pending.name + '',unit_id:pending.unit_id + 0,
    action:#typeof(pending.action) == 'String' ? pending.action + '' : null,
    command:#typeof(pending.command) == 'String' ? pending.command + '' : null};
  }
  const data = #typeof(e.data) == 'Object' ? e.data : {};
  const event = {name:#typeof(e.name) == 'String' ? e.name + '' : null,
   caller:#typeof(e.caller) == 'Int' ? e.caller + 0 : null,
   unit_id:#typeof(data.unit_id) == 'Int' ? data.unit_id + 0 : null,
   action:#typeof(data.action) == 'String' ? data.action + '' : null,
   command:#typeof(data.command) == 'String' ? data.command + '' : null,
   success:#typeof(e.success) == 'Bool' ? e.success : null};
  return #js_call('ui/unit-orders','match',{schema:1,pending:saved,owner:owner + 0,event:event});
 },
 selection:(name,id,selected,focus,package_id) => {
  return #js_call('ui/unit-orders','selection',{schema:1,name:name + '',unit_id:id + 0,
   selected:#typeof(selected) == 'Int' ? selected + 0 : null,
   focus:#typeof(focus) == 'Int' ? focus + 0 : null},package_id);
 },
 activation:(id,preview,request) => {
  // Do not observe a retired/inactive world or an invalid callback payload.
  if (#typeof(id) != 'Int' || !preview.is_turn_active || preview.order_pending != null ||
   preview.founding_pending_id != null || preview.p.modules.popup.is_shown()) { return false; }
  return #js_call('ui/unit-orders','activationGate',{schema:1,choice:id + 0,turn_active:preview.is_turn_active,
   pending:preview.order_pending != null,founding_pending:preview.founding_pending_id != null,popup:preview.p.modules.popup.is_shown(),
   turn:preview.p.game.get_turn() + 0,owner:preview.p.game.get_player().id + 0,
   selected:#typeof(preview.selected_unit_id) == 'Int' ? preview.selected_unit_id + 0 : null,
   focus:#typeof(preview.order_focus_id) == 'Int' ? preview.order_focus_id + 0 : null,
   request_turn:request.turn + 0,request_owner:request.owner + 0,
   request_selected:#typeof(request.selected) == 'Int' ? request.selected + 0 : null,
   request_focus:request.focus + 0}).accepted;
 },
 close_menu:(success,root_open,child_open,popup,package_id) => {
  return #js_call('ui/unit-orders','closeMenu',{schema:1,success:success,root_open:root_open,child_open:child_open,popup:popup},package_id).accepted;
 },
};
