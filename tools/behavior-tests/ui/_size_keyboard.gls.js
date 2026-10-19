// Native Input consumes Enter and emits input before parent OK key handling.
// The callback and validation belong to the shipped dimension dialog.
for (input of size_inputs) {
	try {
		const f = fixture();
		steps.main(f.i); f.flush();
		for (label of ['START GAME', input.route == 'random' ? 'MAKE RANDOM MAP' : 'CUSTOMIZE RANDOM MAP', 'CUSTOM SIZE']) {
			if (!f.choose(label)) { throw Error('Cannot reach map-size dialog'); }
		}
		const windows = f.view.live('window');
		if (#sizeof(windows) != 1) { throw Error('Expected one dimension dialog'); }
		if (input.key == 'Enter') {
			const fields = f.view.live('input');
			if (#sizeof(fields) != 2) { throw Error('Expected two dimension inputs'); }
			(fields[0]).emit('input', {});
		} else {
			(windows[0]).emit('keydown', { code: 'ESCAPE', modifiers: {} });
		}
		f.flush();
		const stack = f.manager.data_stack;
		if ((stack[#sizeof(stack) - 1]).type == 'popup') {
			#print('SIZE_POPUP|' + input.id);
		} else {
			#print('HUI_CASE|' + input.id);
			emit_menu(f);
			#print('HUI_DONE|true');
		}
		f.view.root.remove();
	} catch { : (e) => {
		#print('HUI_CASE|' + input.id);
		#print('HUI_ERROR|' + e.type + '|' + e.reason);
	} }
}
