return {

	navigate_base: (direction) => {
		if (this.base_id == null) {
			return false;
		}
		const owner_id = this.p.game.get_player().id;
		let current = null;
		let first = null;
		let last = null;
		let target = null;
		// get_bases() has no guaranteed order. Find numeric predecessors and
		// successors directly, so navigation is stable across native map order.
		for (base of this.p.game.get_bm().get_bases()) {
			if (base.get_owner().id == owner_id) {
				if (base.id == this.base_id) {
					current = base;
				}
				if (first == null || base.id < first.id) {
					first = base;
				}
				if (last == null || base.id > last.id) {
					last = base;
				}
				if (direction > 0 && base.id > this.base_id && (target == null || base.id < target.id)) {
					target = base;
				}
				if (direction < 0 && base.id < this.base_id && (target == null || base.id > target.id)) {
					target = base;
				}
			}
		}
		if (current == null) {
			return false;
		}
		if (target == null) {
			target = direction > 0 ? first : last;
		}
		if (target == null || target.id == current.id) {
			return false;
		}
		this.base_id = target.id;
		this.p.game.select_base(target);
		return true;
	},

	init: (p) => {

		this.p = p;
		this.base_id = null;

		this.frame = p.body.panel({
			class: 'default-panel',
			border: 'transparent',
			left: 263,
			top: 69,
			right: 263,
			bottom: 86,
		});

		const header = this.frame.panel({
			class: 'default-panel',
			align: 'top',
			top: 2,
			left: 4,
			right: 4,
			height: 41,
		});

		const header_title = header.panel({
			class: 'default-panel-inner',
			top: 3,
			bottom: 3,
			left: 25,
			right: 25,
		});

		this.basename = header_title.text({
			align: 'top center', // TODO: fix vertical centering
			top: 3,
			font: 'arialnb.ttf:28',
			color: 'rgb(137,166,166)',
			transform: 'uppercase',
		});

		p.ui.class('base-screen-bottombar-arrow').set({
			width: 20,
			height: 35,
			top: 3,
			sound: 'ok.wav',
		});
		// TODO: make _hover and _active work without class
		p.ui.class('base-screen-bottombar-arrow-left').extend('base-screen-bottombar-arrow').set({
			align: 'top left',
			left: 3,
			background: 'interface.pcx:crop(290,64,309,98)',
			_hover: {
				background: 'interface.pcx:crop(290,100,309,134)',
			},
			_active: {
				background: 'interface.pcx:crop(290,136,309,170)',
			},
		});
		const previous_base = header.button({
			class: 'base-screen-bottombar-arrow-left',
		});
		previous_base.on('click', (e) => {
			this.navigate_base(0 - 1);
			return true;
		});
		p.ui.class('base-screen-bottombar-arrow-right').extend('base-screen-bottombar-arrow').set({
			align: 'top right',
			right: 3,
			background: 'interface.pcx:crop(311,64,330,98)',
			_hover: {
				background: 'interface.pcx:crop(311,100,330,134)',
			},
			_active: {
				background: 'interface.pcx:crop(311,136,330,170)',
			},
		});
		const next_base = header.button({
			class: 'base-screen-bottombar-arrow-right',
		});
		next_base.on('click', (e) => {
			this.navigate_base(1);
			return true;
		});

		p.ui.class('base-screen-bottombar-pop').set({
			width: 38,
			height: 48,
			align: 'left',
			top: 3,
			bottom: 3,
		});

		this.pops = this.frame.panel({
			class: 'default-panel',
			align: 'bottom',
			bottom: 2,
			left: 4,
			right: 60,
			height: 54,
		});

		p.ui.class('base-screen-bottombar-nsbtn').set({
			align: 'center',
			width: 48,
			height: 48,
			sound: 'ok.wav',
			background: 'interface.pcx:crop(332,1,379,48)',
			_hover: {
				background: 'interface.pcx:crop(332,50,379,97)',
			},
			_active: {
				background: 'interface.pcx:crop(332,99,379,146)',
			},
		});
		const nerve_stapling_btn = this.frame.panel({
			class: 'default-panel',
			width: 54,
			height: 54,
			align: 'bottom right',
			bottom: 2,
			right: 4,
		}).button({
			class: 'base-screen-bottombar-nsbtn',
		});

	},

	set: (data) => {

		this.base_id = data.base.id;
		this.basename.text = data.name;

		// prepare classes with population images
		const renders = this.p.game.get_bm().get_pop_renders(data.owner);
		for (id in renders) {
			const variants = renders[id];
			for (i in variants) {
				const variant = variants[i];
				this.p.ui.class('base-screen-bottombar-pop-' + id + '-' + #to_string(i)).extend('base-screen-bottombar-pop').set({
					background: variants[i],
				});
			}
		}

		this.pops.clear();
		let left = 3;
		let shift = 40;
		for (pop of data.pops) {
			let variant = pop.variant;
			const pop_type = pop.get_type();
			if (!#is_defined(renders[pop_type][variant])) {
				variant = 0;
			}
			this.pops.surface({
				class: 'base-screen-bottombar-pop-' + pop_type + '-' + #to_string(variant),
				left: left,
			});
			left += shift;
		}

	},

};
