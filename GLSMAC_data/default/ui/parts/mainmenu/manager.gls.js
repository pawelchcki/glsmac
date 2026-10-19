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

	pop: (m, reset) => {
		const last_entry = this.data_stack :~;
		if (#is_defined(last_entry) && #is_defined(last_entry.data.destructor)) {
			last_entry.data.destructor();
		}
		// A multi-question controller cancels to its caller as one unit.
		if (#is_defined(last_entry) && #is_defined(last_entry.data.cancel_group)) {
			while (!#is_empty(this.data_stack)) {
				const previous = this.data_stack[#sizeof(this.data_stack) - 1];
				if (!#is_defined(previous.data.cancel_group) || previous.data.cancel_group != last_entry.data.cancel_group) {
					break;
				}
				this.data_stack :~;
				if (#is_defined(previous.data.destructor)) {
					previous.data.destructor();
				}
			}
		}
		if ( !#is_empty(this.data_stack)) {
			const entry = this.data_stack :~;
			this.modules[entry.type].show(entry.data);
			if ( #is_defined( entry.index ) ) {
				this.modules[entry.type].select(entry.index);
			}
		}
		else {
			if (reset) {
				m.glsmac.reset();
			} else {
				m.glsmac.exit();
			}
		}
	},

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

