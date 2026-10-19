// Completion restores the caller without applying cancellation scopes.
const pop_entry = (manager, m, reset, cancel) => {
	const last_entry = manager.data_stack :~;
	if (#is_defined(last_entry) && #is_defined(last_entry.data.destructor)) {
		last_entry.data.destructor();
	}
	// Completed setup can cancel through its named caller scope. Locate it
	// before unwinding so an absent scope preserves ordinary back behavior.
	if (cancel && #is_defined(last_entry) && #is_defined(last_entry.data.cancel_through)) {
		let scope_index = #sizeof(manager.data_stack) - 1;
		while (scope_index >= 0) {
			const previous = manager.data_stack[scope_index];
			if (#is_defined(previous.data.cancel_scope) && previous.data.cancel_scope == last_entry.data.cancel_through) {
				break;
			}
			scope_index--;
		}
		if (scope_index >= 0) {
			while (#sizeof(manager.data_stack) > scope_index) {
				const previous = manager.data_stack :~;
				if (#is_defined(previous.data.destructor)) {
					previous.data.destructor();
				}
			}
		}
	}
	// A multi-question controller cancels to its caller as one unit.
	if (cancel && #is_defined(last_entry) && #is_defined(last_entry.data.cancel_group)) {
		while (!#is_empty(manager.data_stack)) {
			const previous = manager.data_stack[#sizeof(manager.data_stack) - 1];
			if (!#is_defined(previous.data.cancel_group) || previous.data.cancel_group != last_entry.data.cancel_group) {
				break;
			}
			manager.data_stack :~;
			if (#is_defined(previous.data.destructor)) {
				previous.data.destructor();
			}
		}
	}
	if ( !#is_empty(manager.data_stack)) {
		const entry = manager.data_stack :~;
		manager.modules[entry.type].show(entry.data);
		if ( #is_defined( entry.index ) ) {
			manager.modules[entry.type].select(entry.index);
		}
	}
	else {
		if (reset) {
			m.glsmac.reset();
		} else {
			m.glsmac.exit();
		}
	}
};

const manager = {

	modules: {},
	data_stack: [],

	register: (type, module) => {
		this.modules[type] = module;
	},

	push: (type, data) => {
		this.data_stack :+ {
			type: type,
			data: data
		};
	},

	select: (index) => {
		this.data_stack[#sizeof(this.data_stack) - 1].index = index;
	},

	pop: (m, reset) => { pop_entry(this, m, reset, true); },

	complete: (m, reset) => { pop_entry(this, m, reset, false); },

	close: (m) => {
		let last_entry = this.data_stack :~;
		while ( #is_defined( last_entry ) ) {
			if ( #is_defined(last_entry.data.destructor) ) {
				last_entry.data.destructor();
			}
			last_entry = this.data_stack :~;
		}
	},

};

return (type, module) => {
	manager.register(type, module);
	return manager;
};

