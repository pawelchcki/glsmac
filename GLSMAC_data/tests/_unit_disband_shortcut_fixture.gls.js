// Declared keyboard input, through mounted child-first panel routing. No
// controller call, dialog, selection, menu state or native outcome is supplied.
const prepare = #include('./_unit_disband_fixture');
return (input) => {
	const f = prepare(input); const action = f.action;
	f.key = (code, modifiers) => {
		const event = {code: code, modifiers: modifiers};
		let modal = null; let handled = false;
		for (node of f.view.live('window')) { if (node.is_visible()) { if (modal != null) { throw Error('Ambiguous mounted keyboard modal'); } modal = node; } }
		if (modal != null) { handled = modal.emit('keydown', event) == true; }
		if (!handled) { handled = f.preview.frame.emit('keydown', event) == true; }
		f.flush(); return handled;
	};
	f.action = (requested) => {
		if (requested == 'disband-shortcut') { f.key('D', {shift: true}); }
		else { action(requested); }
	};
	return f;
};
