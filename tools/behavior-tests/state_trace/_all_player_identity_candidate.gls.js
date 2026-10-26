// Native display/event transport and synthetic equivalent source records are
// controlled boundaries. Actual faction controls, State participant creation,
// production world startup and all native per-player identities execute.
const behavior = #include('./_behavior');
behavior.scenario('all native player identities after production confirmation and world startup', () => {
 const input = identity_input;
 const native = test.natural_startup_fixture(40, 80, 'flat-arid');
 const text = #include('./_startup_faction_sources_fixture')({});
 #include('./_natural_startup_mechanics')(native, text);
 const f = #include('./_ui_mocks').menu_popup();
 f.m.popup = f.popup; f.m.settings = native.game.get_settings(); f.m.smac_data = text.bundle;
 f.m.glsmac.game = {get_fm: () => { return native.fm; }};
 let started = false;
 f.m.glsmac.start_game = (id, identity, roster) => {
  test.assert(!started, 'Exactly one actual start request');
  native.initialize_roster(id, roster, identity); native.start_world(); started = true;
 };
 const click = (name, ordinal) => {
  let count = 0;
  for (button of f.view.live('button')) {
   for (part of #split(button.class, ' ')) {
    if (part == name) {
     if (count == ordinal) { return button.emit('click', {}); }
     count++;
    }
   }
  }
  throw Error('Missing actual identity control: ' + name);
 };
 #include('../default/ui/parts/mainmenu/steps/select_faction')(f.m);
 click('faction-preset-base', 0);
 for (edit of input.roster_edits) {
  click('faction-dropdown', edit.slot);
  const lists = f.view.live('choicelist'); test.assert(#sizeof(lists) == 1);
  const list = lists[0]; const selected = list.items[edit.option][0];
  list.value = selected; list.emit('select', {value: selected});
 }
 click('faction-row', input.selected_row); click('popup-button', 2);
 const fields = f.view.live('input'); test.assert(#sizeof(fields) == 1, 'Actual Name editor');
 fields[0].value = input.leader_name + ''; fields[0].emit('change', {value: input.leader_name + ''});
 fields[0].emit('input', {});
 test.assert(started && #sizeof(native.game.get_players()) == 7 && #sizeof(native.game.bm.get_bases()) == 7,
  'The actual start request must create all seven participants and their worlds');
 const files = {};
 for (definition of #include('../default/factions').source_catalog()) { files[definition.id] = #uppercase(definition.file); }
 #print('ALLIDENTITY_BEGIN');
 for (player of native.game.get_players()) {
  const faction = player.get_faction(); const source = files[faction.id];
  test.assert(#is_defined(source) && #sizeof(faction.identity) == 6);
  #print('ALLIDENTITY_PLAYER|' + #to_string(player.id + 1) + '|' + source + '|' + #to_string(player.type == 'human'));
  let index = 0;
  for (value of faction.identity) { #print('ALLIDENTITY_FIELD|' + #to_string(index) + '|' + value); index++; }
  #print('ALLIDENTITY_ENDPLAYER');
 }
 #print('ALLIDENTITY_COMPLETE');
 f.view.root.remove();
});
