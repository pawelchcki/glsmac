// A shared presentation preflight; effects and targets stay authoritative in
// the primitive/automation event handlers. No future target is fabricated here.
const vocabulary = #include('./terraforming_actions');
const primitives = #include('./terraforming');
const is_plan = (action) => {
 for (entry of vocabulary.automation) { if (entry.id == action) { return true; } }
 return false;
};
return {
 is_plan: is_plan,
 validate_selection: (e) => {
  if (!is_plan(e.data.action)) { return primitives.validate_selection(e); }
  const request = {caller: e.caller, data: {unit_id: e.data.unit_id, command: e.data.action}}; request.game = e.game;
  const units = e.game.get_um();
  if (!units.has_unit(e.data.unit_id)) { return 'Terraform worker no longer exists'; }
  const unit = units.get_unit(e.data.unit_id);
  if (#typeof(unit.get_automation) != 'Callable') { return 'Native Terraform automation capability is unavailable'; }
  request.data.expected_epoch = unit.get_automation().epoch;
  return #include('./terraforming_automation').validate_selection(request);
 },
};
