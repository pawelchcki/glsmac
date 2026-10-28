// Test-only read adapter shared by native observer probes and the browser.
// Global recipe visibility and acceptance of one city's native quote differ.
return {
 quote_choices: (base,choices) => {
  const result = {by_id:{},ids:[]};
  for (choice of choices) {
   const id = choice.id + ''; const quote = {accepted:false,loss:null,reason:null};
   try { quote.loss = base.get_production_switch_loss(id); quote.accepted = true; }
   catch { : (failure) => { quote.reason = failure.reason + ''; } }
   // Meaningful post-catch validation/collection is required: a terminal
   // handled try in a GSE array loop can stop iteration prematurely.
   if (quote.accepted && (#typeof(quote.loss) != 'Int' || quote.loss < 0)) { throw Error('Invalid accepted native switch quote'); }
   if (!quote.accepted && (#typeof(quote.reason) != 'String' || #trim(quote.reason) == '')) { throw Error('Missing rejected native switch quote reason'); }
   result.by_id[id] = quote; result.ids :+ id;
  }
  return result;
 },
 weapon_profile: (rule,units,weapons) => {
  const source = rule.source_components; const prototype = source.prototype; const index = source.weapon;
  if (#typeof(prototype) != 'Int' || prototype < 0 || prototype + 1 >= #sizeof(units) ||
   #typeof(index) != 'Int' || index < 0 || index >= #sizeof(weapons)) { throw Error('Source weapon identity is outside actual native-loaded tables'); }
  const unit_index = prototype + 1; const unit_row = units[unit_index]; const weapon = weapons[index];
  if (#sizeof(unit_row) < 3 || #sizeof(weapon) < 4) { throw Error('Incomplete native-loaded unit/weapon row'); }
  const unit_token = #trim(unit_row[2] + ''); const weapon_token = #trim(weapon[1] + ''); const text = #trim(weapon[3] + '');
  let mode = null; try { mode = #to_int(text); } catch { : (failure) => { throw Error('Native-loaded weapon role is not an integer'); } }
  if (#to_string(mode) != text || unit_token == '' || unit_token != weapon_token || mode != rule.weapon_mode) { throw Error('Actual native-loaded unit/weapon linkage differs from parsed rule'); }
  return {prototype:prototype,weapon_index:index,unit_weapon:unit_token,weapon_shortname:weapon_token,weapon_mode:mode};
 },
};
