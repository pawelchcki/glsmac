// Use the shared owned-node/event boundary, with native input focus order.
// This replaces drawing/hit testing only. Production callbacks own all changes.
const mocks = #include('./_ui_mocks');
return () => {
	const view = mocks.display();
	view.focused = null;
	view.focus = (node) => {
		if (node.kind == 'input' && !node.removed) { view.focused = node; }
	};
	const install = (node) => {
		if (node.kind == 'input' && view.focused == null) { view.focus(node); }
		const remove = node.remove;
		node.remove = () => {
			remove();
			if (view.focused != null && view.focused.removed) {
				view.focused = null;
				for (field of view.live('input')) {
					if (view.focused == null) { view.focus(field); }
				}
			}
		};
		for (tag of ['area', 'panel', 'window', 'surface', 'text', 'input', 'button', 'scrollview', 'listview', 'choicelist', 'widget', 'sound']) {
			if (#is_defined(node[tag]) && #typeof(node[tag]) == 'Callable') {
				const factory = node[tag];
				node[tag] = (props) => { const child = factory(props); install(child); return child; };
			}
		}
	};
	install(view.root);
	return view;
};
