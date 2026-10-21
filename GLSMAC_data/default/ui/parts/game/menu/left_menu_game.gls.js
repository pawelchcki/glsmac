return {

	init: (p) => {
		for (header of p.menu.headers) {
			if (header.source != 'GAME') { continue; }
			const entries = header.entries;
			for (entry of entries) {
				if (#is_defined(entry.separator)) { continue; }
				// Explicit GLSMAC application map for the two existing actions.
				// The presentation observations do not verify original row effects.
				if (entry.source_index == 11) { entry.open = () => { p.maybe_quit(false); }; }
				if (entry.source_index == 12) { entry.open = () => { p.maybe_quit(true); }; }
			}
			return p.create(entries, p.menu.child_width);
		}
		throw Error('Missing installed Game menu definition');
	},

};
