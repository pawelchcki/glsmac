// The binding owns the same production InputState as ui::dom::Input.
// Raw key descriptors/clipboard replace platform delivery; focus and drawing
// are outside this buffer test. No Rename policy or original outcomes apply.
const behavior = #include('./_behavior');
const key = (state, code, printable, modifiers, clipboard) => {
 return state.key_down(code, printable, modifiers, clipboard);
};
behavior.scenario('native input assignment preserves exact text and independent buffers', () => {
 const a = test.input_state('  First  '); const b = test.input_state('Second');
 test.assert(a.get_value() == '  First  ' && b.get_value() == 'Second');
 test.assert(!a.set_value('  First  '));
 const text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 abcdefghijklmnopqrstuvwxyz';
 test.assert(a.set_value(text)); test.assert(a.get_value() == text);
 test.assert(b.get_value() == 'Second'); test.assert(a.set_value(''));
 test.assert(a.get_value() == '' && !a.set_value(''));
});
behavior.scenario('native input printable keys append and Backspace removes the last byte', () => {
 const state = test.input_state('A');
 test.assert(key(state, 'B', 'b', 0, '') == {handled: true, changed: true, submitted: false, value: 'Ab'});
 test.assert(key(state, 'SPACE', ' ', 0, '').value == 'Ab ');
 // Existing Input accepts printable events even with modifier bits set.
 test.assert(key(state, 'C', 'C', 7, '').value == 'Ab C');
 test.assert(key(state, 'BACKSPACE', '', 7, '').value == 'Ab ');
 test.assert(key(state, 'BACKSPACE', '', 0, '').value == 'Ab');
 state.set_value('');
 test.assert(key(state, 'BACKSPACE', '', 0, '') == {handled: true, changed: false, submitted: false, value: ''});
});
behavior.scenario('native input Enter submits unchanged state and unsupported keys fall through', () => {
 const state = test.input_state('Ready');
 test.assert(key(state, 'ENTER', '', 0, '') == {handled: true, changed: false, submitted: true, value: 'Ready'});
 test.assert(key(state, 'ENTER', '', 7, '').submitted);
 for (code of ['LEFT', 'RIGHT', 'HOME', 'END', 'ESCAPE', 'DELETE', 'INSERT']) {
  test.assert(key(state, code, '', 0, '') == {handled: false, changed: false, submitted: false, value: 'Ready'});
 }
 test.assert(state.get_value() == 'Ready');
});
behavior.scenario('native editor consumes printable map zoom letters as text with their exact case', () => {
 const state = test.input_state('');
 test.assert(key(state, 'X', 'x', 0, '') == {handled: true, changed: true, submitted: false, value: 'x'});
 test.assert(key(state, 'Z', 'z', 0, '').value == 'xz');
 test.assert(key(state, 'X', 'X', 1, '').value == 'xzX');
 test.assert(key(state, 'Z', 'Z', 1, '').value == 'xzXZ');
});
behavior.scenario('native input Shift Insert uses the production printable clipboard filter', () => {
 const state = test.input_state('Start:');
 // The existing native whitelist omits spaces and exclamation marks too.
 test.assert(key(state, 'INSERT', '', 1, ' A\nB\tC! ') == {handled: true, changed: true, submitted: false, value: 'Start:ABC'});
 test.assert(key(state, 'INSERT', '', 3, '\n\t') == {handled: true, changed: false, submitted: false, value: 'Start:ABC'});
 test.assert(key(state, 'INSERT', '', 0, 'ignored').value == 'Start:ABC');
 // Preserve the former switch fallthrough for a printable Insert descriptor.
 test.assert(key(state, 'INSERT', '?', 0, '').value == 'Start:ABC?');
});
behavior.scenario('native input result snapshots are detached and malformed raw keys cannot edit', () => {
 const state = test.input_state('Keep'); const snapshot = key(state, 'A', 'a', 0, '');
 snapshot.value = 'Edited snapshot'; test.assert(state.get_value() == 'Keepa');
 for (invalid of [['UNKNOWN', '', 0, ''], ['A', 'two', 0, ''], ['A', 'b', 8, '']]) {
  let rejected = false;
  try { state.key_down(invalid[0], invalid[1], invalid[2], invalid[3]); }
  catch { : (error) => { rejected = true; } }
  test.assert(rejected && state.get_value() == 'Keepa');
 }
});
behavior.scenario('optional native field maximum applies to assignment typing and paste while default stays unlimited', () => {
 const state = test.input_state('  Seed  ', 6);
 test.assert(state.get_value() == '  Seed');
 test.assert(key(state, 'A', 'a', 0, '') == {handled: true, changed: false, submitted: false, value: '  Seed'});
 key(state, 'BACKSPACE', '', 0, '');
 test.assert(key(state, 'A', 'a', 0, '').value == '  Seea');
 state.set_value('');
 test.assert(key(state, 'INSERT', '', 1, 'ABCDEFGHIJK').value == 'ABCDEF');
 test.assert(state.set_value('') && state.get_value() == '');
 const unlimited = test.input_state('ABCDEFGHIJK'); test.assert(unlimited.get_value() == 'ABCDEFGHIJK');
});
